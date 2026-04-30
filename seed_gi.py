#!/usr/bin/env python3
"""Download GI CSV (best-effort) and seed PostgreSQL gi_food. Run from repo root after: prisma migrate."""

import csv
import io
import json
import os
import re
import urllib.request

try:
    import psycopg2
except ImportError as e:
    raise SystemExit("Install psycopg2: pip install psycopg2-binary") from e

ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(ROOT, "backend", ".env")
FALLBACK_JSON = os.path.join(ROOT, "gi_fallback.json")
FALLBACK_TSV = os.path.join(ROOT, "gi_fallback.tsv")


def load_fallback_tsv(path: str) -> list:
    out = []
    with open(path, encoding="utf-8") as tf:
        for line in tf:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("|")
            if len(parts) < 4:
                continue
            name, gi_s, carbs_s, cat = parts[0].strip(), parts[1].strip(), parts[2].strip(), parts[3].strip()
            if name.lower() == "name":
                continue
            try:
                out.append(
                    {
                        "name": name,
                        "gi": float(gi_s),
                        "carbs": float(carbs_s),
                        "category": cat or "general",
                    }
                )
            except ValueError:
                continue
    return out

env = {}
if os.path.isfile(ENV_PATH):
    with open(ENV_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"^(\w+)=(.+)$", line)
            if m:
                val = m.group(2).strip().strip('"').strip("'")
                env[m.group(1)] = val

if "DATABASE_URL" not in env:
    raise SystemExit(f"DATABASE_URL not found in {ENV_PATH}")

conn = psycopg2.connect(env["DATABASE_URL"])
cur = conn.cursor()

gi_data = []

# SOURCE 1 — Mendoza compiled GI dataset
try:
    url = "https://raw.githubusercontent.com/kaplan-michael/gi-database/main/gi_data.csv"
    response = urllib.request.urlopen(url, timeout=15)
    reader = csv.DictReader(io.StringIO(response.read().decode("utf-8")))
    for row in reader:
        try:
            gi_data.append(
                {
                    "name": row.get("food") or row.get("Food") or "",
                    "gi": float(row.get("gi") or row.get("GI") or 50),
                    "carbs": float(row.get("carbs_per_100g") or row.get("Carbohydrates") or 20),
                    "category": row.get("category") or "general",
                }
            )
        except Exception:
            continue
    print(f"SOURCE 1 loaded: {len(gi_data)} foods")
except Exception as e:
    print(f"SOURCE 1 failed: {e}")

# SOURCE 2 — Open GI Dataset mirror
if len(gi_data) < 100:
    try:
        url2 = "https://raw.githubusercontent.com/bloodglucose/gi-index/main/glycemic_index.csv"
        response2 = urllib.request.urlopen(url2, timeout=15)
        reader2 = csv.DictReader(io.StringIO(response2.read().decode("utf-8")))
        gi_data = []
        for row in reader2:
            try:
                gi_data.append(
                    {
                        "name": row.get("Food", ""),
                        "gi": float(row.get("GI", 50)),
                        "carbs": float(row.get("Carbohydrates", 20)),
                        "category": "general",
                    }
                )
            except Exception:
                continue
        print(f"SOURCE 2 loaded: {len(gi_data)} foods")
    except Exception as e:
        print(f"SOURCE 2 failed: {e}")

# SOURCE 3 — bundled gi_fallback.json / gi_fallback.tsv / minimal inline (matches hybrid scoring prompt)
if len(gi_data) < 100:
    if os.path.isfile(FALLBACK_JSON):
        with open(FALLBACK_JSON, encoding="utf-8") as jf:
            raw = json.load(jf)
        gi_data = [
            {
                "name": str(x["name"]),
                "gi": float(x["gi"]),
                "carbs": float(x["carbs"]),
                "category": x.get("category") or "general",
            }
            for x in raw
        ]
        print(f"SOURCE 3 (gi_fallback.json): {len(gi_data)} foods")
    elif os.path.isfile(FALLBACK_TSV):
        gi_data = load_fallback_tsv(FALLBACK_TSV)
        print(f"SOURCE 3 (gi_fallback.tsv): {len(gi_data)} foods")
    else:
        gi_data = [
            {"name": "white rice", "gi": 72, "carbs": 28, "category": "grain"},
            {"name": "chicken breast", "gi": 0, "carbs": 0, "category": "protein"},
            {"name": "donut", "gi": 76, "carbs": 49, "category": "sweet"},
            {"name": "orange juice", "gi": 50, "carbs": 10, "category": "drink"},
            {"name": "lentils", "gi": 32, "carbs": 20, "category": "legume"},
            {"name": "pizza", "gi": 60, "carbs": 30, "category": "mixed"},
        ]
        print(f"SOURCE 3 (inline minimal): {len(gi_data)} foods")

inserted = 0
skipped = 0
for item in gi_data:
    name = str(item.get("name") or "").strip()
    if not name:
        continue
    gi_val = item.get("gi")
    try:
        gi_float = float(gi_val)
    except (TypeError, ValueError):
        continue

    try:
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
                name.lower().strip(),
                gi_float,
                float(item.get("carbs", 20)),
                item.get("category") or "general",
                "auto",
            ),
        )
        if cur.rowcount > 0:
            inserted += 1
        else:
            skipped += 1
    except Exception as e:
        print(f"Insert error {name!r}: {e}")
        continue

    if (inserted + skipped) % 100 == 0:
        conn.commit()
        print(f"Progress: {inserted} inserted, {skipped} skipped")

conn.commit()
cur.close()
conn.close()
print(f"Done. {inserted} inserted, {skipped} skipped")
