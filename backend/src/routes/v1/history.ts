import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { getConversationForUser } from "../../services/conversationService.js";

export const historyRouter = Router();
historyRouter.use(authAppBearer);

historyRouter.get("/", async (req: AuthedRequest, res) => {
  const q = z.object({ conversationId: z.string().min(1) }).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "conversationId query required" });
  const conv = await getConversationForUser(req.userId!, q.data.conversationId);
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  const rows = await prisma.message.findMany({
    where: { userId: req.userId!, conversationId: q.data.conversationId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  res.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
});
