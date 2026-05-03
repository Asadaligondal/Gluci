import path from "path";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { canUseFreeCheck, isSubscribed } from "./users.js";
import {
  DEFAULT_GLICI_REPLY,
  checkScoreReasonability,
  extractFoodIngredients,
  generateFoodReply,
  runGluciTurn,
} from "./llm.js";
import {
  calculateMealGlucose,
  applyRAGAdjustment,
  estimatePortions,
  fallbackGlucoseCalculation,
} from "./glucoseCalculator.js";
import { lookupBarcode, type OffProduct } from "./openFoodFacts.js";
import { renderShareCard, saveUploadBase64 } from "./shareCard.js";
import { getConversationForUser } from "./conversationService.js";
import { ensureShareRef } from "./shareRef.js";
import { logAnalytics } from "./analytics.js";
import { findRelevantKnowledge, extractGlucoseHint } from "./knowledgeBase.js";

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

function safeReply(text: unknown): string {
  if (text === null || text === undefined) return DEFAULT_GLICI_REPLY;
  const str = String(text).trim();
  if (str.length < 2) return DEFAULT_GLICI_REPLY;
  return str;
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
  if (profile.goal) parts.push(`Goal: ${profile.goal}`);

  if (profile.dietaryJson) {
    try {
      const d = JSON.parse(profile.dietaryJson) as Record<string, unknown>;
      if (d.allergies) parts.push(`Allergies/Avoid: ${d.allergies}`);
      if (d.preferences) parts.push(`Preferences: ${d.preferences}`);
    } catch {
      parts.push(`Dietary info: ${profile.dietaryJson}`);
    }
  }

  if (profile.memoryJson) {
    try {
      const m = JSON.parse(profile.memoryJson) as { notes?: string[] };
      if (m.notes && m.notes.length > 0) {
        parts.push(`Recent food decisions: ${m.notes.slice(-5).join(", ")}`);
      }
    } catch {
      /* ignore malformed memory */
    }
  }

  return parts.length > 0 ? parts.join("\n") : "(No profile yet—ask onboarding questions if needed.)";
}

// ── Barcode helpers ──────────────────────────────────────────────────────────

function isFoodProduct(product: OffProduct): boolean {
  const searchText = [product.name, product.category, product.categories]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const NON_FOOD_KEYWORDS = [
    "shampoo", "conditioner", "soap", "detergent", "cleaning", "bleach",
    "disinfectant", "sanitizer", "toothpaste", "mouthwash", "deodorant",
    "perfume", "cologne", "lotion", "cream", "moisturizer", "sunscreen",
    "makeup", "lipstick", "mascara", "medicine", "medication", "tablet",
    "capsule", "supplement", "vitamin", "pharmaceutical", "battery",
    "charger", "cable", "electronic", "toy", "game", "book", "stationery",
    "pen", "paper", "plastic", "rubber", "metal", "pet food", "dog food",
    "cat food", "animal",
  ];

  for (const kw of NON_FOOD_KEYWORDS) {
    if (searchText.includes(kw)) return false;
  }

  if (product.nutrients) {
    const { calories, carbs } = product.nutrients;
    if ((calories !== null && calories > 0) || carbs !== null) return true;
  }

  const FOOD_KEYWORDS = [
    "food", "beverage", "drink", "snack", "meal", "grocery", "edible",
    "nutrition", "calorie", "protein", "carbohydrate", "fat", "sugar",
    "cereal", "bread", "meat", "dairy", "fruit", "vegetable", "sauce",
    "condiment", "spice", "candy", "chocolate", "biscuit", "cookie",
    "juice", "water", "milk", "cheese", "yogurt", "rice", "pasta",
    "noodle", "soup", "oil",
  ];

  for (const kw of FOOD_KEYWORDS) {
    if (searchText.includes(kw)) return true;
  }

  if (product.categories && product.categories.length > 0) return true;
  return true; // OFF product without category = assume food
}

function estimateGIFromNutrients(
  nutrients: NonNullable<OffProduct["nutrients"]>,
  product: OffProduct,
): number {
  const carbs = nutrients.carbs ?? 0;
  const sugars = nutrients.sugars ?? 0;
  const fiber = nutrients.fiber ?? 0;
  const protein = nutrients.protein ?? 0;
  const fat = nutrients.fat ?? 0;

  const sugarRatio = carbs > 0 ? sugars / carbs : 0;
  const fiberAdj = Math.min(fiber * 2, 20);

  let gi =
    carbs > 70 ? 70
    : carbs > 50 ? 60
    : carbs > 30 ? 50
    : carbs > 15 ? 40
    : carbs > 5 ? 25
    : 10;

  gi += sugarRatio * 20;
  gi -= fiberAdj;
  if (protein > 10) gi -= 8;
  if (fat > 10) gi -= 5;

  const name = (product.name ?? "").toLowerCase();
  if (name.includes("diet") || name.includes("zero") || name.includes("light")) gi -= 10;
  if (name.includes("whole grain") || name.includes("wholemeal")) gi -= 8;

  return Math.max(5, Math.min(90, Math.round(gi)));
}

function extractIngredientsFromProduct(product: OffProduct): {
  name: string;
  portionGrams: number;
  giValue?: number;
  carbsPer100g?: number;
}[] {
  const servingSize = product.servingSize ?? 100;

  if (product.nutrients?.carbs != null) {
    return [
      {
        name: product.name,
        portionGrams: servingSize,
        carbsPer100g: product.nutrients.carbs,
        giValue: estimateGIFromNutrients(product.nutrients, product),
      },
    ];
  }

  const ingredients: { name: string; portionGrams: number; giValue?: number; carbsPer100g?: number }[] = [
    { name: product.name, portionGrams: servingSize },
  ];

  if (product.ingredients_text) {
    const mainIngredient = product.ingredients_text.split(",")[0].trim().toLowerCase();
    if (mainIngredient && mainIngredient !== product.name.toLowerCase()) {
      ingredients.push({ name: mainIngredient, portionGrams: Math.round(servingSize * 0.6) });
    }
  }

  return ingredients;
}

// ── Wider intent type so barcodes can signal non-food / unknown states ────────
type TurnStructured = Omit<Awaited<ReturnType<typeof runGluciTurn>>, "intent"> & {
  intent: string;
  ragAdjusted?: boolean;
  ragSource?: string;
};

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
  structured: TurnStructured;
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
  const profileCtx = profileToContext(profile);
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
    const paywallReply = safeReply(replyWithLink);
    return {
      reply: paywallReply,
      structured: {
        userReply: paywallReply,
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
  let barcodeProduct: OffProduct | null | undefined; // undefined = no barcode, null = not found
  if (params.barcode) {
    const off = await lookupBarcode(params.barcode);
    barcodeProduct = off;
    if (off) {
      enriched += `\n\n[Product data from barcode ${params.barcode}: ${off.name}${off.brand ? ` (${off.brand})` : ""}]`;
    } else {
      enriched += `\n\n[Barcode ${params.barcode}: product not found in Open Food Facts]`;
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

  let structured: TurnStructured;
  let foodLabel: string | undefined;
  let productImageUrl: string | undefined;

  if (params.barcode) {
    // ── Barcode path ─────────────────────────────────────────────────────────
    if (!barcodeProduct) {
      // Not found in Open Food Facts
      structured = {
        userReply:
          "I couldn't find this product in our database. It might be a local or unlisted product. Try taking a photo of the food instead!",
        glucoseGalScore: 0,
        verdict: "General",
        intent: "unknown_barcode",
        countAsDecision: false,
        suggestShareCard: false,
      };
    } else if (!isFoodProduct(barcodeProduct)) {
      // Non-food product
      foodLabel = barcodeProduct.name;
      structured = {
        userReply: `"${barcodeProduct.name}" doesn't appear to be a food or drink product. I can only analyze foods and beverages for glucose impact. Try scanning a food item instead!`,
        glucoseGalScore: 0,
        verdict: "General",
        intent: "non_food_barcode",
        countAsDecision: false,
        suggestShareCard: false,
      };
    } else {
      // Food product — route through hybrid pipeline (same as photo path)
      foodLabel = barcodeProduct.name;
      productImageUrl = barcodeProduct.imageUrl ?? undefined;
      const ingredients = extractIngredientsFromProduct(barcodeProduct);
      let calculation = fallbackGlucoseCalculation();
      try {
        calculation = await calculateMealGlucose(ingredients);
      } catch (e) {
        console.warn("calculateMealGlucose (barcode):", e);
      }

      let knowledge: Awaited<ReturnType<typeof findRelevantKnowledge>> = [];
      try {
        knowledge = await findRelevantKnowledge(barcodeProduct.name, 3);
      } catch (e) {
        console.warn("findRelevantKnowledge (barcode):", e);
      }

      const ragHint = extractGlucoseHint(knowledge);
      const finalCalc = applyRAGAdjustment(calculation, ragHint);
      const { message, tip } = await generateFoodReply(barcodeProduct.name, finalCalc, knowledge, profileCtx);
      const verdictCap = finalCalc.verdict.charAt(0).toUpperCase() + finalCalc.verdict.slice(1);
      // Real OFF nutrient data beats our GI lookup → confidence is high
      const confidence = barcodeProduct.nutrients?.carbs != null ? ("high" as const) : finalCalc.confidence;

      structured = {
        userReply: message,
        glucoseGalScore: finalCalc.score,
        verdict: verdictCap,
        intent: "meal",
        countAsDecision: true,
        suggestShareCard: true,
        glucoseCurve: finalCalc.curvePoints,
        tip,
        mealGI: finalCalc.mealGI,
        mealGL: finalCalc.mealGL,
        confidence,
        ragAdjusted: ragHint.hasHint,
        ragSource: ragHint.source || undefined,
      };
    }
  } else {
    // ── Normal photo / text path (unchanged) ─────────────────────────────────
    let extraction: Awaited<ReturnType<typeof extractFoodIngredients>> = { intent: "chat" };
    try {
      extraction = await extractFoodIngredients({
        userText: llmUserText,
        imageBase64: params.imageBase64,
        mimeType: params.mimeType,
        profileContext: profileCtx,
      });
    } catch (e) {
      console.warn("extractFoodIngredients:", e);
      extraction = { intent: "chat" };
    }

    if (extraction.intent === "meal" && extraction.ingredients.length > 0) {
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

      const ragHint = extractGlucoseHint(knowledge);
      let finalCalc = applyRAGAdjustment(calculation, ragHint);

      // LLM sanity check — catches formula outliers like salmon scoring 1.0
      try {
        const sanity = await checkScoreReasonability(
          meal.foodName,
          meal.ingredients,
          finalCalc.score,
          finalCalc.verdict,
        );
        if (sanity.shouldAdjust) {
          console.log("[llm-sanity]", sanity);
          finalCalc = { ...finalCalc, score: sanity.adjustedScore, verdict: sanity.adjustedVerdict };
        }
      } catch (e) {
        console.warn("checkScoreReasonability:", e);
      }

      const { message, tip } = await generateFoodReply(meal.foodName, finalCalc, knowledge, profileCtx);
      const verdictCap = finalCalc.verdict.charAt(0).toUpperCase() + finalCalc.verdict.slice(1);
      structured = {
        userReply: message,
        glucoseGalScore: finalCalc.score,
        verdict: verdictCap,
        intent: "meal",
        countAsDecision: true,
        suggestShareCard: true,
        glucoseCurve: finalCalc.curvePoints,
        tip,
        mealGI: finalCalc.mealGI,
        mealGL: finalCalc.mealGL,
        confidence: finalCalc.confidence,
        ragAdjusted: ragHint.hasHint,
        ragSource: ragHint.source || undefined,
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
        profileContext: profileCtx,
        knowledgeContext,
      });
      foodLabel = summarizeFoodInput(enriched || llmUserText) || undefined;
    }
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
    const isSupabaseUrl = userImageFilename?.startsWith("http");
    const heroAbs = (userImageFilename && !isSupabaseUrl) ? path.join(process.cwd(), "data", "uploads", userImageFilename) : undefined;
    const heroUrl = (userImageFilename && isSupabaseUrl) ? userImageFilename : undefined;
    const card = await renderShareCard({
      score: structured.glucoseGalScore,
      verdict: structured.verdict,
      insight: structured.userReply.slice(0, 400),
      subtitle: `Join Gluci: ${shareLandingUrl}`,
      heroImagePath: heroAbs,
      heroImageUrl: heroUrl ?? (!heroAbs ? productImageUrl : undefined),
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

  structured.userReply = safeReply(structured.userReply);
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
    // For barcode food scans: return OFF product image as userImageUrl so Android
    // can display it in FoodResultCard via mealImageUrl
    userImageUrl: userImageFilename
      ? (userImageFilename.startsWith("http") ? userImageFilename : `${base}/static/uploads/${userImageFilename}`)
      : productImageUrl,
    food: foodLabel,
  };
}
