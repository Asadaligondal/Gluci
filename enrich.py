import json, os, time
from pathlib import Path

_env_file = Path(__file__).resolve().parent / ".env"
if _env_file.is_file():
    for line in _env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

with open('knowledge_base_clean.json', 'r', encoding='utf-8') as f:
    posts = json.load(f)

enriched = []

for i, post in enumerate(posts):
    print(f'[{i+1}/{len(posts)}] Processing: {post["caption"][:60]}')
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": """You are a nutrition data extractor. Extract structured glucose/nutrition info from Instagram captions.
Return ONLY valid JSON, nothing else:
{
  "foods": ["list of foods mentioned"],
  "glucose_impact": "low/medium/high/none",
  "spike_estimate_mg_dl": number or null,
  "verdict": "eat/modify/avoid/none",
  "score": number 1-10 or null,
  "key_tip": "one sentence tip or null",
  "relevant": true/false
}
If caption has no food/glucose info set relevant to false."""
            }, {
                "role": "user",
                "content": post["caption"]
            }],
            max_tokens=200,
            temperature=0
        )
        
        raw = response.choices[0].message.content.strip()
        extracted = json.loads(raw)
        
        enriched.append({
            **post,
            "extracted": extracted
        })
        
        if extracted.get("relevant"):
            print(f'  ✓ Foods: {extracted.get("foods")} | Score: {extracted.get("score")} | Verdict: {extracted.get("verdict")}')
        else:
            print(f'  - Not relevant, skipping')
        
        # Save every 20 posts
        if (i + 1) % 20 == 0:
            with open('knowledge_base_enriched.json', 'w', encoding='utf-8') as f:
                json.dump(enriched, f, indent=2, ensure_ascii=False)
            print(f'Progress saved: {i+1} done')
        
        time.sleep(0.5)
    
    except Exception as e:
        print(f'  ✗ Failed: {e}')
        enriched.append({**post, "extracted": None})
        continue

with open('knowledge_base_enriched.json', 'w', encoding='utf-8') as f:
    json.dump(enriched, f, indent=2, ensure_ascii=False)

relevant = [p for p in enriched if p.get('extracted') and p['extracted'].get('relevant')]
print(f'\nDone! {len(enriched)} processed, {len(relevant)} relevant posts')