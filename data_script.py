import json

try:
    with open("instagram_raw.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"Total items loaded: {len(data)}")
    print(f"First item keys: {list(data[0].keys())}")
    
    posts = []
    for item in data:
        caption = item.get("caption", "")
        if not caption or len(caption) < 30:
            continue
        posts.append({
            "account": item.get("ownerUsername", ""),
            "date": item.get("timestamp", "")[:10],
            "caption": caption,
            "hashtags": item.get("hashtags", []),
            "likes": item.get("likesCount", 0),
            "url": item.get("url", ""),
            "type": item.get("type", "")
        })

    posts.sort(key=lambda x: x["likes"], reverse=True)

    with open("knowledge_base_raw.json", "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)

    print(f"Extracted {len(posts)} usable posts")

except Exception as e:
    print(f"Error: {e}")