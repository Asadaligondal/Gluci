import { Router } from "express";
import { z } from "zod";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { handleChatTurn } from "../../services/orchestrator.js";

export const chatRouter = Router();
chatRouter.use(authAppBearer);

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
    res.json({
      reply: out.reply,
      score: out.structured.glucoseGalScore,
      verdict: out.structured.verdict,
      intent: out.structured.intent,
      topOrders: out.structured.topOrders ?? [],
      shareCardUrl: out.shareCardUrl,
      paywall: out.paywall,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Chat failed", detail: String(e) });
  }
});
