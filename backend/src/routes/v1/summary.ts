import { Router } from "express";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { buildDailySummary, buildWeekDailyBars, buildWeeklySummary } from "../../services/summaries.js";
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

/** GET /v1/summary/week-daily — avg score per day for last 7 UTC days (usage events). */
summaryRouter.get("/week-daily", async (req: AuthedRequest, res) => {
  const days = await buildWeekDailyBars(req.userId!);
  res.json({ days });
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
