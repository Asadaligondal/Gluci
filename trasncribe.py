import json, os, requests, whisper

# Load reel URLs
with open("reel_urls.json", "r", encoding="utf-8") as f:
    reels = json.load(f)

print(f"Total reels: {len(reels)}")

# Load Whisper on GPU
print("Loading Whisper model on GPU...")
model = whisper.load_model("base", device="cuda")

os.makedirs("videos", exist_ok=True)
transcriptions = []

for i, reel in enumerate(reels):
    print(f"\n[{i+1}/{len(reels)}] Processing: {reel['caption'][:50]}")
    
    video_path = f"videos/reel_{i}.mp4"
    
    try:
        # Download video
        r = requests.get(reel["url"], stream=True, timeout=30)
        with open(video_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        
        # Transcribe
        result = model.transcribe(video_path)
        transcript = result["text"].strip()
        
        transcriptions.append({
            "account": reel["account"],
            "date": reel["date"],
            "caption": reel["caption"],
            "transcript": transcript,
            "url": reel["url"]
        })
        
        # Delete video to save space
        os.remove(video_path)
        
        print(f"✓ Transcript: {transcript[:80]}")
        
        # Save progress every 10 reels
        if (i + 1) % 10 == 0:
            with open("transcriptions.json", "w", encoding="utf-8") as f:
                json.dump(transcriptions, f, indent=2, ensure_ascii=False)
            print(f"Progress saved: {i+1} done")
    
    except Exception as e:
        print(f"✗ Failed: {e}")
        continue

# Final save
with open("transcriptions.json", "w", encoding="utf-8") as f:
    json.dump(transcriptions, f, indent=2, ensure_ascii=False)

print(f"\nDone! {len(transcriptions)} reels transcribed → transcriptions.json")