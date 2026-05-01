#!/usr/bin/env python3
"""Append validated GI rows to gi_food (South Asian, Middle Eastern, mixed dishes, etc.).
Safe on existing DB: ON CONFLICT (name_lower) DO NOTHING.

Usage (repo root):  pip install psycopg2-binary && python seed_gi_expanded.py
"""

import os
import re
from typing import Dict

try:
    import psycopg2
except ImportError as e:
    raise SystemExit("Install psycopg2: pip install psycopg2-binary") from e

ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(ROOT, "backend", ".env")

EXPANDED_GI_DATA = [
    # South Asian dishes
    {"name": "biryani", "gi": 63, "carbs": 28, "category": "mixed"},
    {"name": "chicken biryani", "gi": 63, "carbs": 28, "category": "mixed"},
    {"name": "mutton biryani", "gi": 60, "carbs": 26, "category": "mixed"},
    {"name": "vegetable biryani", "gi": 65, "carbs": 30, "category": "mixed"},
    {"name": "dal", "gi": 32, "carbs": 20, "category": "legume"},
    {"name": "dal makhani", "gi": 30, "carbs": 18, "category": "legume"},
    {"name": "dal tadka", "gi": 32, "carbs": 19, "category": "legume"},
    {"name": "chana dal", "gi": 28, "carbs": 22, "category": "legume"},
    {"name": "masoor dal", "gi": 26, "carbs": 20, "category": "legume"},
    {"name": "roti", "gi": 62, "carbs": 43, "category": "bread"},
    {"name": "chapati", "gi": 62, "carbs": 43, "category": "bread"},
    {"name": "paratha", "gi": 66, "carbs": 40, "category": "bread"},
    {"name": "aloo paratha", "gi": 70, "carbs": 42, "category": "bread"},
    {"name": "naan", "gi": 71, "carbs": 50, "category": "bread"},
    {"name": "puri", "gi": 74, "carbs": 44, "category": "bread"},
    {"name": "idli", "gi": 50, "carbs": 22, "category": "grain"},
    {"name": "dosa", "gi": 55, "carbs": 28, "category": "grain"},
    {"name": "sambar", "gi": 25, "carbs": 12, "category": "legume"},
    {"name": "palak paneer", "gi": 25, "carbs": 8, "category": "mixed"},
    {"name": "paneer", "gi": 0, "carbs": 2, "category": "protein"},
    {"name": "butter chicken", "gi": 15, "carbs": 8, "category": "mixed"},
    {"name": "chicken tikka masala", "gi": 15, "carbs": 9, "category": "mixed"},
    {"name": "chicken tikka", "gi": 0, "carbs": 2, "category": "protein"},
    {"name": "tandoori chicken", "gi": 0, "carbs": 3, "category": "protein"},
    {"name": "seekh kebab", "gi": 0, "carbs": 5, "category": "protein"},
    {"name": "shami kebab", "gi": 15, "carbs": 10, "category": "protein"},
    {"name": "nihari", "gi": 10, "carbs": 6, "category": "mixed"},
    {"name": "karahi", "gi": 10, "carbs": 7, "category": "mixed"},
    {"name": "haleem", "gi": 35, "carbs": 18, "category": "mixed"},
    {"name": "khichdi", "gi": 58, "carbs": 25, "category": "mixed"},
    {"name": "pulao", "gi": 60, "carbs": 26, "category": "mixed"},
    {"name": "raita", "gi": 20, "carbs": 6, "category": "dairy"},
    {"name": "lassi", "gi": 40, "carbs": 16, "category": "drink"},
    {"name": "mango lassi", "gi": 55, "carbs": 22, "category": "drink"},
    {"name": "kheer", "gi": 65, "carbs": 28, "category": "sweet"},
    {"name": "gulab jamun", "gi": 75, "carbs": 50, "category": "sweet"},
    {"name": "halwa", "gi": 70, "carbs": 45, "category": "sweet"},
    {"name": "barfi", "gi": 65, "carbs": 55, "category": "sweet"},
    {"name": "samosa", "gi": 55, "carbs": 30, "category": "snack"},
    {"name": "pakora", "gi": 55, "carbs": 28, "category": "snack"},
    {"name": "chaat", "gi": 55, "carbs": 32, "category": "snack"},
    {"name": "pav bhaji", "gi": 65, "carbs": 35, "category": "mixed"},
    {"name": "chole bhature", "gi": 62, "carbs": 38, "category": "mixed"},
    {"name": "rajma", "gi": 29, "carbs": 22, "category": "legume"},
    {"name": "rajma chawal", "gi": 48, "carbs": 28, "category": "mixed"},
    {"name": "aloo gobi", "gi": 45, "carbs": 15, "category": "mixed"},
    {"name": "saag", "gi": 15, "carbs": 5, "category": "vegetable"},
    {"name": "bhindi", "gi": 20, "carbs": 7, "category": "vegetable"},
    {"name": "baingan bharta", "gi": 15, "carbs": 6, "category": "vegetable"},
    {"name": "matter paneer", "gi": 30, "carbs": 12, "category": "mixed"},
    {"name": "shahi paneer", "gi": 20, "carbs": 10, "category": "mixed"},
    {"name": "korma", "gi": 15, "carbs": 8, "category": "mixed"},
    {"name": "biryani rice", "gi": 63, "carbs": 28, "category": "grain"},
    {"name": "basmati rice cooked", "gi": 57, "carbs": 25, "category": "grain"},
    # Middle Eastern dishes
    {"name": "hummus", "gi": 6, "carbs": 14, "category": "legume"},
    {"name": "falafel", "gi": 32, "carbs": 32, "category": "mixed"},
    {"name": "shawarma", "gi": 45, "carbs": 20, "category": "mixed"},
    {"name": "chicken shawarma", "gi": 40, "carbs": 18, "category": "mixed"},
    {"name": "beef shawarma", "gi": 40, "carbs": 15, "category": "mixed"},
    {"name": "kebab", "gi": 10, "carbs": 5, "category": "protein"},
    {"name": "shish kebab", "gi": 0, "carbs": 3, "category": "protein"},
    {"name": "kofta", "gi": 10, "carbs": 8, "category": "protein"},
    {"name": "pita bread", "gi": 68, "carbs": 55, "category": "bread"},
    {"name": "lavash", "gi": 68, "carbs": 55, "category": "bread"},
    {"name": "tabouleh", "gi": 30, "carbs": 12, "category": "mixed"},
    {"name": "fattoush", "gi": 25, "carbs": 10, "category": "mixed"},
    {"name": "baba ganoush", "gi": 15, "carbs": 8, "category": "mixed"},
    {"name": "mezze", "gi": 25, "carbs": 12, "category": "mixed"},
    {"name": "muhammara", "gi": 20, "carbs": 10, "category": "mixed"},
    {"name": "mansaf", "gi": 55, "carbs": 25, "category": "mixed"},
    {"name": "maqluba", "gi": 58, "carbs": 26, "category": "mixed"},
    {"name": "mujaddara", "gi": 35, "carbs": 22, "category": "mixed"},
    {"name": "koshari", "gi": 52, "carbs": 28, "category": "mixed"},
    {"name": "baklava", "gi": 55, "carbs": 40, "category": "sweet"},
    {"name": "kunafa", "gi": 65, "carbs": 45, "category": "sweet"},
    {"name": "dates", "gi": 42, "carbs": 75, "category": "fruit"},
    {"name": "medjool dates", "gi": 42, "carbs": 75, "category": "fruit"},
    # East Asian dishes
    {"name": "sushi rice", "gi": 72, "carbs": 32, "category": "grain"},
    {"name": "maki roll", "gi": 55, "carbs": 28, "category": "mixed"},
    {"name": "ramen", "gi": 68, "carbs": 26, "category": "mixed"},
    {"name": "tonkotsu ramen", "gi": 65, "carbs": 24, "category": "mixed"},
    {"name": "miso soup", "gi": 10, "carbs": 3, "category": "mixed"},
    {"name": "edamame", "gi": 18, "carbs": 10, "category": "legume"},
    {"name": "gyoza", "gi": 55, "carbs": 28, "category": "mixed"},
    {"name": "dim sum", "gi": 55, "carbs": 30, "category": "mixed"},
    {"name": "fried rice", "gi": 72, "carbs": 28, "category": "mixed"},
    {"name": "egg fried rice", "gi": 70, "carbs": 26, "category": "mixed"},
    {"name": "pad thai", "gi": 60, "carbs": 26, "category": "mixed"},
    {"name": "green curry", "gi": 40, "carbs": 12, "category": "mixed"},
    {"name": "red curry", "gi": 40, "carbs": 12, "category": "mixed"},
    {"name": "massaman curry", "gi": 45, "carbs": 15, "category": "mixed"},
    {"name": "spring rolls", "gi": 52, "carbs": 28, "category": "mixed"},
    {"name": "pho", "gi": 60, "carbs": 20, "category": "mixed"},
    {"name": "banh mi", "gi": 62, "carbs": 32, "category": "mixed"},
    {"name": "bibimbap", "gi": 58, "carbs": 26, "category": "mixed"},
    {"name": "kimchi", "gi": 15, "carbs": 5, "category": "vegetable"},
    {"name": "nori", "gi": 15, "carbs": 5, "category": "vegetable"},
    {"name": "tofu soup", "gi": 15, "carbs": 4, "category": "mixed"},
    {"name": "udon", "gi": 55, "carbs": 22, "category": "grain"},
    {"name": "soba noodles", "gi": 46, "carbs": 24, "category": "grain"},
    {"name": "glass noodles", "gi": 39, "carbs": 24, "category": "grain"},
    {"name": "congee", "gi": 78, "carbs": 18, "category": "grain"},
    {"name": "dumplings", "gi": 55, "carbs": 30, "category": "mixed"},
    {"name": "bao bun", "gi": 68, "carbs": 42, "category": "bread"},
    {"name": "wontons", "gi": 55, "carbs": 28, "category": "mixed"},
    # Western / fast food
    {"name": "cheeseburger", "gi": 65, "carbs": 30, "category": "mixed"},
    {"name": "double burger", "gi": 65, "carbs": 28, "category": "mixed"},
    {"name": "veggie burger", "gi": 60, "carbs": 32, "category": "mixed"},
    {"name": "hot dog", "gi": 65, "carbs": 22, "category": "mixed"},
    {"name": "fish and chips", "gi": 70, "carbs": 35, "category": "mixed"},
    {"name": "fish tacos", "gi": 52, "carbs": 28, "category": "mixed"},
    {"name": "chicken wrap", "gi": 55, "carbs": 30, "category": "mixed"},
    {"name": "club sandwich", "gi": 62, "carbs": 32, "category": "mixed"},
    {"name": "BLT sandwich", "gi": 60, "carbs": 30, "category": "mixed"},
    {"name": "grilled cheese", "gi": 62, "carbs": 28, "category": "mixed"},
    {"name": "mac and cheese", "gi": 55, "carbs": 32, "category": "mixed"},
    {"name": "chicken nuggets", "gi": 66, "carbs": 20, "category": "mixed"},
    {"name": "onion rings", "gi": 75, "carbs": 40, "category": "snack"},
    {"name": "nachos", "gi": 65, "carbs": 48, "category": "snack"},
    {"name": "quesadilla", "gi": 58, "carbs": 35, "category": "mixed"},
    {"name": "enchiladas", "gi": 60, "carbs": 30, "category": "mixed"},
    {"name": "pasta salad", "gi": 45, "carbs": 28, "category": "mixed"},
    {"name": "caesar salad", "gi": 15, "carbs": 8, "category": "mixed"},
    {"name": "greek salad", "gi": 15, "carbs": 7, "category": "mixed"},
    {"name": "coleslaw", "gi": 25, "carbs": 12, "category": "mixed"},
    {"name": "potato salad", "gi": 58, "carbs": 20, "category": "mixed"},
    {"name": "corn on the cob", "gi": 52, "carbs": 19, "category": "vegetable"},
    {"name": "baked beans", "gi": 40, "carbs": 20, "category": "legume"},
    {"name": "scrambled eggs", "gi": 0, "carbs": 1, "category": "protein"},
    {"name": "fried eggs", "gi": 0, "carbs": 1, "category": "protein"},
    {"name": "boiled eggs", "gi": 0, "carbs": 1, "category": "protein"},
    {"name": "omelette", "gi": 0, "carbs": 2, "category": "protein"},
    {"name": "french toast", "gi": 65, "carbs": 36, "category": "mixed"},
    {"name": "eggs benedict", "gi": 40, "carbs": 20, "category": "mixed"},
    {"name": "full english breakfast", "gi": 45, "carbs": 22, "category": "mixed"},
    {"name": "porridge", "gi": 55, "carbs": 27, "category": "grain"},
    {"name": "overnight oats", "gi": 52, "carbs": 26, "category": "grain"},
    {"name": "acai bowl", "gi": 52, "carbs": 35, "category": "mixed"},
    {"name": "smoothie bowl", "gi": 55, "carbs": 38, "category": "mixed"},
    {"name": "avocado toast", "gi": 45, "carbs": 22, "category": "mixed"},
    {"name": "banana bread", "gi": 65, "carbs": 48, "category": "bread"},
    {"name": "protein bar", "gi": 35, "carbs": 30, "category": "snack"},
    {"name": "energy bar", "gi": 50, "carbs": 40, "category": "snack"},
    {"name": "granola bar", "gi": 60, "carbs": 45, "category": "snack"},
    {"name": "trail mix", "gi": 25, "carbs": 30, "category": "snack"},
    # Proteins expanded
    {"name": "grilled chicken", "gi": 0, "carbs": 0, "category": "protein"},
    {"name": "roasted chicken", "gi": 0, "carbs": 0, "category": "protein"},
    {"name": "chicken curry", "gi": 15, "carbs": 8, "category": "mixed"},
    {"name": "grilled salmon", "gi": 0, "carbs": 0, "category": "protein"},
    {"name": "grilled fish", "gi": 0, "carbs": 0, "category": "protein"},
    {"name": "fish curry", "gi": 15, "carbs": 7, "category": "mixed"},
    {"name": "prawn curry", "gi": 10, "carbs": 5, "category": "mixed"},
    {"name": "lamb chops", "gi": 0, "carbs": 0, "category": "protein"},
    {"name": "beef stew", "gi": 30, "carbs": 12, "category": "mixed"},
    {"name": "beef steak", "gi": 0, "carbs": 0, "category": "protein"},
    {"name": "pork ribs", "gi": 0, "carbs": 5, "category": "protein"},
    {"name": "bacon", "gi": 0, "carbs": 1, "category": "protein"},
    {"name": "sausage", "gi": 28, "carbs": 10, "category": "protein"},
    {"name": "turkey", "gi": 0, "carbs": 0, "category": "protein"},
    {"name": "duck", "gi": 0, "carbs": 0, "category": "protein"},
    # Vegetables expanded
    {"name": "roasted vegetables", "gi": 40, "carbs": 12, "category": "vegetable"},
    {"name": "stir fried vegetables", "gi": 20, "carbs": 8, "category": "vegetable"},
    {"name": "steamed broccoli", "gi": 10, "carbs": 7, "category": "vegetable"},
    {"name": "steamed vegetables", "gi": 20, "carbs": 8, "category": "vegetable"},
    {"name": "mixed vegetables", "gi": 25, "carbs": 8, "category": "vegetable"},
    {"name": "green beans", "gi": 15, "carbs": 7, "category": "vegetable"},
    {"name": "brussels sprouts", "gi": 15, "carbs": 7, "category": "vegetable"},
    {"name": "bok choy", "gi": 10, "carbs": 2, "category": "vegetable"},
    {"name": "artichoke", "gi": 15, "carbs": 11, "category": "vegetable"},
    {"name": "leek", "gi": 15, "carbs": 14, "category": "vegetable"},
    {"name": "radish", "gi": 15, "carbs": 3, "category": "vegetable"},
    {"name": "turnip", "gi": 62, "carbs": 6, "category": "vegetable"},
    {"name": "butternut squash", "gi": 51, "carbs": 10, "category": "vegetable"},
    {"name": "acorn squash", "gi": 55, "carbs": 10, "category": "vegetable"},
    # Fruits expanded
    {"name": "pomegranate", "gi": 35, "carbs": 19, "category": "fruit"},
    {"name": "papaya", "gi": 60, "carbs": 11, "category": "fruit"},
    {"name": "guava", "gi": 12, "carbs": 14, "category": "fruit"},
    {"name": "lychee", "gi": 57, "carbs": 17, "category": "fruit"},
    {"name": "jackfruit", "gi": 50, "carbs": 24, "category": "fruit"},
    {"name": "coconut", "gi": 45, "carbs": 15, "category": "fruit"},
    {"name": "coconut milk", "gi": 40, "carbs": 6, "category": "dairy"},
    {"name": "dried apricot", "gi": 32, "carbs": 63, "category": "fruit"},
    {"name": "dried mango", "gi": 60, "carbs": 78, "category": "fruit"},
    {"name": "raisins", "gi": 64, "carbs": 79, "category": "fruit"},
    # Dairy expanded
    {"name": "whey protein", "gi": 0, "carbs": 5, "category": "protein"},
    {"name": "protein shake", "gi": 15, "carbs": 8, "category": "drink"},
    {"name": "kefir", "gi": 35, "carbs": 6, "category": "dairy"},
    {"name": "sour cream", "gi": 0, "carbs": 3, "category": "dairy"},
    {"name": "heavy cream", "gi": 0, "carbs": 3, "category": "dairy"},
    {"name": "cheddar", "gi": 0, "carbs": 1, "category": "dairy"},
    {"name": "mozzarella", "gi": 0, "carbs": 2, "category": "dairy"},
    {"name": "parmesan", "gi": 0, "carbs": 3, "category": "dairy"},
    {"name": "feta cheese", "gi": 0, "carbs": 1, "category": "dairy"},
    # Drinks expanded
    {"name": "matcha latte", "gi": 40, "carbs": 10, "category": "drink"},
    {"name": "oat milk", "gi": 60, "carbs": 9, "category": "drink"},
    {"name": "almond milk", "gi": 25, "carbs": 1, "category": "drink"},
    {"name": "soy milk", "gi": 30, "carbs": 2, "category": "drink"},
    {"name": "coconut water", "gi": 55, "carbs": 9, "category": "drink"},
    {"name": "lemonade", "gi": 55, "carbs": 11, "category": "drink"},
    {"name": "iced tea", "gi": 45, "carbs": 10, "category": "drink"},
    {"name": "kombucha", "gi": 25, "carbs": 7, "category": "drink"},
    {"name": "protein smoothie", "gi": 30, "carbs": 20, "category": "drink"},
    {"name": "green smoothie", "gi": 35, "carbs": 18, "category": "drink"},
    {"name": "fruit smoothie", "gi": 55, "carbs": 25, "category": "drink"},
    {"name": "cold brew coffee", "gi": 0, "carbs": 0, "category": "drink"},
    # Condiments and sauces
    {"name": "ketchup", "gi": 55, "carbs": 24, "category": "sauce"},
    {"name": "mayonnaise", "gi": 0, "carbs": 1, "category": "sauce"},
    {"name": "mustard", "gi": 35, "carbs": 6, "category": "sauce"},
    {"name": "soy sauce", "gi": 20, "carbs": 5, "category": "sauce"},
    {"name": "hot sauce", "gi": 10, "carbs": 3, "category": "sauce"},
    {"name": "bbq sauce", "gi": 55, "carbs": 28, "category": "sauce"},
    {"name": "tahini", "gi": 10, "carbs": 21, "category": "sauce"},
    {"name": "tzatziki", "gi": 10, "carbs": 4, "category": "sauce"},
    {"name": "vinegar", "gi": 0, "carbs": 0, "category": "sauce"},
    {"name": "olive oil", "gi": 0, "carbs": 0, "category": "fat"},
    {"name": "coconut oil", "gi": 0, "carbs": 0, "category": "fat"},
    {"name": "ghee", "gi": 0, "carbs": 0, "category": "fat"},
    # Grains expanded
    {"name": "white bread roll", "gi": 73, "carbs": 50, "category": "bread"},
    {"name": "whole grain bread", "gi": 51, "carbs": 41, "category": "bread"},
    {"name": "ezekiel bread", "gi": 36, "carbs": 34, "category": "bread"},
    {"name": "corn bread", "gi": 69, "carbs": 42, "category": "bread"},
    {"name": "rye crispbread", "gi": 55, "carbs": 70, "category": "snack"},
    {"name": "rice paper", "gi": 61, "carbs": 80, "category": "grain"},
    {"name": "vermicelli", "gi": 35, "carbs": 28, "category": "grain"},
    {"name": "orzo", "gi": 47, "carbs": 30, "category": "grain"},
    {"name": "bulgur wheat", "gi": 46, "carbs": 26, "category": "grain"},
    {"name": "freekeh", "gi": 43, "carbs": 24, "category": "grain"},
    {"name": "amaranth", "gi": 35, "carbs": 29, "category": "grain"},
    {"name": "teff", "gi": 57, "carbs": 28, "category": "grain"},
    {"name": "sorghum", "gi": 62, "carbs": 28, "category": "grain"},
    # Sweets expanded
    {"name": "tiramisu", "gi": 55, "carbs": 32, "category": "sweet"},
    {"name": "panna cotta", "gi": 45, "carbs": 18, "category": "sweet"},
    {"name": "creme brulee", "gi": 55, "carbs": 22, "category": "sweet"},
    {"name": "macarons", "gi": 55, "carbs": 60, "category": "sweet"},
    {"name": "churros", "gi": 72, "carbs": 45, "category": "sweet"},
    {"name": "crepes", "gi": 66, "carbs": 35, "category": "sweet"},
    {"name": "waffles with syrup", "gi": 80, "carbs": 55, "category": "sweet"},
    {"name": "fruit salad", "gi": 45, "carbs": 14, "category": "fruit"},
    {"name": "jelly", "gi": 80, "carbs": 65, "category": "sweet"},
    {"name": "sorbet", "gi": 65, "carbs": 35, "category": "sweet"},
    {"name": "frozen yogurt", "gi": 50, "carbs": 22, "category": "dairy"},
    {"name": "rice pudding", "gi": 75, "carbs": 26, "category": "sweet"},
    {"name": "bread pudding", "gi": 65, "carbs": 38, "category": "sweet"},
]


def load_env(path: str) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not os.path.isfile(path):
        raise SystemExit(f"Missing {path}")
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"^(\w+)=(.+)$", line)
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def main() -> None:
    env = load_env(ENV_PATH)
    if "DATABASE_URL" not in env:
        raise SystemExit(f"DATABASE_URL not found in {ENV_PATH}")

    conn = psycopg2.connect(env["DATABASE_URL"])
    cur = conn.cursor()

    inserted = 0
    skipped = 0

    for item in EXPANDED_GI_DATA:
        name = str(item["name"]).strip()
        if not name:
            continue
        try:
            gi_val = float(item["gi"])
            carbs_val = float(item["carbs"])
            cat = item.get("category") or "general"
            cur.execute(
                """
                INSERT INTO gi_food
                    (name, name_lower, gi_value,
                     carbs_per_100g, category, source)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (name_lower) DO NOTHING
                """,
                (
                    name,
                    name.lower(),
                    gi_val,
                    carbs_val,
                    cat,
                    "manual_validated",
                ),
            )
            if cur.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
            conn.commit()
        except Exception as e:
            print(f"Error {name!r}: {e}")
            conn.rollback()
            continue

    cur.close()
    conn.close()
    print(f"Done. {inserted} new foods, {skipped} already existed")


if __name__ == "__main__":
    main()
