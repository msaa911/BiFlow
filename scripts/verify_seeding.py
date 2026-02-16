
import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

try:
    # 1. Check transactions count
    res_trans = supabase.table('transacciones').select("id", count='exact', head=True).execute()
    print(f"Transactions count: {res_trans.count}")
    
    # 2. Check CUITs count
    res_cuits = supabase.table('cuits_conocidos').select("cuit", count='exact', head=True).execute()
    print(f"Known CUITs count: {res_cuits.count}")
    
    # 3. Check Organization
    res_org = supabase.table('organizations').select("*").execute()
    print(f"Organizations: {len(res_org.data)}")
    for org in res_org.data:
        print(f" - {org['name']} ({org['id']})")

except Exception as e:
    print(f"Verification failed: {e}")
