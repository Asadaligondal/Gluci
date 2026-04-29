import json

with open("Raw_reels_data.json", "r", encoding="utf-8") as f:
    data = json.load(f)

urls = []
for item in data:
    if item.get("type") == "Video" and item.get("videoUrl"):
        urls.append({
            "url": item["videoUrl"],
            "account": item.get("ownerUsername", ""),
            "caption": item.get("caption", ""),
            "date": item.get("timestamp", "")[:10]
        })

with open("reel_urls.json", "w") as f:
    json.dump(urls, f, indent=2)

print(f"Found {len(urls)} reels with video URLs")