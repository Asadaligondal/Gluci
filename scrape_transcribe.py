import instaloader, whisper, json, os, time

# Setup
L = instaloader.Instaloader()
L.load_session_from_file('averageenginneer')
model = whisper.load_model("base", device="cuda")
os.makedirs("videos", exist_ok=True)

transcriptions = []
accounts = ["insulinresistant1", "glucosegoddess"]

for account in accounts:
    print(f"\n--- Scraping {account} ---")
    profile = instaloader.Profile.from_username(L.context, account)
    
    for i, post in enumerate(profile.get_posts()):
        if not post.is_video:
            continue
        
        print(f"[{account}] Post {i+1}: {str(post.caption)[:50]}")
        
        try:
            L.download_post(post, target="videos")
            
            mp4_files = [f for f in os.listdir("videos") if f.endswith(".mp4")]
            if not mp4_files:
                continue
            mp4_path = os.path.join("videos", mp4_files[0])
            
            result = model.transcribe(mp4_path)
            transcript = result["text"].strip()
            
            transcriptions.append({
                "account": account,
                "date": str(post.date),
                "caption": str(post.caption),
                "transcript": transcript
            })
            
            for f in os.listdir("videos"):
                os.remove(os.path.join("videos", f))
            
            print(f"✓ {transcript[:80]}")
            
            if len(transcriptions) % 10 == 0:
                with open("transcriptions.json", "w", encoding="utf-8") as f:
                    json.dump(transcriptions, f, indent=2, ensure_ascii=False)
                print(f"Progress saved: {len(transcriptions)} done")

            time.sleep(3)  # ← polite delay between requests
        
        except Exception as e:
            print(f"✗ Failed: {e}")
            for f in os.listdir("videos"):
                try:
                    os.remove(os.path.join("videos", f))
                except:
                    pass
            time.sleep(5)  # ← longer delay on error
            continue

with open("transcriptions.json", "w", encoding="utf-8") as f:
    json.dump(transcriptions, f, indent=2, ensure_ascii=False)

print(f"\nDone! {len(transcriptions)} reels transcribed")