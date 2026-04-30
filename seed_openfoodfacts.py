import urllib.request, json, psycopg2, re, os

env = {}
with open('backend/.env') as f:
    for line in f:
        m = re.match(r'^(\w+)=(.+)$', line.strip())
        if m:
            env[m.group(1)] = m.group(2).strip('"').strip("'")

conn = psycopg2.connect(env['DATABASE_URL'])
cur = conn.cursor()

# Open Food Facts API - get foods with carb data
# Search common food categories
categories = [
    "cereals", "breads", "fruits", "vegetables", 
    "meats", "dairy", "snacks", "beverages",
    "legumes", "pastas", "desserts", "sauces"
]

inserted = 0
for cat in categories:
    try:
        url = f"https://world.openfoodfacts.org/cgi/search.pl?action=process&tagtype_0=categories&tag_contains_0=contains&tag_0={cat}&fields=product_name,nutriments&json=1&page_size=100"
        req = urllib.request.Request(url, headers={'User-Agent': 'GluciApp/1.0'})
        response = urllib.request.urlopen(req, timeout=15)
        data = json.loads(response.read().decode('utf-8'))
        
        for product in data.get('products', []):
            name = product.get('product_name', '').strip()
            if not name or len(name) < 2:
                continue
            carbs = product.get('nutriments', {}).get('carbohydrates_100g', 0)
            if not carbs:
                continue
            
            # Estimate GI from carbs (rough heuristic)
            if carbs > 70:
                gi = 72
            elif carbs > 50:
                gi = 60
            elif carbs > 30:
                gi = 48
            elif carbs > 15:
                gi = 35
            else:
                gi = 15
            
            try:
                cur.execute("""
                    INSERT INTO gi_food 
                        (name, name_lower, gi_value, carbs_per_100g, category, source)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (name_lower) DO NOTHING
                """, (name, name.lower().strip(), gi, carbs, cat, "openfoodfacts"))
                if cur.rowcount > 0:
                    inserted += 1
            except:
                conn.rollback()
                continue
        
        conn.commit()
        print(f"Category {cat}: done, total inserted so far: {inserted}")
    
    except Exception as e:
        print(f"Category {cat} failed: {e}")
        continue

conn.commit()
cur.close()
conn.close()
print(f"Done. {inserted} new foods added")