import { prisma } from "../db.js";

export type DailySummary = {
  checks: number;
  averageScore: number;
  bestVerdict: string | null;
  /** Intent of the highest-scoring check today (meal | restaurant | grocery | null). */
  bestIntent: string | null;
  bestScore: number | null;
  /**
   * Human-readable “main improvement area” from today’s checks (lowest avg score by intent).
   */
  improvementArea: string;
  /** Actionable line for tomorrow; also exposed as `focus` for older clients. */
  suggestionTomorrow: string;
  /** @deprecated Use suggestionTomorrow; kept identical for backward compatibility. */
  focus: string;
};

export type WeeklySummary = {
  /** Rolling window: now minus 7 days (inclusive of events with createdAt >= this). */
  periodStart: string;
  periodEnd: string;
  checks: number;
  averageScore: number;
  bestVerdict: string | null;
  bestIntent: string | null;
  commonPattern: string;
  bestSwapHint: string;
  mostImprovedArea: string;
  focusNextWeek: string;
};

function intentLabel(intent: string): string {
  switch (intent) {
    case "meal":
      return "meal checks";
    case "restaurant":
      return "restaurant orders";
    case "grocery":
      return "grocery picks";
    default:
      return "food decisions";
  }
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function loadUserGoal(userId: string): Promise<string | null> {
  const p = await prisma.profile.findUnique({ where: { userId }, select: { goal: true } });
  return p?.goal?.trim() || null;
}

/**
 * Today (local server calendar day) usage events for the user.
 */
export async function buildDailySummary(userId: string): Promise<DailySummary | null> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const events = await prisma.usageEvent.findMany({
    where: { userId, createdAt: { gte: start } },
    orderBy: { createdAt: "asc" },
  });
  if (!events.length) return null;

  const scores = events.map((e) => e.score).filter((s): s is number => s != null);
  const averageScore = scores.length ? Math.round(avg(scores) * 10) / 10 : 0;

  const best = events.reduce<(typeof events)[0] | null>((acc, e) => {
    if (e.score == null) return acc;
    if (!acc || acc.score == null || e.score > acc.score) return e;
    return acc;
  }, null);

  const byIntent = new Map<string, number[]>();
  for (const e of events) {
    if (e.score == null) continue;
    const k = e.type || "general";
    const arr = byIntent.get(k) ?? [];
    arr.push(e.score);
    byIntent.set(k, arr);
  }

  let weakestIntent: string | null = null;
  let weakestAvg = Infinity;
  for (const [intent, arr] of byIntent) {
    const a = avg(arr);
    if (a < weakestAvg) {
      weakestAvg = a;
      weakestIntent = intent;
    }
  }
  if (weakestIntent == null) weakestIntent = "general";

  const improvementArea =
    weakestIntent === "general"
      ? "getting more consistent scores across your checks"
      : `your ${intentLabel(weakestIntent)} (today’s average was ${Math.round(weakestAvg * 10) / 10}/10)`;

  const goal = await loadUserGoal(userId);
  const goalLine = goal ? ` That lines up with your goal: “${goal.slice(0, 120)}${goal.length > 120 ? "…" : ""}”.` : "";

  const suggestionTomorrow =
    weakestIntent === "grocery"
      ? `Tomorrow, scan one similar item and compare labels—pick the option with more fiber or less added sugar.${goalLine}`
      : weakestIntent === "restaurant"
        ? `Tomorrow, try one restaurant pick with extra vegetables or protein on the side, and go lighter on refined carbs.${goalLine}`
        : weakestIntent === "meal"
          ? `Tomorrow, plate protein and fiber first, then add carbs to match your hunger—small tweaks beat “all or nothing”.${goalLine}`
          : `Tomorrow, send one photo or question before you eat so we can fine-tune the next score.${goalLine}`;

  return {
    checks: events.length,
    averageScore,
    bestVerdict: best?.verdict ?? null,
    bestIntent: best?.type ?? null,
    bestScore: best?.score != null ? Math.round(best.score * 10) / 10 : null,
    improvementArea,
    suggestionTomorrow,
    focus: suggestionTomorrow,
  };
}

/**
 * Rolling last 7 days of usage (server time).
 */
export async function buildWeeklySummary(userId: string): Promise<WeeklySummary | null> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const events = await prisma.usageEvent.findMany({
    where: { userId, createdAt: { gte: periodStart } },
    orderBy: { createdAt: "asc" },
  });
  if (!events.length) return null;

  const scores = events.map((e) => e.score).filter((s): s is number => s != null);
  const averageScore = scores.length ? Math.round(avg(scores) * 10) / 10 : 0;

  const best = events.reduce<(typeof events)[0] | null>((acc, e) => {
    if (e.score == null) return acc;
    if (!acc || acc.score == null || e.score > acc.score) return e;
    return acc;
  }, null);

  const counts = new Map<string, number>();
  for (const e of events) {
    const k = e.type || "general";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let topIntent: string | null = null;
  let topCount = 0;
  for (const [intent, c] of counts) {
    if (c > topCount) {
      topCount = c;
      topIntent = intent;
    }
  }
  const distinctIntents = [...counts.keys()].filter((k) => k !== "general");
  const commonPattern =
    distinctIntents.length >= 3 && topCount <= events.length / 2
      ? "You mixed meal, restaurant, and grocery checks this week—nice variety."
      : topIntent && topIntent !== "general"
        ? `You focused most on ${intentLabel(topIntent)} (${topCount} of ${events.length} checks).`
        : "You stayed active with Gluci checks across the week.";

  const groceryVerdicts = events.filter((e) => e.type === "grocery" && e.verdict);
  const swapMention = groceryVerdicts.find((e) => /swap/i.test(e.verdict ?? ""));
  const bestSwapHint = swapMention
    ? "Keep pushing on swaps—your notes already pointed toward alternatives. One swap per grocery trip adds up."
    : events.some((e) => e.type === "grocery")
      ? "Try scanning one ‘usual buy’ next trip and ask for a cleaner swap—small label wins compound."
      : "Add a grocery scan next week to build a swap habit—even one item helps.";

  const mid = Math.floor(events.length / 2);
  const firstHalf = events.slice(0, Math.max(1, mid));
  const secondHalf = events.slice(Math.max(1, mid));

  function avgByIntent(list: typeof events): Map<string, number> {
    const m = new Map<string, number[]>();
    for (const e of list) {
      if (e.score == null) continue;
      const k = e.type || "general";
      const arr = m.get(k) ?? [];
      arr.push(e.score);
      m.set(k, arr);
    }
    const out = new Map<string, number>();
    for (const [k, arr] of m) out.set(k, avg(arr));
    return out;
  }

  const a1 = avgByIntent(firstHalf);
  const a2 = avgByIntent(secondHalf);
  let mostImprovedArea = "Keep logging checks next week to unlock clearer week-over-week trends.";
  let bestDelta = -Infinity;
  let bestIntentForDelta: string | null = null;
  for (const intent of new Set([...a1.keys(), ...a2.keys()])) {
    const v1 = a1.get(intent);
    const v2 = a2.get(intent);
    if (v1 == null || v2 == null) continue;
    const d = v2 - v1;
    if (d > bestDelta) {
      bestDelta = d;
      bestIntentForDelta = intent;
    }
  }
  if (bestIntentForDelta && bestDelta > 0.05) {
    mostImprovedArea = `Your ${intentLabel(bestIntentForDelta)} scores trended up in the second half of the week—build on that momentum.`;
  } else if (events.length >= 4) {
    mostImprovedArea =
      "Scores were steady—next week, try one bolder tweak (extra fiber or a lighter carb) on your lowest-scoring type.";
  }

  const byIntentAll = new Map<string, number[]>();
  for (const e of events) {
    if (e.score == null) continue;
    const k = e.type || "general";
    const arr = byIntentAll.get(k) ?? [];
    arr.push(e.score);
    byIntentAll.set(k, arr);
  }
  let weakIntent: string | null = null;
  let weakAvg = Infinity;
  for (const [intent, arr] of byIntentAll) {
    const a = avg(arr);
    if (a < weakAvg) {
      weakAvg = a;
      weakIntent = intent;
    }
  }
  const weakLabel = weakIntent && weakIntent !== "general" ? intentLabel(weakIntent) : "your checks";
  const goal = await loadUserGoal(userId);
  const goalTail = goal
    ? ` Keep your goal in mind: “${goal.slice(0, 100)}${goal.length > 100 ? "…" : ""}”.`
    : "";

  const focusNextWeek = `Next week, nudge ${weakLabel} upward with one small tweak per day—consistency beats perfection.${goalTail}`;

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    checks: events.length,
    averageScore,
    bestVerdict: best?.verdict ?? null,
    bestIntent: best?.type ?? null,
    commonPattern,
    bestSwapHint,
    mostImprovedArea,
    focusNextWeek,
  };
}

export async function usersEligibleForReengagement() {
  const candidates = await prisma.user.findMany({
    where: {
      reengagementOptOut: false,
    },
    select: {
      id: true,
      telegramChatId: true,
      whatsappWaId: true,
      lastReengagementAt: true,
      reengagementFrequencyDays: true,
    },
    take: 200,
  });
  const now = Date.now();
  const eligible = candidates.filter((u) => {
    const freq = Math.max(1, Math.min(30, u.reengagementFrequencyDays ?? 1));
    const minMs = freq * 24 * 60 * 60 * 1000;
    if (!u.lastReengagementAt) return true;
    return now - u.lastReengagementAt.getTime() >= minMs;
  });
  return eligible.slice(0, 100);
}
