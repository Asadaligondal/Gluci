export type OffProduct = {
  name: string;
  brands?: string;
  nutritionGrade?: string;
  nutriments?: Record<string, number | undefined>;
  raw: unknown;
};

export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const clean = barcode.replace(/\D/g, "");
  if (clean.length < 8) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}.json`;
  const res = await fetch(url, { headers: { "User-Agent": "GluciMVP/0.1 (contact@gluci.app)" } });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const nutriments = (p.nutriments as Record<string, number | undefined> | undefined) ?? {};
  return {
    name: String(p.product_name ?? p.product_name_en ?? "Unknown product"),
    brands: p.brands ? String(p.brands) : undefined,
    nutritionGrade: p.nutrition_grade_fr ? String(p.nutrition_grade_fr) : undefined,
    nutriments,
    raw: p,
  };
}
