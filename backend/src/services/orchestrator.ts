import path from "path";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { canUseFreeCheck, isSubscribed } from "./users.js";
import { extractFoodIngredients, generateFoodReply, runGluciTurn } from "./llm.js";
import {
  calculateMealGlucose,
  estimatePortions,
  fallbackGlucoseCalculation,
} from "./glucoseCalculator.js";
import { lookupBarcode } from "./openFoodFacts.js";
import { renderShareCard, saveUploadBase64 } from "./shareCard.js";
import { getConversationForUser } from "./conversationService.js";
import { ensureShareRef } from "./shareRef.js";
import { logAnalytics } from "./analytics.js";
import { findRelevantKnowledge } from "./knowledgeBase.js";

function stripBarcodeAnnotations(text: string): string {
  return text
    .replace(/\n\n\[Barcode[^\]]*\]/gi, "")
    .replace(/\n\n\[Product data from barcode[^\]]*\]/gi, "")
    .trim();
}

function summarizeFoodInput(text: string): string {
  const s = stripBarcodeAnnotations(text).trim();
  return s.slice(0, 400);
}

/** Text suitable for embedding search — skips greetings and generic vision prompts. */
function extractFoodDescription(text: string): string | null {
  const t = stripBarcodeAnnotations(text).trim();
  if (!t || t.length < 4) return null;
  if (/^(hi!?|hello\b)/i.test(t)) return null;
  if (/^please analyze the attached image\.?$/i.test(t.trim())) return null;
  return t.slice(0, 800);
}

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
  shareLandingUrl?: string;
  userImageUrl?: string;
  paywall?: { message: string; checkoutUrl?: string };
  food?: string;
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
      shareLandingUrl: undefined,
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

  let userImageFilename: string | undefined;
  if (params.imageBase64 && params.mimeType) {
    userImageFilename = await saveUploadBase64(params.imageBase64, params.mimeType);
  }

  await prisma.message.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId,
      role: "user",
      content: enriched || (userImageFilename ? "" : "(image)"),
      imageUrl: userImageFilename ?? null,
      metadata: JSON.stringify({ channel: params.channel, hasImage: Boolean(params.imageBase64) }),
    },
  });
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { updatedAt: new Date() },
  });

  const llmUserText = enriched || "Please analyze the attached image.";

  let structured: Awaited<ReturnType<typeof runGluciTurn>>;
  let foodLabel: string | undefined;

  let extraction: Awaited<ReturnType<typeof extractFoodIngredients>> = { intent: "chat" };
  try {
    extraction = await extractFoodIngredients({
      userText: llmUserText,
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
    });
  } catch (e) {
    console.warn("extractFoodIngredients:", e);
    extraction = { intent: "chat" };
  }

  if (
    extraction.intent === "meal" &&
    extraction.ingredients.length > 0 &&
    !params.barcode
  ) {
    const meal = extraction;
    foodLabel = meal.foodName.trim() || summarizeFoodInput(enriched || llmUserText) || undefined;
    const ingredients = estimatePortions(meal.ingredients);
    let calculation = fallbackGlucoseCalculation();
    try {
      calculation = await calculateMealGlucose(ingredients);
    } catch (e) {
      console.warn("calculateMealGlucose:", e);
      calculation = fallbackGlucoseCalculation();
    }

    let knowledge: Awaited<ReturnType<typeof findRelevantKnowledge>> = [];
    try {
      knowledge = await findRelevantKnowledge(meal.foodName, 3);
    } catch (e) {
      console.warn("findRelevantKnowledge (meal):", e);
    }

    const { message, tip } = await generateFoodReply(meal.foodName, calculation, knowledge);

    const verdictCap = calculation.verdict.charAt(0).toUpperCase() + calculation.verdict.slice(1);
    structured = {
      userReply: message,
      glucoseGalScore: calculation.score,
      verdict: verdictCap,
      intent: "meal",
      countAsDecision: true,
      suggestShareCard: true,
      glucoseCurve: calculation.curvePoints,
      tip,
      mealGI: calculation.mealGI,
      mealGL: calculation.mealGL,
      confidence: calculation.confidence,
    };
  } else {
    let knowledgeContext: Awaited<ReturnType<typeof findRelevantKnowledge>> = [];
    try {
      const fd = extractFoodDescription(llmUserText);
      if (fd) {
        knowledgeContext = await findRelevantKnowledge(fd, 3);
      }
    } catch (e) {
      console.warn("findRelevantKnowledge:", e);
    }

    structured = await runGluciTurn({
      userText: llmUserText,
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
      history,
      profileContext: profileToContext(profile),
      knowledgeContext,
    });
    foodLabel = summarizeFoodInput(enriched || llmUserText) || undefined;
  }

  let shareCardUrl: string | undefined;
  let shareLandingUrl: string | undefined;
  /** Share card for any counted food decision (LLM often omits suggestShareCard). */
  const shouldRenderShareCard =
    structured.countAsDecision &&
    structured.intent !== "general" &&
    structured.verdict.trim().toLowerCase() !== "subscribe";
  if (shouldRenderShareCard) {
    const shareRef = await ensureShareRef(user.id);
    const baseUrl = cfg.PUBLIC_BASE_URL.replace(/\/$/, "");
    shareLandingUrl = `${baseUrl}/r/${shareRef}`;
    const heroAbs = userImageFilename ? path.join(process.cwd(), "data", "uploads", userImageFilename) : undefined;
    const card = await renderShareCard({
      score: structured.glucoseGalScore,
      verdict: structured.verdict,
      insight: structured.userReply.slice(0, 400),
      subtitle: `Join Gluci: ${shareLandingUrl}`,
      heroImagePath: heroAbs,
      glucoseCurve: structured.glucoseCurve,
      foodName: foodLabel,
    });
    shareCardUrl = card.relativeUrl;
    void logAnalytics({
      userId: user.id,
      name: "share_card_generated",
      properties: { intent: structured.intent, hasHero: Boolean(heroAbs) },
      source: params.channel,
    });
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
        glucoseCurve: structured.glucoseCurve ?? null,
        tip: structured.tip ?? null,
        food: foodLabel,
        ...(structured.mealGI !== undefined ? { mealGI: structured.mealGI } : {}),
        ...(structured.mealGL !== undefined ? { mealGL: structured.mealGL } : {}),
        ...(structured.confidence ? { confidence: structured.confidence } : {}),
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
    void logAnalytics({
      userId: params.userId,
      name: "food_decision_completed",
      properties: { intent: structured.intent, score: structured.glucoseGalScore },
      source: params.channel,
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

  const base = cfg.PUBLIC_BASE_URL.replace(/\/$/, "");
  return {
    reply: finalReply,
    structured,
    shareCardUrl,
    shareLandingUrl,
    userImageUrl: userImageFilename ? `${base}/static/uploads/${userImageFilename}` : undefined,
    food: foodLabel,
  };
}
