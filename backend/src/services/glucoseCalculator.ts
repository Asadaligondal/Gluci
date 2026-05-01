import { prisma } from "../db.js";
import { fetchUSDAGuess } from "./usdaLookup.js";
import type { RAGGlucoseHint } from "./knowledgeBase.js";

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
  const GARNISH_KEYWORDS = [
    "slice", "slices", "wedge", "wedges", "garnish",
    "drizzle", "sprinkle", "dash", "pinch", "squeeze",
    "zest", "splash", "touch", "hint",
  ];

  return gptIngredients.map((ing) => {
    const amount = ing.amount.toLowerCase().trim();
    let grams = 100;

    const gramMatch = amount.match(/(\d+\.?\d*)\s*g(?:rams?)?(?:\s|$)/);
    if (gramMatch) {
      grams = parseFloat(gramMatch[1]);
    } else {
      const kgMatch = amount.match(/(\d+\.?\d*)\s*kg/);
      if (kgMatch) {
        grams = parseFloat(kgMatch[1]) * 1000;
      } else {
        const num = parseFloat(amount.match(/(\d+\.?\d*)/)?.[1] || "1");

        const UNIT_MAP: Record<string, number> = {
          cup: 180,
          cups: 180,
          tbsp: 12,
          tablespoon: 12,
          tablespoons: 12,
          tsp: 4,
          teaspoon: 4,
          teaspoons: 4,
          oz: 28,
          ounce: 28,
          ounces: 28,
          lb: 400,
          pound: 400,
          slice: 30,
          slices: 30,
          piece: 80,
          pieces: 80,
          handful: 25,
          small: 80,
          medium: 130,
          large: 200,
          plate: 300,
          bowl: 200,
          serving: 130,
          portion: 130,
          scoop: 35,
          scoops: 35,
        };

        for (const [unit, gramsPerUnit] of Object.entries(UNIT_MAP)) {
          if (amount.includes(unit)) {
            grams = num * gramsPerUnit;
            break;
          }
        }

        if (/^\d+\.?\d*$/.test(amount) && grams === 100) {
          grams = parseFloat(amount);
        }

        if (grams === 100) {
          const name = ing.name.toLowerCase();
          if (name.includes("rice") || name.includes("pasta")) grams = 150;
          else if (name.includes("chicken") || name.includes("fish")) grams = 140;
          else if (name.includes("bread") || name.includes("roti")) grams = 80;
          else if (name.includes("salad")) grams = 120;
          else if (name.includes("soup")) grams = 200;
          else if (name.includes("egg")) grams = 55;
          else if (name.includes("sauce") || name.includes("dressing")) grams = 25;
        }
      }
    }

    // Cap garnish/accent ingredients at 30g regardless of other parsing
    if (GARNISH_KEYWORDS.some((k) => amount.includes(k))) {
      grams = Math.min(grams, 30);
    }

    return {
      name: ing.name,
      portionGrams: Math.min(Math.max(grams, 5), 600),
    };
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

export function generateCurvePoints(peakMgDl: number, peakMinute: number): CurvePoint[] {
  const minutes = [0, 15, 30, 45, 60, 90, 120, 150, 180];
  return minutes.map((t) => {
    let mgDl = 0;
    if (peakMgDl >= 2) {
      if (t <= peakMinute) {
        const ratio = t / peakMinute;
        mgDl = peakMgDl * ratio * ratio;
      } else {
        const remaining = (t - peakMinute) / (180 - peakMinute);
        mgDl = peakMgDl * (1 - remaining) * (1 - remaining * 0.4);
      }
    }
    return { minute: t, mg_dl: Math.max(0, Math.round(mgDl * 10) / 10) };
  });
}

export function fallbackGlucoseCalculation(): GlucoseCalculation {
  const peakMgDl = 30;
  const peakMinute = 45;
  return {
    mealGI: 50,
    mealGL: 12,
    peakMgDl,
    peakMinute,
    score: 5,
    verdict: "modify",
    curvePoints: generateCurvePoints(peakMgDl, peakMinute),
    confidence: "low",
  };
}

export async function calculateMealGlucose(ingredients: FoodIngredient[]): Promise<GlucoseCalculation> {
  let totalWeight = ingredients.reduce((s, i) => s + i.portionGrams, 0);

  if (totalWeight > 800) {
    const scaleFactor = 700 / totalWeight;
    ingredients.forEach((i) => {
      i.portionGrams = Math.round(i.portionGrams * scaleFactor);
    });
    console.log(
      `[calc] Scaled down meal from ${totalWeight}g to ~700g (factor: ${scaleFactor.toFixed(2)})`,
    );
    totalWeight = ingredients.reduce((s, i) => s + i.portionGrams, 0);
  }

  if (totalWeight < 50 && totalWeight > 0) {
    const scaleFactor = 150 / totalWeight;
    ingredients.forEach((i) => {
      i.portionGrams = Math.round(i.portionGrams * scaleFactor);
    });
    console.log(
      `[calc] Scaled up meal from ${totalWeight}g to ~150g (factor: ${scaleFactor.toFixed(2)})`,
    );
  }

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

  console.log(
    "[portions]",
    ingredients.map((i) => ({
      name: i.name,
      grams: i.portionGrams,
      gi: i.giValue,
      carbs: i.carbsPer100g,
      carbsG: ((i.carbsPer100g ?? 0) / 100) * i.portionGrams,
    })),
  );

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

  // Protein and fat dampening — slows glucose absorption (established nutritional science)
  const totalProteinG = ingredients.reduce((s, ing) => {
    const n = ing.name.toLowerCase();
    const proteinPer100 = /meat|chicken|fish|egg|beef|pork|turkey|tuna|salmon|shrimp/.test(n) ? 25
      : /cheese|dairy|milk|yogurt/.test(n) ? 8
      : /bean|lentil|legume|tofu/.test(n) ? 9
      : 2;
    return s + (proteinPer100 / 100) * ing.portionGrams;
  }, 0);

  const totalFatG = ingredients.reduce((s, ing) => {
    const n = ing.name.toLowerCase();
    const fatPer100 = /oil|butter|lard|mayo|avocado/.test(n) ? 80
      : /meat|chicken|fish|beef|pork|turkey/.test(n) ? 8
      : /cheese|dairy|milk|yogurt/.test(n) ? 5
      : /nut|seed|chip|snack/.test(n) ? 15
      : 3;
    return s + (fatPer100 / 100) * ing.portionGrams;
  }, 0);

  const proteinFatRatio = (totalProteinG + totalFatG) / Math.max(totalCarbs, 1);
  const dampening = proteinFatRatio > 2 ? 0.5
    : proteinFatRatio > 1 ? 0.65
    : proteinFatRatio > 0.5 ? 0.8
    : 1.0;

  const effectiveGL = mealGL * dampening;

  const peakMgDl = Math.min(effectiveGL * 1.5, 100);
  const peakMinute = Math.max(25, Math.min(90, Math.round(20 + mealGI * 0.40)));

  const rawScore = 10 - effectiveGL / 7.0;
  let score = Math.round(Math.max(1, Math.min(10, rawScore)) * 10) / 10;

  // Minimum score floor for meals dominated by vegetables and protein
  const totalPortionGrams = Math.max(ingredients.reduce((s, i) => s + i.portionGrams, 0), 1);
  const vegProteinGrams = ingredients
    .filter(i => {
      const n = i.name.toLowerCase();
      return /vegetable|salad|green|leaf|lettuce|spinach|kale|broccoli|tomato|cucumber|pepper|zucchini|asparagus|mushroom/.test(n)
        || /chicken|fish|turkey|tuna|salmon|shrimp|beef|pork|egg/.test(n)
        || (i.giValue !== undefined && i.giValue <= 20);
    })
    .reduce((s, i) => s + i.portionGrams, 0);
  const vegProteinRatio = vegProteinGrams / totalPortionGrams;
  if (vegProteinRatio > 0.80) score = Math.max(score, 7.5);
  else if (vegProteinRatio > 0.65) score = Math.max(score, 6.5);
  else if (vegProteinRatio > 0.50) score = Math.max(score, 5.5);

  const verdict: GlucoseCalculation["verdict"] =
    score >= 7.0 ? "eat" : score >= 4.5 ? "modify" : "avoid";

  const curvePoints = generateCurvePoints(peakMgDl, peakMinute);

  console.log("[glucoseCalc]", {
    mealGI: Math.round(mealGI),
    mealGL: Math.round(mealGL * 10) / 10,
    effectiveGL: Math.round(effectiveGL * 10) / 10,
    totalCarbs: Math.round(totalCarbs * 10) / 10,
    dampening,
    vegProteinRatio: Math.round(vegProteinRatio * 100) / 100,
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

export function applyRAGAdjustment(
  calculation: GlucoseCalculation,
  hint: RAGGlucoseHint,
): GlucoseCalculation {
  if (!hint.hasHint) return calculation;

  console.log("[rag-adjustment]", {
    originalScore: calculation.score,
    ragScore: hint.suggestedScore,
    ragImpact: hint.suggestedImpact,
    ragPeak: hint.suggestedPeakMgDl,
    similarity: hint.confidence,
    source: hint.source,
  });

  let adjustedScore = calculation.score;
  let adjustedPeak = calculation.peakMgDl;

  // Blend formula score with RAG score: similarity 0.80→20% RAG, 0.90→40%, 0.95+→60%
  if (hint.suggestedScore !== null) {
    const ragWeight = Math.min((hint.confidence - 0.80) * 6, 0.60);
    const formulaWeight = 1 - ragWeight;
    adjustedScore = Math.round(
      (calculation.score * formulaWeight + hint.suggestedScore * ragWeight) * 10,
    ) / 10;
    console.log("[rag-adjustment] score blend:", {
      formulaScore: calculation.score,
      ragScore: hint.suggestedScore,
      ragWeight,
      adjustedScore,
    });
  }

  // Blend peak with RAG spike estimate
  if (hint.suggestedPeakMgDl !== null) {
    const ragWeight = Math.min((hint.confidence - 0.80) * 4, 0.40);
    adjustedPeak = Math.round(
      calculation.peakMgDl * (1 - ragWeight) + hint.suggestedPeakMgDl * ragWeight,
    );
  }

  // Impact-based nudge when no specific score is available
  if (!hint.suggestedScore && hint.suggestedImpact) {
    const impactRanges = {
      low:    { min: 7.0, max: 10.0 },
      medium: { min: 4.5, max: 7.0 },
      high:   { min: 1.0, max: 4.5 },
    };
    const range = impactRanges[hint.suggestedImpact];
    if (adjustedScore > range.max) {
      const gap = adjustedScore - range.max;
      adjustedScore = Math.round((adjustedScore - gap * 0.2) * 10) / 10;
    } else if (adjustedScore < range.min) {
      const gap = range.min - adjustedScore;
      adjustedScore = Math.round((adjustedScore + gap * 0.2) * 10) / 10;
    }
  }

  adjustedScore = Math.max(1, Math.min(10, adjustedScore));

  const adjustedVerdict: GlucoseCalculation["verdict"] =
    adjustedScore >= 7.0 ? "eat" : adjustedScore >= 4.5 ? "modify" : "avoid";

  const adjustedCurve =
    Math.abs(adjustedPeak - calculation.peakMgDl) > 5
      ? generateCurvePoints(adjustedPeak, calculation.peakMinute)
      : calculation.curvePoints;

  return {
    ...calculation,
    score: adjustedScore,
    verdict: adjustedVerdict,
    peakMgDl: adjustedPeak,
    curvePoints: adjustedCurve,
  };
}
