/** USDA FoodData Central search — carbs per 100 g + coarse GI heuristic (not clinical GI). */

type Cached = { carbsPer100g: number; estimatedGI: number };

const cache = new Map<string, Cached>();

/** Returns heuristic GI only (same backing cache/search as fetchUSDAGuess). */
export async function getGIFromUSDA(foodName: string): Promise<number | null> {
  const hit = await fetchUSDAGuess(foodName);
  return hit ? hit.estimatedGI : null;
}

export async function fetchUSDAGuess(foodName: string): Promise<Cached | null> {
  const key = foodName.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const apiKey = process.env.USDA_API_KEY?.trim() || "DEMO_KEY";
    const url =
      `https://api.nal.usda.gov/fdc/v1/foods/search` +
      `?query=${encodeURIComponent(foodName)}` +
      `&dataType=Foundation,SR%20Legacy&pageSize=1&api_key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      foods?: Array<{ foodNutrients?: Array<{ nutrientId?: number; value?: number }> }>;
    };
    const food = data.foods?.[0];
    if (!food) return null;

    const carbNutrient = food.foodNutrients?.find((n) => n.nutrientId === 1005);
    const carbs = typeof carbNutrient?.value === "number" ? carbNutrient.value : 20;

    const estimatedGI = carbs > 60 ? 70 : carbs > 30 ? 55 : carbs > 10 ? 40 : 15;
    const cached = { carbsPer100g: carbs, estimatedGI };
    cache.set(key, cached);
    return cached;
  } catch {
    return null;
  }
}
