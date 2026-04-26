import { prisma } from "../db.js";

export async function buildDailySummary(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const events = await prisma.usageEvent.findMany({
    where: { userId, createdAt: { gte: start } },
  });
  if (!events.length) return null;
  const scores = events.map((e) => e.score).filter((s): s is number => s != null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const best = events.reduce<(typeof events)[0] | null>((acc, e) => {
    if (e.score == null) return acc;
    if (!acc || acc.score == null || e.score > acc.score) return e;
    return acc;
  }, null);
  return {
    checks: events.length,
    averageScore: Math.round(avg * 10) / 10,
    bestVerdict: best?.verdict,
    focus: "Keep protein + fiber in mind for your next meal.",
  };
}

export async function usersEligibleForReengagement() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.user.findMany({
    where: {
      reengagementOptOut: false,
      OR: [{ lastReengagementAt: null }, { lastReengagementAt: { lt: yesterday } }],
    },
    select: { id: true, telegramChatId: true, whatsappWaId: true, lastReengagementAt: true },
    take: 100,
  });
}
