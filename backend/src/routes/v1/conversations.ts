import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { createAppConversation, getConversationForUser, listConversations } from "../../services/conversationService.js";

export const conversationsRouter = Router();
conversationsRouter.use(authAppBearer);

conversationsRouter.get("/", async (req: AuthedRequest, res) => {
  const rows = await listConversations(req.userId!);
  res.json({
    conversations: rows.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
    })),
  });
});

conversationsRouter.post("/", async (req: AuthedRequest, res) => {
  const schema = z.object({ title: z.string().max(120).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const c = await createAppConversation(req.userId!, parsed.data.title ?? "New chat");
  res.json({ id: c.id, title: c.title });
});

const idParam = z.object({ id: z.string() });

conversationsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) return res.status(400).json({ error: "Invalid id" });
  const body = z.object({ title: z.string().min(1).max(120) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const conv = await getConversationForUser(req.userId!, p.data.id);
  if (!conv) return res.status(404).json({ error: "Not found" });
  const updated = await prisma.conversation.update({
    where: { id: p.data.id },
    data: { title: body.data.title },
  });
  res.json({ id: updated.id, title: updated.title });
});

conversationsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) return res.status(400).json({ error: "Invalid id" });
  const conv = await getConversationForUser(req.userId!, p.data.id);
  if (!conv) return res.status(404).json({ error: "Not found" });
  await prisma.conversation.delete({ where: { id: p.data.id } });
  res.json({ ok: true });
});
