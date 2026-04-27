import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { canUseFreeCheck, isSubscribed } from "./users.js";
import { runGluciTurn } from "./llm.js";
import { lookupBarcode } from "./openFoodFacts.js";
import { renderShareCard } from "./shareCard.js";
import { getConversationForUser } from "./conversationService.js";

function profileToContext(profile: { goal: string | null; dietaryJson: string | null; memoryJson: string | null }) {
  const parts: string[] = [];
  if (profile.goal) parts.push(`Primary goal: ${profile.goal}`);
  if (profile.dietaryJson) parts.push(`Dietary JSON: ${profile.dietaryJson}`);
  if (profile.memoryJson) parts.push(`Memory JSON: ${profile.memoryJson}`);
  return parts.join("\n") || "(No profile yet—ask onboarding questions if needed.)";
}

export async function handleChatTurn(params: {
  userId: string;
  /** Required for app channel; set automatically for Telegram / WhatsApp */
  conversationId: string;
  text?: string;
  imageBase64?: string;
  mimeType?: string;
  barcode?: string;
  channel: "app" | "telegram" | "whatsapp";
}): Promise<{
  reply: string;
  structured: Awaited<ReturnType<typeof runGluciTurn>>;
  shareCardUrl?: string;
  paywall?: { message: string; checkoutUrl?: string };
}> {
  const cfg = getConfig();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: params.userId },
    include: { profile: true },
  });
  const profile = user.profile ?? (await prisma.profile.create({ data: { userId: user.id } }));
  const conv = await getConversationForUser(user.id, params.conversationId);
  if (!conv) throw new Error("Conversation not found");

  if (!canUseFreeCheck(user, cfg.FREE_DECISIONS_LIMIT)) {
    const msg = `You've used your ${cfg.FREE_DECISIONS_LIMIT} free food decisions. Subscribe to keep going with Gluci.`;
    let checkoutUrl: string | undefined;
    if (cfg.STRIPE_SECRET_KEY && cfg.STRIPE_PRICE_ID && params.channel !== "app") {
      try {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(cfg.STRIPE_SECRET_KEY);
        let customerId = user.stripeCustomerId ?? undefined;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: user.email ?? undefined,
            metadata: { userId: user.id },
          });
          customerId = customer.id;
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: customer.id },
          });
        }
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          line_items: [{ price: cfg.STRIPE_PRICE_ID, quantity: 1 }],
          customer: customerId,
          success_url: `${cfg.PUBLIC_BASE_URL}/v1/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${cfg.PUBLIC_BASE_URL}/v1/billing/cancel`,
          client_reference_id: user.id,
          metadata: { userId: user.id, channel: params.channel },
          allow_promotion_codes: true,
        });
        checkoutUrl = session.url ?? undefined;
      } catch (e) {
        console.warn("paywall checkout creation failed", e);
      }
    }
    const replyWithLink = checkoutUrl ? `${msg}\n\nUpgrade here: ${checkoutUrl}` : msg;
    return {
      reply: replyWithLink,
      structured: {
        userReply: replyWithLink,
        glucoseGalScore: 0,
        verdict: "Subscribe",
        intent: "general",
        countAsDecision: false,
        suggestShareCard: false,
      },
      paywall: {
        message: msg,
        checkoutUrl,
      },
    };
  }

  let enriched = params.text?.trim() ?? "";
  if (params.barcode) {
    const off = await lookupBarcode(params.barcode);
    if (off) {
      enriched += `\n\n[Product data from barcode ${params.barcode}: ${off.name}${off.brands ? ` (${off.brands})` : ""}]`;
    } else {
      enriched += `\n\n[Barcode ${params.barcode}: no Open Food Facts match—use general guidance.]`;
    }
  }
  if (!enriched && !params.imageBase64) enriched = "Hi! What are you eating next? Send a photo, restaurant name, menu question, or grocery item.";

  const historyRows = await prisma.message.findMany({
    where: { userId: params.userId, conversationId: params.conversationId },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const history = historyRows.map((m) =>
    m.role === "user"
      ? ({ role: "user" as const, content: m.content })
      : ({ role: "assistant" as const, content: m.content }),
  );

  await prisma.message.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId,
      role: "user",
      content: enriched || "(image)",
      metadata: JSON.stringify({ channel: params.channel, hasImage: Boolean(params.imageBase64) }),
    },
  });
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { updatedAt: new Date() },
  });

  const structured = await runGluciTurn({
    userText: enriched || "Please analyze the attached image.",
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
    history,
    profileContext: profileToContext(profile),
  });

  let shareCardUrl: string | undefined;
  if (structured.suggestShareCard && structured.countAsDecision) {
    const card = await renderShareCard({
      score: structured.glucoseGalScore,
      verdict: structured.verdict,
      insight: structured.userReply.slice(0, 400),
    });
    shareCardUrl = card.relativeUrl;
  }

  const finalReply = structured.userReply;

  await prisma.message.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId,
      role: "assistant",
      content: finalReply,
      metadata: JSON.stringify({
        score: structured.glucoseGalScore,
        verdict: structured.verdict,
        intent: structured.intent,
        shareCardUrl,
      }),
    },
  });
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { updatedAt: new Date() },
  });

  if (structured.countAsDecision && !isSubscribed(user)) {
    await prisma.user.update({
      where: { id: params.userId },
      data: { freeChecksUsed: { increment: 1 } },
    });
    await prisma.usageEvent.create({
      data: {
        userId: params.userId,
        type: structured.intent,
        score: structured.glucoseGalScore,
        verdict: structured.verdict,
      },
    });
  }

  // Lightweight memory update (MVP): append last verdict to memoryJson
  try {
    const mem = profile.memoryJson ? JSON.parse(profile.memoryJson) : { notes: [] as string[] };
    if (structured.countAsDecision) {
      mem.notes = [...(mem.notes ?? []).slice(-19), `${structured.intent}: ${structured.verdict} (${structured.glucoseGalScore})`];
      await prisma.profile.update({
        where: { userId: params.userId },
        data: { memoryJson: JSON.stringify(mem) },
      });
    }
  } catch {
    /* ignore */
  }

  return { reply: finalReply, structured, shareCardUrl };
}
