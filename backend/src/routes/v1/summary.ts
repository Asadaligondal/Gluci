import { Router } from "express";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { buildDailySummary, buildWeeklySummary } from "../../services/summaries.js";
import { prisma } from "../../db.js";
import { getConfig } from "../../config.js";

export const summaryRouter = Router();
summaryRouter.use(authAppBearer);

summaryRouter.get("/daily", async (req: AuthedRequest, res) => {
  const s = await buildDailySummary(req.userId!);
  if (!s) return res.json({ summary: null });
  res.json({ summary: s });
});

summaryRouter.get("/weekly", async (req: AuthedRequest, res) => {
  const s = await buildWeeklySummary(req.userId!);
  if (!s) return res.json({ summary: null });
  res.json({ summary: s });
});

summaryRouter.get("/usage", async (req: AuthedRequest, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } });
  const cfg = getConfig();
  res.json({
    freeChecksUsed: u.freeChecksUsed,
    freeLimit: cfg.FREE_DECISIONS_LIMIT,
    subscriptionStatus: u.subscriptionStatus,
  });
});
