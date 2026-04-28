import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { getConversationForUser } from "../../services/conversationService.js";
import { getConfig } from "../../config.js";

export const historyRouter = Router();
historyRouter.use(authAppBearer);

historyRouter.get("/", async (req: AuthedRequest, res) => {
  const q = z.object({ conversationId: z.string().min(1) }).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "conversationId query required" });
  const conv = await getConversationForUser(req.userId!, q.data.conversationId);
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, "");
  const rows = await prisma.message.findMany({
    where: { userId: req.userId!, conversationId: q.data.conversationId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  res.json({
    messages: rows.map((m) => {
      let score: number | null = null;
      let verdict: string | null = null;
      let intent: string | null = null;
      let shareCardUrl: string | null = null;
      if (m.metadata) {
        try {
          const meta = JSON.parse(m.metadata) as {
            score?: number | null;
            verdict?: string | null;
            intent?: string | null;
            shareCardUrl?: string | null;
          };
          if (typeof meta.score === "number") score = meta.score;
          if (typeof meta.verdict === "string") verdict = meta.verdict;
          if (typeof meta.intent === "string") intent = meta.intent;
          if (typeof meta.shareCardUrl === "string") shareCardUrl = meta.shareCardUrl;
        } catch {
          /* ignore malformed metadata */
        }
      }
      const imageUrl =
        m.imageUrl && m.imageUrl.length > 0 ? `${base}/static/uploads/${m.imageUrl}` : null;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        imageUrl,
        score,
        verdict,
        intent,
        shareCardUrl,
      };
    }),
  });
});
