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

export interface RAGGlucoseHint {
  hasHint: boolean;
  suggestedScore: number | null;
  suggestedImpact: "low" | "medium" | "high" | null;
  suggestedPeakMgDl: number | null;
  confidence: number;
  source: string;
}

export function extractGlucoseHint(knowledge: KnowledgeResult[]): RAGGlucoseHint {
  const highConfidence = knowledge.filter((k) => k.similarity > 0.80);

  if (highConfidence.length === 0) {
    return { hasHint: false, suggestedScore: null, suggestedImpact: null, suggestedPeakMgDl: null, confidence: 0, source: "" };
  }

  const best = highConfidence[0];
  const ragScore = best.score;
  const impact = ["low", "medium", "high"].includes(best.glucose_impact)
    ? (best.glucose_impact as "low" | "medium" | "high")
    : null;
  const ragPeak = best.spike_estimate_mg_dl;

  const impactFromVerdict =
    best.verdict === "eat" ? "low"
    : best.verdict === "modify" ? "medium"
    : best.verdict === "avoid" ? "high"
    : null;

  const finalImpact = impact ?? impactFromVerdict;
  const hasHint = !!(ragScore || finalImpact || ragPeak);

  return {
    hasHint,
    suggestedScore: ragScore,
    suggestedImpact: finalImpact,
    suggestedPeakMgDl: ragPeak,
    confidence: best.similarity,
    source: best.account,
  };
}
