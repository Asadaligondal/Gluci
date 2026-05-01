import { Router } from "express";
import { z } from "zod";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { handleChatTurn } from "../../services/orchestrator.js";
import { prisma } from "../../db.js";

export const chatRouter = Router();
chatRouter.use(authAppBearer);

/** GET /v1/glucose-curve/:messageId — glucose curve stored on assistant message metadata */
export const glucoseCurveRouter = Router();
glucoseCurveRouter.use(authAppBearer);

const bodySchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().optional(),
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
  barcode: z.string().optional(),
});

chatRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const userId = req.userId!;
  try {
    const out = await handleChatTurn({
      userId,
      conversationId: parsed.data.conversationId,
      text: parsed.data.text,
      imageBase64: parsed.data.imageBase64,
      mimeType: parsed.data.mimeType,
      barcode: parsed.data.barcode,
      channel: "app",
    });
    // Only expose food-specific fields for food intents — general chat gets nulls
    // so the Android client never shows a score card for a chat message.
    const isFoodIntent = ["meal", "restaurant", "grocery"].includes(out.structured.intent);
    res.json({
      reply: out.reply,
      score: isFoodIntent ? out.structured.glucoseGalScore : null,
      verdict: isFoodIntent ? out.structured.verdict : null,
      intent: out.structured.intent,
      topOrders: out.structured.topOrders ?? [],
      shareCardUrl: out.shareCardUrl,
      shareLandingUrl: out.shareLandingUrl,
      userImageUrl: out.userImageUrl,
      paywall: out.paywall,
      glucoseCurve: isFoodIntent ? (out.structured.glucoseCurve ?? null) : null,
      tip: isFoodIntent ? (out.structured.tip ?? null) : null,
      food: isFoodIntent ? (out.food ?? null) : null,
      mealGI: isFoodIntent ? (out.structured.mealGI ?? null) : null,
      mealGL: isFoodIntent ? (out.structured.mealGL ?? null) : null,
      confidence: isFoodIntent ? (out.structured.confidence ?? null) : null,
      ragAdjusted: isFoodIntent ? (out.structured.ragAdjusted ?? false) : null,
      ragSource: isFoodIntent ? (out.structured.ragSource ?? null) : null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Chat failed", detail: String(e) });
  }
});

glucoseCurveRouter.get("/:messageId", async (req: AuthedRequest, res) => {
  const messageId = req.params.messageId;
  if (!messageId) return res.status(400).json({ error: "messageId required" });

  try {
    const msg = await prisma.message.findFirst({
      where: { id: messageId, userId: req.userId!, role: "assistant" },
      select: { id: true, metadata: true, content: true },
    });
    if (!msg) return res.status(404).json({ error: "Message not found" });

    let meta: Record<string, unknown> = {};
    try {
      if (msg.metadata) meta = JSON.parse(msg.metadata) as Record<string, unknown>;
    } catch {
      meta = {};
    }

    const glucoseCurve = meta.glucoseCurve;
    const score = typeof meta.score === "number" ? meta.score : null;
    const verdict = typeof meta.verdict === "string" ? meta.verdict : "";
    const food =
      typeof meta.food === "string" && meta.food.trim()
        ? meta.food
        : msg.content.slice(0, 400);

    res.json({
      messageId: msg.id,
      food,
      glucoseCurve: Array.isArray(glucoseCurve) ? glucoseCurve : [],
      score,
      verdict,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load glucose curve", detail: String(e) });
  }
});
