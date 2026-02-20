
import importlib.util

packages = ['psycopg2', 'supabase', 'dotenv', 'pandas']
found = []
missing = []

for p in packages:
    spec = importlib.util.find_spec(p)
    if spec is not None:
        found.append(p)
    else:
        missing.append(p)

print(f"Found: {found}")
print(f"Missing: {missing}")
