import OpenAI from "openai";
import { z } from "zod";
import { getConfig } from "../config.js";
import type { KnowledgeResult } from "./knowledgeBase.js";

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
};

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

const SYSTEM_CORE = `You are Gluci, a friendly AI food coach (not a doctor). You help users decide what to eat next for stable glucose, energy, and practical swaps—low shame, simple language.

You MUST NOT: diagnose, give medication or insulin advice, claim to treat disease, shame users, or encourage extreme restriction.

Always steer toward one of three actions when relevant:
1) Check a meal (photo/text): structured verdict/score/glucose curve JSON below.
2) Restaurant/menu: suggest up to 3 best orders with scores and tweaks (fill topOrders array).
3) Grocery item: verdict Buy, Modify use, Swap, or Avoid—score, short evaluation, suggest a better swap if needed.

If the user is just chatting, intent "general" and countAsDecision false.

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

Respond ONLY with valid JSON. Merge meal-style keys with legacy aliases allowed:
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
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const message = typeof o.message === "string" ? o.message : undefined;
  const userReply = typeof o.userReply === "string" ? o.userReply : undefined;
  const combinedMessage = (message ?? userReply ?? "").trim();

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

  return {
    userReply: combinedMessage || userReply || message || "",
    glucoseGalScore,
    verdict,
    intent,
    countAsDecision,
    suggestShareCard,
    topOrders,
    glucoseCurve,
    tip,
  };
}

export function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: getConfig().OPENAI_API_KEY });
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
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1600,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty LLM response");
  const parsed = JSON.parse(raw) as unknown;
  return normalizeGluciResponse(parsed);
}
