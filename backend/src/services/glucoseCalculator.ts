import { prisma } from "../db.js";
import { fetchUSDAGuess } from "./usdaLookup.js";

export interface FoodIngredient {
  name: string;
  portionGrams: number;
  giValue?: number;
  carbsPer100g?: number;
}

export interface CurvePoint {
  minute: number;
  mg_dl: number;
}

export interface GlucoseCalculation {
  mealGI: number;
  mealGL: number;
  peakMgDl: number;
  peakMinute: number;
  score: number;
  verdict: "eat" | "modify" | "avoid";
  curvePoints: CurvePoint[];
  confidence: "high" | "medium" | "low";
}

type GiFoodRow = {
  id: number;
  name: string;
  name_lower: string;
  gi_value: number;
  carbs_per_100g: number | null;
  category: string | null;
  source: string;
};

export async function lookupFoodGI(foodName: string): Promise<{ gi: number; carbs: number } | null> {
  const normalized = foodName.toLowerCase().trim();
  if (!normalized) return null;

  const exact = await prisma.giFood.findUnique({ where: { name_lower: normalized } });
  if (exact) {
    return { gi: exact.gi_value, carbs: exact.carbs_per_100g ?? 20 };
  }

  const likePattern = `%${normalized.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const rows = await prisma.$queryRaw<GiFoodRow[]>`
    SELECT id, name, name_lower, gi_value, carbs_per_100g, category, source
    FROM gi_food
    WHERE name_lower LIKE ${likePattern}
       OR ${normalized} LIKE '%' || name_lower || '%'
    ORDER BY LENGTH(name_lower::text) ASC
    LIMIT 1
  `;
  const partial = rows[0];
  if (partial) {
    return { gi: partial.gi_value, carbs: partial.carbs_per_100g ?? 20 };
  }

  const usda = await fetchUSDAGuess(foodName);
  if (usda) {
    return { gi: usda.estimatedGI, carbs: usda.carbsPer100g };
  }

  return null;
}

export function estimatePortions(gptIngredients: Array<{ name: string; amount: string }>): FoodIngredient[] {
  const PORTION_MAP: Record<string, number> = {
    cup: 240,
    cups: 240,
    tbsp: 15,
    tablespoon: 15,
    tablespoons: 15,
    tsp: 5,
    teaspoon: 5,
    oz: 28,
    ounce: 28,
    ounces: 28,
    lb: 454,
    pound: 454,
    slice: 30,
    slices: 30,
    piece: 100,
    pieces: 100,
    handful: 30,
    small: 80,
    medium: 150,
    large: 220,
    plate: 300,
    bowl: 250,
    serving: 150,
    portion: 150,
  };

  return gptIngredients.map((ing) => {
    const amount = ing.amount.toLowerCase();
    let grams = 100;

    const numMatch = amount.match(/(\d+\.?\d*)/);
    const num = numMatch ? parseFloat(numMatch[1]) : 1;

    const gramMatch = amount.match(/(\d+\.?\d*)\s*g\b/);
    if (gramMatch && !amount.includes("kg")) {
      grams = parseFloat(gramMatch[1]);
    } else if (amount.includes("kg")) {
      grams = num * 1000;
    } else {
      for (const [word, gramsPerUnit] of Object.entries(PORTION_MAP)) {
        if (amount.includes(word)) {
          grams = num * gramsPerUnit;
          break;
        }
      }
    }

    return { name: ing.name, portionGrams: Math.min(grams, 800) };
  });
}

function applyKeywordFallback(ing: FoodIngredient): void {
  const n = ing.name.toLowerCase();
  if (/sugar|candy|soda|syrup/.test(n)) {
    ing.giValue = 75;
    ing.carbsPer100g = 80;
  } else if (/bread|rice|potato|pasta|noodle/.test(n)) {
    ing.giValue = 68;
    ing.carbsPer100g = 35;
  } else if (/meat|chicken|fish|egg|beef|pork/.test(n)) {
    ing.giValue = 0;
    ing.carbsPer100g = 0;
  } else if (/vegetable|salad|green|leaf/.test(n)) {
    ing.giValue = 15;
    ing.carbsPer100g = 5;
  } else if (/fruit|berry/.test(n)) {
    ing.giValue = 45;
    ing.carbsPer100g = 15;
  } else if (/oil|butter|fat|cream/.test(n)) {
    ing.giValue = 0;
    ing.carbsPer100g = 0;
  } else if (/cheese|dairy|milk|yogurt/.test(n)) {
    ing.giValue = 30;
    ing.carbsPer100g = 8;
  } else {
    ing.giValue = 50;
    ing.carbsPer100g = 20;
  }
}

export function fallbackGlucoseCalculation(): GlucoseCalculation {
  const peakMgDl = 30;
  const peakMinute = 45;
  const minutes = [0, 15, 30, 45, 60, 90, 120];
  const curvePoints: CurvePoint[] = minutes.map((t) => {
    let mgDl = 0;
    if (peakMgDl >= 2) {
      if (t <= peakMinute) {
        const ratio = t / peakMinute;
        mgDl = peakMgDl * ratio * ratio;
      } else {
        const remaining = (t - peakMinute) / (120 - peakMinute);
        mgDl = peakMgDl * (1 - remaining) * (1 - remaining * 0.4);
      }
    }
    return { minute: t, mg_dl: Math.max(0, Math.round(mgDl * 10) / 10) };
  });

  return {
    mealGI: 50,
    mealGL: 12,
    peakMgDl,
    peakMinute,
    score: 5,
    verdict: "modify",
    curvePoints,
    confidence: "low",
  };
}

export async function calculateMealGlucose(ingredients: FoodIngredient[]): Promise<GlucoseCalculation> {
  let foundCount = 0;
  for (const ing of ingredients) {
    const lookup = await lookupFoodGI(ing.name);
    if (lookup) {
      ing.giValue = lookup.gi;
      ing.carbsPer100g = lookup.carbs;
      foundCount++;
    } else {
      applyKeywordFallback(ing);
    }
  }

  const confidence: GlucoseCalculation["confidence"] =
    foundCount === ingredients.length
      ? "high"
      : foundCount > ingredients.length / 2
        ? "medium"
        : "low";

  const withCarbs = ingredients.map((ing) => ({
    ...ing,
    carbsG: ((ing.carbsPer100g ?? 20) / 100) * ing.portionGrams,
    gi: ing.giValue ?? 50,
  }));

  const carbContributors = withCarbs.filter((i) => i.carbsG > 0.5);
  const totalCarbs = withCarbs.reduce((s, i) => s + i.carbsG, 0);

  let mealGI = 0;
  if (totalCarbs >= 1 && carbContributors.length > 0) {
    const num = carbContributors.reduce((s, i) => s + i.gi * i.carbsG, 0);
    const den = carbContributors.reduce((s, i) => s + i.carbsG, 0);
    mealGI = den > 0 ? num / den : 0;
  }

  const mealGL = (mealGI / 100) * totalCarbs;

  const peakMgDl = Math.min(mealGL * 1.8, 120);
  const peakMinute = Math.max(20, Math.min(75, Math.round(15 + mealGI * 0.45)));

  const rawScore = 10 - mealGL / 2.5;
  const score = Math.round(Math.max(1, Math.min(10, rawScore)) * 10) / 10;
  const verdict: GlucoseCalculation["verdict"] =
    score >= 7.5 ? "eat" : score >= 5 ? "modify" : "avoid";

  const minutes = [0, 15, 30, 45, 60, 90, 120];
  const curvePoints: CurvePoint[] = minutes.map((t) => {
    let mgDl = 0;
    if (peakMgDl < 2) {
      mgDl = 0;
    } else if (t <= peakMinute) {
      const ratio = t / peakMinute;
      mgDl = peakMgDl * ratio * ratio;
    } else {
      const remaining = (t - peakMinute) / (120 - peakMinute);
      mgDl = peakMgDl * (1 - remaining) * (1 - remaining * 0.4);
    }
    return { minute: t, mg_dl: Math.max(0, Math.round(mgDl * 10) / 10) };
  });

  console.log("[glucoseCalc]", {
    mealGI: Math.round(mealGI),
    mealGL: Math.round(mealGL * 10) / 10,
    totalCarbs: Math.round(totalCarbs * 10) / 10,
    peakMgDl,
    peakMinute,
    score,
    verdict,
    confidence,
  });

  return {
    mealGI,
    mealGL,
    peakMgDl,
    peakMinute,
    score,
    verdict,
    curvePoints,
    confidence,
  };
}
