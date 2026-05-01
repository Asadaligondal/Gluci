export type OffProduct = {
  name: string;
  brand: string | null;
  category: string | null;
  categories: string | null;
  imageUrl: string | null;
  servingSize: number | null;
  ingredients_text: string | null;
  nutrients: {
    calories: number | null;
    carbs: number | null;
    sugars: number | null;
    fiber: number | null;
    protein: number | null;
    fat: number | null;
  } | null;
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
  const n = (p.nutriments as Record<string, number | undefined> | undefined) ?? {};

  let servingSize: number | null = null;
  if (typeof p.serving_quantity === "number") {
    servingSize = p.serving_quantity as number;
  } else if (typeof p.serving_size === "string") {
    const m = (p.serving_size as string).match(/(\d+(?:\.\d+)?)/);
    if (m) servingSize = parseFloat(m[1]);
  }

  const calories = typeof n["energy-kcal_100g"] === "number" ? (n["energy-kcal_100g"] as number) : null;
  const carbs = typeof n["carbohydrates_100g"] === "number" ? (n["carbohydrates_100g"] as number) : null;
  const hasNutrients = calories !== null || carbs !== null;

  const imageUrl = p.image_front_url
    ? String(p.image_front_url)
    : p.image_url
    ? String(p.image_url)
    : null;

  const categoriesTags = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  const firstCategory =
    categoriesTags.length > 0
      ? String(categoriesTags[0])
          .replace(/^en:/, "")
          .replace(/-/g, " ")
      : null;

  return {
    name: String(p.product_name ?? p.product_name_en ?? "Unknown product"),
    brand: p.brands ? String(p.brands) : null,
    category: firstCategory,
    categories: p.categories ? String(p.categories) : null,
    imageUrl,
    servingSize,
    ingredients_text: p.ingredients_text ? String(p.ingredients_text) : null,
    nutrients: hasNutrients
      ? {
          calories,
          carbs,
          sugars: typeof n["sugars_100g"] === "number" ? (n["sugars_100g"] as number) : null,
          fiber: typeof n["fiber_100g"] === "number" ? (n["fiber_100g"] as number) : null,
          protein: typeof n["proteins_100g"] === "number" ? (n["proteins_100g"] as number) : null,
          fat: typeof n["fat_100g"] === "number" ? (n["fat_100g"] as number) : null,
        }
      : null,
  };
}
