import json

with open('knowledge_base_raw.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Keep only our two target accounts
filtered = [p for p in data if p['account'] in ['glucosegoddess', 'insulinresistant1']]

print(f'Before: {len(data)} posts')
print(f'After filtering: {len(filtered)} posts')
print(f'glucosegoddess: {len([p for p in filtered if p["account"] == "glucosegoddess"])}')
print(f'insulinresistant1: {len([p for p in filtered if p["account"] == "insulinresistant1"])}')

with open('knowledge_base_clean.json', 'w', encoding='utf-8') as f:
    json.dump(filtered, f, indent=2, ensure_ascii=False)

print('Saved to knowledge_base_clean.json')