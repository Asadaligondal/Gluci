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

Given a food name and optional image, classify the food's glycemic impact and estimate its glucose curve parameters.

Categories:
- SEVERE: Very high GI foods (white bread, candy, soda, fried dough, sugary cereals). Score 1.0–3.5.
- HIGH: High GI foods (white rice, regular pasta, pizza, burgers, fries, juice). Score 3.5–5.5.
- MODERATE: Medium GI foods (whole grain bread, basmati rice, sweet potato, fruit). Score 5.5–7.5.
- LOW: Low GI foods (legumes, oats, most vegetables, Greek yogurt, nuts with carbs). Score 7.5–8.5.
- MINIMAL: Very low GI (eggs, meat, fish, pure fat, leafy greens, cheese, water). Score 8.5–10.

Curve parameter guidance:
- peakTime (minutes to peak): liquid/sugar=15-25, refined carbs=25-40, mixed meals=40-60, high fat/fiber=55-80
- peakMgDl (mg/dL rise above baseline): SEVERE=65-85, HIGH=45-65, MODERATE=25-45, LOW=12-28, MINIMAL=3-12
- decayHalfLife (minutes to halve after peak): SEVERE=30-40, HIGH=40-55, MODERATE=50-65, LOW=60-75, MINIMAL=65-75. NEVER below 30. Glucose takes 90-120 min from the meal to return to baseline — if peak is at 30 min, decay must cover 60-90 more minutes, so half-life cannot be short. Fat and protein slow decay further as they prolong gastric emptying.
- Adjust peakTime UP and peakMgDl DOWN if the meal is high in fat, fiber, or protein

Reply ONLY with a JSON object, no markdown:
{
  "category": "SEVERE|HIGH|MODERATE|LOW|MINIMAL",
  "score": <number 1.0–10.0, one decimal>,
  "verdict": "eat|modify|avoid",
  "verdictText": "<1–3 word label>",
  "tip": "<one actionable sentence>",
  "message": "<2–3 sentence reply explaining glucose impact in simple terms>",
  "peakTime": <integer minutes>,
  "peakMgDl": <integer mg/dL>,
  "decayHalfLife": <integer minutes>
}`;

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
    max_tokens: 500,
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
    peakTime?: unknown;
    peakMgDl?: unknown;
    decayHalfLife?: unknown;
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

  const gptPeakTime = typeof parsed.peakTime === "number" ? Math.max(10, parsed.peakTime) : null;
  const gptPeakMgDl = typeof parsed.peakMgDl === "number" ? Math.max(3, parsed.peakMgDl) : null;
  const gptDecayHalfLife = typeof parsed.decayHalfLife === "number" ? Math.max(30, parsed.decayHalfLife) : null;

  const curvePoints =
    gptPeakTime !== null && gptPeakMgDl !== null && gptDecayHalfLife !== null
      ? renderCurveFromParams({ peakTime: gptPeakTime, peakMgDl: gptPeakMgDl, decayHalfLife: gptDecayHalfLife })
      : generateCurvePoints(category);

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
