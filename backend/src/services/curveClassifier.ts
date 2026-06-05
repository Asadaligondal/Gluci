import { getOpenAIClient } from "./llm.js";
import { generateCurvePoints, renderCurveFromParams, type CurveCategory } from "../data/curvePools.js";
import type { CurvePoint } from "./shareCard.js";

export type CurveClassification = {
  category: CurveCategory;
  score: number;
  verdict: "eat" | "modify" | "avoid";
  verdictText: string;
  tip: string;
  message: string;
  curvePoints: CurvePoint[];
  confidence: "high" | "medium" | "low";
};

const CLASSIFICATION_PROMPT = `You are a clinical nutritionist and glucose response expert.

Given a food name and optional image, classify the food's glycemic impact and estimate macronutrients for a typical single serving.

Categories:
- SEVERE: Very high GI foods (white bread, candy, soda, fried dough, sugary cereals). Score 1.0–3.5.
- HIGH: High GI foods (white rice, regular pasta, pizza, burgers, fries, juice). Score 3.5–5.5.
- MODERATE: Medium GI foods (whole grain bread, basmati rice, sweet potato, fruit). Score 5.5–7.5.
- LOW: Low GI foods (legumes, oats, most vegetables, Greek yogurt, nuts with carbs). Score 7.5–8.5.
- MINIMAL: Very low GI (eggs, meat, fish, pure fat, leafy greens, cheese, water). Score 8.5–10.

Macronutrient estimates (typical single serving, in grams):
- carbs: total carbohydrates including sugars
- fiber: dietary fiber (subset of carbs)
- fat: total fat
- protein: total protein
- nutrientConfidence: "high" if food is well-known, "medium" if estimating, "low" if very uncertain

Curve parameter guidance (fallback if nutrientConfidence is "low"):
- peakTime (minutes to peak): liquid/sugar=15-25, refined carbs=25-40, mixed meals=40-60, high fat/fiber=55-80
- peakMgDl (mg/dL rise above baseline): SEVERE=65-85, HIGH=45-65, MODERATE=25-45, LOW=12-28, MINIMAL=3-12
- decayHalfLife (minutes to halve after peak): SEVERE=30-40, HIGH=40-55, MODERATE=50-65, LOW=60-75, MINIMAL=65-75. NEVER below 30. Glucose takes 90-120 min from the meal to return to baseline. Fat and protein slow decay further.
- Adjust peakTime UP and peakMgDl DOWN if the meal is high in fat, fiber, or protein

Glucose waves (bumps array):
Output a "bumps" array for any additional glucose rises after the main peak. Use [] if none.
Each entry: { "time": <minutes after meal, 60–160>, "mgDl": <mg/dL above baseline>, "width": <spread in minutes> }
- width: fat-driven wave = broad (35–50), complex carb secondary = medium (20–30), hormonal rebound = narrow (12–18)
- mgDl: typically 30–60% of main peakMgDl; each bump can have a different height
- Foods with bumps: pizza (fat delay ~120m), biryani (~110m), pasta with meat (~100m), candy bars (~80m), full mixed meals
- Foods without bumps: pure sugar drinks, plain rice, eggs, simple snacks → use []
- Max 3 bumps. Order by time ascending.

Reply ONLY with a JSON object, no markdown:
{
  "category": "SEVERE|HIGH|MODERATE|LOW|MINIMAL",
  "score": <number 1.0–10.0, one decimal>,
  "verdict": "eat|modify|avoid",
  "verdictText": "<1–3 word label>",
  "tip": "<one actionable sentence>",
  "message": "<2–3 sentence reply explaining glucose impact in simple terms>",
  "carbs": <grams>,
  "fiber": <grams>,
  "fat": <grams>,
  "protein": <grams>,
  "nutrientConfidence": "high|medium|low",
  "peakTime": <integer minutes>,
  "peakMgDl": <integer mg/dL>,
  "decayHalfLife": <integer minutes>,
  "bumps": [{ "time": <int>, "mgDl": <int>, "width": <int> }]
}`;

function nutrientsToParams(n: { carbs: number; fiber: number; fat: number; protein: number }): {
  peakTime: number;
  peakMgDl: number;
  decayHalfLife: number;
} {
  const netCarbs = Math.max(0, n.carbs - n.fiber);
  const peakTime = Math.round(Math.min(90, Math.max(15, 30 + n.fiber * 2 + n.fat * 1.5 + n.protein * 0.5)));
  const peakMgDl = Math.round(Math.min(100, Math.max(3, netCarbs * 1.5 - n.fat * 0.3)));
  const decayHalfLife = Math.round(Math.min(90, Math.max(30, 45 + n.fat * 1.0 + n.protein * 0.5 + n.fiber * 0.5)));
  return { peakTime, peakMgDl, decayHalfLife };
}

export async function classifyFoodCurve(params: {
  foodName: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<CurveClassification> {
  const openai = getOpenAIClient();

  const userContent: { type: string; text?: string; image_url?: { url: string } }[] = [
    { type: "text", text: `Food: ${params.foodName}` },
  ];

  if (params.imageBase64 && params.mimeType) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${params.mimeType};base64,${params.imageBase64}` },
    });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 700,
    messages: [
      { role: "system", content: CLASSIFICATION_PROMPT },
      { role: "user", content: userContent as never },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  let parsed: {
    category?: string;
    score?: unknown;
    verdict?: string;
    verdictText?: string;
    tip?: string;
    message?: string;
    carbs?: unknown;
    fiber?: unknown;
    fat?: unknown;
    protein?: unknown;
    nutrientConfidence?: string;
    peakTime?: unknown;
    peakMgDl?: unknown;
    decayHalfLife?: unknown;
    bumps?: unknown;
  } = {};

  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  }

  const validCategories: CurveCategory[] = ["SEVERE", "HIGH", "MODERATE", "LOW", "MINIMAL"];
  const category = validCategories.includes(parsed.category as CurveCategory)
    ? (parsed.category as CurveCategory)
    : "MODERATE";

  const score = typeof parsed.score === "number"
    ? Math.max(1, Math.min(10, Math.round(parsed.score * 10) / 10))
    : 5.0;

  const validVerdicts = ["eat", "modify", "avoid"];
  const verdict = validVerdicts.includes(parsed.verdict ?? "")
    ? (parsed.verdict as "eat" | "modify" | "avoid")
    : "modify";

  const verdictText = typeof parsed.verdictText === "string" && parsed.verdictText.trim()
    ? parsed.verdictText.trim()
    : verdict.charAt(0).toUpperCase() + verdict.slice(1);

  const tip = typeof parsed.tip === "string" ? parsed.tip.trim() : "";
  const message = typeof parsed.message === "string" ? parsed.message.trim() : "";

  // Step 3: nutrient-based math model (preferred)
  const carbs = typeof parsed.carbs === "number" ? Math.max(0, parsed.carbs) : null;
  const fiber = typeof parsed.fiber === "number" ? Math.max(0, parsed.fiber) : null;
  const fat = typeof parsed.fat === "number" ? Math.max(0, parsed.fat) : null;
  const protein = typeof parsed.protein === "number" ? Math.max(0, parsed.protein) : null;
  const nutrientConfidence = parsed.nutrientConfidence;
  const hasNutrients = carbs !== null && fiber !== null && fat !== null && protein !== null;
  const mathParams =
    hasNutrients && (nutrientConfidence === "high" || nutrientConfidence === "medium")
      ? nutrientsToParams({ carbs: carbs!, fiber: fiber!, fat: fat!, protein: protein! })
      : null;

  // Step 2 fallback: GPT direct params
  const gptPeakTime = typeof parsed.peakTime === "number" ? Math.max(10, parsed.peakTime) : null;
  const gptPeakMgDl = typeof parsed.peakMgDl === "number" ? Math.max(3, parsed.peakMgDl) : null;
  const gptDecayHalfLife = typeof parsed.decayHalfLife === "number" ? Math.max(30, parsed.decayHalfLife) : null;
  const gptParams =
    gptPeakTime !== null && gptPeakMgDl !== null && gptDecayHalfLife !== null
      ? { peakTime: gptPeakTime, peakMgDl: gptPeakMgDl, decayHalfLife: gptDecayHalfLife }
      : null;

  const bumps: { time: number; mgDl: number; width: number }[] = [];
  if (Array.isArray(parsed.bumps)) {
    for (const b of (parsed.bumps as unknown[]).slice(0, 3)) {
      const bObj = b as Record<string, unknown>;
      if (typeof bObj?.time === "number" && typeof bObj?.mgDl === "number" && typeof bObj?.width === "number") {
        bumps.push({
          time: Math.round(Math.min(160, Math.max(60, bObj.time))),
          mgDl: Math.round(Math.max(3, bObj.mgDl)),
          width: Math.round(Math.min(60, Math.max(10, bObj.width))),
        });
      }
    }
  }

  const finalParams = mathParams ?? gptParams;
  const paramsSource = mathParams ? "math-model" : gptParams ? "gpt-direct" : "category-default";
  console.log(`[curve] source=${paramsSource} nutrients={carbs=${carbs},fiber=${fiber},fat=${fat},protein=${protein},conf=${nutrientConfidence ?? "n/a"}}`);
  if (finalParams) {
    console.log(`[curve] params: peakTime=${finalParams.peakTime}m peakMgDl=${finalParams.peakMgDl} decayHalfLife=${finalParams.decayHalfLife}m`);
  }
  if (bumps.length > 0) {
    console.log(`[curve] bumps(${bumps.length}): ${bumps.map(b => `t=${b.time}m h=${b.mgDl}mg/dL w=${b.width}m`).join(" | ")}`);
  }

  const curvePoints = finalParams !== null
    ? renderCurveFromParams({ ...finalParams, bumps })
    : generateCurvePoints(category, { bumps });

  return {
    category,
    score,
    verdict,
    verdictText,
    tip,
    message,
    curvePoints,
    confidence: "high",
  };
}
