import json

with open('knowledge_base_raw.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'Total posts: {len(data)}')
print(f'Sample caption: {data[0]["caption"][:200]}')
print(f'Accounts: {set(p["account"] for p in data)}')