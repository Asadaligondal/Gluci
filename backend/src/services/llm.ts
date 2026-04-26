import OpenAI from "openai";
import { z } from "zod";
import { getConfig } from "../config.js";

const ResponseSchema = z.object({
  userReply: z.string(),
  glucoseGalScore: z.number().min(0).max(10),
  verdict: z.string(),
  intent: z.enum(["meal", "restaurant", "grocery", "general"]),
  countAsDecision: z.boolean(),
  suggestShareCard: z.boolean(),
  topOrders: z
    .array(
      z.object({
        name: z.string(),
        score: z.number(),
        tweaks: z.string(),
      }),
    )
    .optional(),
});

export type GluciResponse = z.infer<typeof ResponseSchema>;

const SYSTEM = `You are Gluci, a friendly AI food coach (not a doctor). You help users decide what to eat next for stable glucose, energy, and practical swaps—low shame, simple language.

You MUST NOT: diagnose, give medication or insulin advice, claim to treat disease, shame users, or encourage extreme restriction.

Always steer toward one of three actions when relevant:
1) Check a meal (photo/text): output GlucoseGal Score /10 one decimal, verdict one of: Eat, Modify, Avoid, Save for later—plus short practical tweaks.
2) Restaurant/menu: suggest up to 3 best orders with scores and tweaks (fill topOrders array).
3) Grocery item: verdict Buy, Modify use, Swap, or Avoid—score, short evaluation, suggest a better swap if needed.

If the user is just chatting, intent "general" and countAsDecision false.

Respond ONLY with valid JSON matching this shape:
{"userReply":"string","glucoseGalScore":number,"verdict":"string","intent":"meal"|"restaurant"|"grocery"|"general","countAsDecision":boolean,"suggestShareCard":boolean,"topOrders":[{"name":"string","score":number,"tweaks":"string"}]}

topOrders: include only for restaurant/menu style questions (max 3 items); otherwise omit or use empty array.

userReply should be conversational and include the score and verdict naturally. If suggestShareCard is true, end with a short line like "Want me to turn this into a GlucoseGal share card?"`;

function getClient() {
  return new OpenAI({ apiKey: getConfig().OPENAI_API_KEY });
}

export async function runGluciTurn(params: {
  userText: string;
  imageBase64?: string;
  mimeType?: string;
  history: { role: "user" | "assistant"; content: string }[];
  profileContext: string;
}): Promise<GluciResponse> {
  const client = getClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM + "\n\nUser profile & memory:\n" + params.profileContext },
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
    max_tokens: 1200,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty LLM response");
  const parsed = JSON.parse(raw) as unknown;
  return ResponseSchema.parse(parsed);
}
