import OpenAI from "openai";
import { prisma } from "../db.js";
import { getConfig } from "../config.js";

export interface KnowledgeResult {
  id: number;
  account: string;
  caption: string;
  foods: string[];
  glucose_impact: string;
  spike_estimate_mg_dl: number | null;
  verdict: string;
  score: number | null;
  key_tip: string;
  similarity: number;
}

export async function findRelevantKnowledge(
  foodDescription: string,
  limit: number = 3,
): Promise<KnowledgeResult[]> {
  const trimmed = foodDescription.trim();
  if (!trimmed) return [];

  const client = new OpenAI({ apiKey: getConfig().OPENAI_API_KEY });
  const emb = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: trimmed,
  });
  const vec = emb.data[0]?.embedding;
  if (!vec?.length) return [];

  const vecLiteral = `[${vec.map((n) => Number(n)).join(",")}]`;

  type Row = {
    id: number;
    account: string;
    caption: string | null;
    foods: string[];
    glucose_impact: string | null;
    spike_estimate_mg_dl: number | null;
    verdict: string | null;
    score: number | null;
    key_tip: string | null;
    similarity: unknown;
  };

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    SELECT id, account, caption, foods, glucose_impact,
           spike_estimate_mg_dl, verdict, score, key_tip,
           1 - (embedding <=> $1::vector) AS similarity
    FROM instagram_knowledge
    WHERE 1 - (embedding <=> $1::vector) > 0.7
    ORDER BY similarity DESC
    LIMIT $2
    `,
    vecLiteral,
    limit,
  );

  return rows.map((r) => ({
    id: r.id,
    account: r.account,
    caption: r.caption ?? "",
    foods: Array.isArray(r.foods) ? r.foods : [],
    glucose_impact: r.glucose_impact ?? "",
    spike_estimate_mg_dl: r.spike_estimate_mg_dl,
    verdict: r.verdict ?? "",
    score: r.score,
    key_tip: r.key_tip ?? "",
    similarity: Number(r.similarity),
  }));
}
