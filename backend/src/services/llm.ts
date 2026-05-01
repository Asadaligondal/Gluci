import OpenAI from "openai";
import { z } from "zod";
import { getConfig } from "../config.js";
import type { KnowledgeResult } from "./knowledgeBase.js";
import type { GlucoseCalculation } from "./glucoseCalculator.js";

const TopOrderSchema = z.object({
  name: z.string(),
  score: z.number(),
  tweaks: z.string(),
});

export type GluciResponse = {
  userReply: string;
  glucoseGalScore: number;
  verdict: string;
  intent: "meal" | "restaurant" | "grocery" | "general";
  countAsDecision: boolean;
  suggestShareCard: boolean;
  topOrders?: { name: string; score: number; tweaks: string }[];
  glucoseCurve?: { minute: number; mg_dl: number }[];
  tip?: string;
  mealGI?: number;
  mealGL?: number;
  confidence?: "high" | "medium" | "low";
};

export type FoodExtraction =
  | { intent: "meal"; foodName: string; ingredients: { name: string; amount: string }[] }
  | { intent: "chat" };

const EXTRACTION_SYSTEM = `When food is present, output ONLY this JSON:
{
  "intent": "meal",
  "foodName": "descriptive meal name",
  "ingredients": [
    { "name": "ingredient name", "amount": "portion in grams only, e.g. 150g" }
  ]
}
Be specific with ingredient names.
If no food: { "intent": "chat" }
Respond ONLY with valid JSON.

CRITICAL PORTION RULES:
- ALWAYS output portions in grams (g) only
- NEVER use cups, handfuls, pieces, slices etc
- Convert all measurements to grams yourself
- Use these reference weights:

  PROTEINS (typical serving):
  chicken breast = 150g
  fish fillet = 130g
  beef steak = 180g
  eggs = 55g each
  shrimp = 85g

  GRAINS (typical serving cooked):
  rice = 150g (1 regular bowl)
  pasta = 180g (1 plate)
  bread slice = 30g
  naan/roti = 80g

  VEGETABLES (typical serving):
  side salad = 80g
  main salad = 150g
  cooked vegetables = 80g
  raw vegetables = 60g

  DAIRY:
  milk in coffee = 30g
  yogurt cup = 150g
  cheese slice = 20g

  SAUCES/CONDIMENTS:
  sauce = 30g
  dressing = 20g
  oil = 10g

  SNACKS:
  chips bag = 30g
  chocolate bar = 45g
  cookie = 15g

- For photos: estimate based on plate size
  A standard dinner plate holds 300-400g total food
  Distribute accordingly between ingredients

- Be CONSERVATIVE — underestimate rather than overestimate portions

- For mixed dishes (curry, stew, biryani):
  List the dish as ONE ingredient with total weight
  e.g. {name: 'chicken biryani', amount: '250g'}
  NOT decomposed into rice + chicken + spices

- For restaurant meals assume standard portions
- For homemade meals assume moderate portions`;

function buildKnowledgePrompt(knowledgeContext: KnowledgeResult[]): string {
  if (!knowledgeContext.length) return "";
  const blocks = knowledgeContext.map(
    (k) => `
Account: ${k.account}
Foods: ${k.foods.join(", ")}
Glucose impact: ${k.glucose_impact}
Estimated spike: ${k.spike_estimate_mg_dl ?? "unknown"} mg/dL
Verdict: ${k.verdict}
Score: ${k.score ?? "?"}/10
Key insight: ${k.key_tip}
Similarity to user food: ${(k.similarity * 100).toFixed(0)}%`,
  );
  return `--- GLUCOSE KNOWLEDGE BASE ---
The following insights are from verified glucose science content by glucosegoddess (Jessie Inchauspé, French biochemist) and insulinresistant1 (Justin Richard):

${blocks.join("\n---\n")}
--- END KNOWLEDGE BASE ---

Use this knowledge to make your response more specific and scientifically grounded. Reference these insights naturally without explicitly saying "according to Instagram".`;
}

/** Fallback used when the model omits usable reply text or returns malformed structured output. */
export const DEFAULT_GLICI_REPLY =
  "I'm here to help! Ask me about any food or send a photo to get your glucose score.";

const SYSTEM_CORE = `You are Gluci, a friendly AI food coach (not a doctor). You help users decide what to eat next for stable glucose, energy, and practical swaps—low shame, simple language.

You MUST NOT: diagnose, give medication or insulin advice, claim to treat disease, shame users, or encourage extreme restriction.

RESPONSE FORMAT — pick exactly ONE:

(A) GENERAL / CASUAL CHAT — plain text only (no JSON, no markdown code fences): Use when the user is greeting you, thanking you, making small talk, or asking general questions WITHOUT asking you to analyze specific foods, a restaurant/menu, a grocery item, barcode data, or an attached meal photo. Answer naturally and helpfully in 2–4 short sentences. Personalize using profile context when relevant.

(B) STRUCTURED FOOD GUIDANCE — JSON object only (no prose outside the JSON): Use when they want glucose-aware guidance about meals (including photos), restaurant/menu picks, grocery items, barcoded products, or any specific foods to evaluate.

When using format (B), steer toward these flows when relevant:
1) Meal (photo/text): verdict/score/glucose curve JSON keys below.
2) Restaurant/menu: up to 3 best orders with scores and tweaks (fill topOrders array).
3) Grocery item: verdict Buy, Modify use, Swap, or Avoid—score, short evaluation, suggest a better swap if needed.

When analyzing food (meal intent or photo/text meal questions), ALWAYS return JSON including these keys:
{
  "verdict": "eat" | "modify" | "avoid",
  "score": <number 1-10>,
  "glucoseCurve": [
    {"minute": 0, "mg_dl": 0},
    {"minute": 15, "mg_dl": <number>},
    {"minute": 30, "mg_dl": <number>},
    {"minute": 45, "mg_dl": <number>},
    {"minute": 60, "mg_dl": <number>},
    {"minute": 90, "mg_dl": <number>},
    {"minute": 120, "mg_dl": <number>}
  ],
  "tip": "<one actionable sentence>",
  "message": "<friendly conversational response to user>",
  "intent": "meal",
  "countAsDecision": true|false,
  "suggestShareCard": true|false
}

Rules for glucoseCurve generation:
- mg_dl values represent RISE above baseline (can be negative for fat/protein-heavy meals).
- low impact foods: peak under 20 mg/dL
- medium impact: peak 20-40 mg/dL
- high impact: peak 40-80 mg/dL
- very high impact: peak 80+ mg/dL
- Peak timing: simple sugars peak ~30min, complex carbs ~45-60min, mixed meals ~60min
- Always return near 0 by 120min.

For restaurant/menu flows include intent "restaurant", topOrders (max 3), countAsDecision as appropriate; glucoseCurve optional.

For grocery flows include intent "grocery".

Merge meal-style keys with legacy aliases allowed:
You may include "userReply" instead of "message" OR "glucoseGalScore" instead of "score" for compatibility — prefer message + score when possible.

Legacy restaurant-only shape allowed:
{"userReply":"string","glucoseGalScore":number,"verdict":"string","intent":"restaurant"|...,"countAsDecision":boolean,"suggestShareCard":boolean,"topOrders":[{"name":"string","score":number,"tweaks":"string"}]}

If suggestShareCard is true for meals, end message with a short line inviting a GlucoseGal share card when appropriate.`;

function normalizeVerdict(v: unknown): string {
  if (typeof v !== "string") return "Modify";
  const lower = v.trim().toLowerCase();
  if (lower === "eat" || lower === "modify" || lower === "avoid") {
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return v.trim() || "Modify";
}

function parseGlucoseCurve(val: unknown): { minute: number; mg_dl: number }[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const out: { minute: number; mg_dl: number }[] = [];
  for (const item of val) {
    if (!item || typeof item !== "object") return undefined;
    const m = (item as Record<string, unknown>)["minute"];
    const mg = (item as Record<string, unknown>)["mg_dl"];
    if (typeof m !== "number" || typeof mg !== "number") return undefined;
    out.push({ minute: m, mg_dl: mg });
  }
  return out.length ? out : undefined;
}

function parseTopOrders(val: unknown): { name: string; score: number; tweaks: string }[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const parsed = z.array(TopOrderSchema).safeParse(val);
  return parsed.success ? parsed.data : undefined;
}

export function normalizeGluciResponse(raw: unknown): GluciResponse {
  if (typeof raw === "string") {
    const t = raw.trim();
    return {
      userReply: t.length >= 2 ? t : DEFAULT_GLICI_REPLY,
      glucoseGalScore: 5,
      verdict: "Modify",
      intent: "general",
      countAsDecision: false,
      suggestShareCard: false,
    };
  }

  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const message = typeof o.message === "string" ? o.message : undefined;
  const userReply = typeof o.userReply === "string" ? o.userReply : undefined;
  let combinedMessage = (message ?? userReply ?? "").trim();
  const tipStr = typeof o.tip === "string" ? o.tip.trim() : "";
  if (!combinedMessage && tipStr) combinedMessage = tipStr;
  if (!combinedMessage) combinedMessage = DEFAULT_GLICI_REPLY;

  const scoreRaw =
    typeof o.score === "number"
      ? o.score
      : typeof o.glucoseGalScore === "number"
        ? o.glucoseGalScore
        : 5;
  const glucoseGalScore = Math.min(10, Math.max(0, Number(scoreRaw)));

  const verdict = normalizeVerdict(o.verdict);

  let intent: GluciResponse["intent"] = "general";
  if (o.intent === "meal" || o.intent === "restaurant" || o.intent === "grocery" || o.intent === "general") {
    intent = o.intent;
  }

  const countAsDecision = Boolean(o.countAsDecision);
  const suggestShareCard = Boolean(o.suggestShareCard);

  const glucoseCurve = parseGlucoseCurve(o.glucoseCurve);
  const tip = typeof o.tip === "string" ? o.tip : undefined;
  const topOrders = parseTopOrders(o.topOrders);

  const mealGI = typeof o.mealGI === "number" ? o.mealGI : undefined;
  const mealGL = typeof o.mealGL === "number" ? o.mealGL : undefined;
  const confidence =
    o.confidence === "high" || o.confidence === "medium" || o.confidence === "low" ? o.confidence : undefined;

  return {
    userReply: combinedMessage,
    glucoseGalScore,
    verdict,
    intent,
    countAsDecision,
    suggestShareCard,
    topOrders,
    glucoseCurve,
    tip,
    mealGI,
    mealGL,
    confidence,
  };
}

export function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: getConfig().OPENAI_API_KEY });
}

function parseFoodExtraction(raw: unknown): FoodExtraction {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const intent = o.intent === "meal" ? "meal" : "chat";
  if (intent !== "meal") return { intent: "chat" };
  const foodName = typeof o.foodName === "string" ? o.foodName.trim() : "";
  const ingRaw = o.ingredients;
  const ingredients: { name: string; amount: string }[] = [];
  if (Array.isArray(ingRaw)) {
    for (const row of ingRaw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      const amount = typeof r.amount === "string" ? r.amount.trim() : typeof r.portion === "string" ? r.portion.trim() : "1 serving";
      if (name) ingredients.push({ name, amount: amount || "1 serving" });
    }
  }
  if (!foodName || ingredients.length === 0) return { intent: "chat" };
  return { intent: "meal", foodName, ingredients };
}

export async function extractFoodIngredients(params: {
  userText: string;
  imageBase64?: string;
  mimeType?: string;
  profileContext?: string;
}): Promise<FoodExtraction> {
  const client = getOpenAIClient();
  const model = params.imageBase64 && params.mimeType ? "gpt-4o" : "gpt-4o-mini";
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: params.userText || "What food is shown?" },
  ];
  if (params.imageBase64 && params.mimeType) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${params.mimeType};base64,${params.imageBase64}` },
    });
  }

  const extractionSystem = params.profileContext
    ? `${EXTRACTION_SYSTEM}\n\nUSER PROFILE:\n${params.profileContext}\n\nConsider this profile when analyzing food. If food contains allergens the user listed, still extract ingredients normally — the allergy warning will be added in the reply.`
    : EXTRACTION_SYSTEM;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: extractionSystem },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 800,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { intent: "chat" };
  try {
    return parseFoodExtraction(JSON.parse(raw) as unknown);
  } catch {
    return { intent: "chat" };
  }
}

const FoodReplySchema = z.object({
  message: z.string(),
  tip: z.string(),
});

export async function generateFoodReply(
  foodName: string,
  calc: GlucoseCalculation,
  knowledgeContext: KnowledgeResult[],
  profileContext?: string,
): Promise<{ message: string; tip: string }> {
  const science = knowledgeContext.map((k) => k.key_tip).filter(Boolean).join("\n");
  const verdictLower = calc.verdict;
  const profileBlock = profileContext
    ? `\n\nUSER PROFILE:\n${profileContext}\n\nTailor your reply and tip to this profile. If the user has allergies and this food may contain them, warn explicitly. If the food conflicts with their goal, mention it. If they prefer high protein, suggest protein additions.`
    : "";
  const system = `You are Gluci, a friendly glucose coach.
Speak like glucosegoddess — warm, scientific, practical.

The user ate: ${foodName}
Glucose score: ${calc.score}/10
Verdict: ${verdictLower}
Estimated peak: +${calc.peakMgDl} mg/dL at ${calc.peakMinute} minutes
Meal GI: ${calc.mealGI}, GL: ${calc.mealGL}

Relevant science:
${science || "(none)"}${profileBlock}

Write a JSON response:
{
  "message": "2-3 sentence friendly explanation of what will happen to their glucose and why",
  "tip": "One specific actionable tip to improve this meal or reduce the spike"
}
Do not mention GI or GL numbers to the user.
Do not say 'according to our database'.
Speak naturally.
Respond ONLY with valid JSON.`;

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: system }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 500,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { message: "Thanks for checking in — this meal should move your glucose in a predictable way.", tip: "Try adding protein or veggies first next time." };
  try {
    const parsed = FoodReplySchema.safeParse(JSON.parse(raw) as unknown);
    if (parsed.success) return { message: parsed.data.message.trim(), tip: parsed.data.tip.trim() };
  } catch {
    /* fall through */
  }
  return { message: "Thanks for checking in — this meal should move your glucose in a predictable way.", tip: "Try adding protein or veggies first next time." };
}

function stripJsonFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }
  return t.trim();
}

/** Parse structured JSON when present; otherwise treat as plain conversational text. */
function parseGluciTurnRaw(raw: string): unknown {
  const trimmed = stripJsonFences(raw);
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export async function runGluciTurn(params: {
  userText: string;
  imageBase64?: string;
  mimeType?: string;
  history: { role: "user" | "assistant"; content: string }[];
  profileContext: string;
  knowledgeContext?: KnowledgeResult[];
}): Promise<GluciResponse> {
  const kb =
    params.knowledgeContext && params.knowledgeContext.length > 0
      ? "\n\n" + buildKnowledgePrompt(params.knowledgeContext)
      : "";

  const client = getOpenAIClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SYSTEM_CORE + kb + "\n\nUser profile & memory:\n" + params.profileContext,
    },
    ...params.history.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  if (params.imageBase64 && params.mimeType) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: params.userText || "What do you think about this food?" },
        {
          type: "image_url",
          image_url: {
            url: `data:${params.mimeType};base64,${params.imageBase64}`,
          },
        },
      ],
    });
  } else {
    messages.push({ role: "user", content: params.userText });
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.7,
    max_tokens: 1600,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty LLM response");
  console.log("[llm raw response]", JSON.stringify(raw));
  const parsed = parseGluciTurnRaw(raw);
  return normalizeGluciResponse(parsed);
}
