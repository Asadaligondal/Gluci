#!/usr/bin/env python3
"""Seed instagram_knowledge from knowledge_base_enriched.json using OpenAI embeddings."""

from __future__ import annotations

import json
import os
import re
import sys

import psycopg2
from openai import OpenAI

ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(ROOT, "backend", ".env")
JSON_PATH = os.path.join(ROOT, "knowledge_base_enriched.json")


def load_env(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^(\w+)=(.+)$", line.strip())
            if m:
                os.environ[m.group(1)] = m.group(2).strip('"').strip("'")


def main() -> None:
    load_env(ENV_PATH)
    db_url = os.environ.get("DATABASE_URL")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not db_url:
        print("DATABASE_URL missing from backend/.env", file=sys.stderr)
        sys.exit(1)
    if not api_key:
        print("OPENAI_API_KEY missing from backend/.env", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(JSON_PATH):
        print(f"Missing {JSON_PATH}", file=sys.stderr)
        sys.exit(1)

    with open(JSON_PATH, encoding="utf-8") as f:
        posts = json.load(f)

    client = OpenAI(api_key=api_key)
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    insert_sql = """
    INSERT INTO instagram_knowledge (
      account, date, caption, foods, glucose_impact, spike_estimate_mg_dl,
      verdict, score, key_tip, likes, url, embedding
    ) VALUES (
      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector
    )
    """

    pending = 0
    inserted = 0
    skipped = 0

    for post in posts:
        ext = post.get("extracted") or {}
        if ext.get("relevant") is not True:
            continue

        url = post.get("url") or ""
        if not url:
            skipped += 1
            continue

        cur.execute("SELECT 1 FROM instagram_knowledge WHERE url = %s LIMIT 1", (url,))
        if cur.fetchone():
            skipped += 1
            continue

        foods = ext.get("foods") or []
        key_tip = ext.get("key_tip") or ""
        caption = (post.get("caption") or "")[:300]
        foods_str = ", ".join(foods) if isinstance(foods, list) else str(foods)
        embed_input = f"{foods_str} {key_tip} {caption}"

        emb = client.embeddings.create(model="text-embedding-3-small", input=embed_input)
        vec = emb.data[0].embedding
        vec_lit = "[" + ",".join(str(float(x)) for x in vec) + "]"

        cur.execute(
            insert_sql,
            (
                post.get("account") or "",
                post.get("date"),
                post.get("caption"),
                foods if isinstance(foods, list) else [],
                ext.get("glucose_impact"),
                ext.get("spike_estimate_mg_dl"),
                ext.get("verdict"),
                ext.get("score"),
                key_tip or None,
                post.get("likes"),
                url,
                vec_lit,
            ),
        )
        inserted += 1
        pending += 1

        if pending >= 20:
            conn.commit()
            pending = 0
            print(f"checkpoint: inserted total {inserted}, skipped {skipped}")

    if pending:
        conn.commit()

    cur.close()
    conn.close()
    print(f"Done. inserted={inserted}, skipped={skipped}")


if __name__ == "__main__":
    main()
