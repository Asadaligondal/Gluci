import { Router } from "express";
import { prisma } from "../../db.js";
import { createLinkCodeForUser } from "../../services/linking.js";
import { type AuthedRequest, authAppBearer } from "../../middleware/authApp.js";

export const channelsRouter = Router();
channelsRouter.use(authAppBearer);

channelsRouter.get("/", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const now = new Date();
  const hasActive = !!(user.linkCode && user.linkCodeExpiresAt && user.linkCodeExpiresAt > now);
  res.json({
    telegramLinked: !!user.telegramChatId,
    whatsappLinked: !!user.whatsappWaId,
    linkCode: hasActive ? user.linkCode : null,
    linkCodeExpiresAt: hasActive && user.linkCodeExpiresAt ? user.linkCodeExpiresAt.toISOString() : null,
  });
});

/** Issue a new /link &lt;code&gt; (valid 15 min). */
channelsRouter.post("/link-code", async (req: AuthedRequest, res) => {
  try {
    const { code, expiresAt } = await createLinkCodeForUser(req.userId!);
    res.json({ code, expiresAt });
  } catch (e) {
    console.error("link-code", e);
    res.status(500).json({ error: "Could not create link code" });
  }
});
