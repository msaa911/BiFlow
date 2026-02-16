
import os
import sys
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file.")
    sys.exit(1)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Files
DATA_FILE = "BiFlow_Mega_Audit.dat"
CUIT_FILE = "scripts/seed_cuits.sql"

def seed_cuits():
    print("Seeding known CUITs...")
    try:
        with open(CUIT_FILE, "r", encoding="utf-8") as f:
            sql_script = f.read()
            # Execute raw SQL via RPC or direct connection if enabled.
            # Supabase-py client doesn't support raw SQL execution easily on tables directly.
            # We might need to use psycopg2 for this or use the REST API to insert data.
            # For simplicity, let's parse the INSERT statements or use a direct PG connection.
            
            # Parsing simplistic INSERT statements from seed_cuits.sql
            # Format: ('30-50000000-1', 'TELECOM ARGENTINA S.A.', 'SERVICIOS_TIC', 30),
            
            # Using REST API for better compatibility
            # Manual mapping from SQL logic to API calls
            
            commits = []
            
            # Read lines and extract values manually since we can't run raw SQL easily via client
            # Actually, let's use the provided SQL file logic but implement it via API inserts.
            
            cuits_data = [
                {'cuit': '30-50000000-1', 'razon_social': 'TELECOM ARGENTINA S.A.', 'rubro': 'SERVICIOS_TIC', 'frecuencia_dias': 30},
                {'cuit': '30-60000000-2', 'razon_social': 'CLARO AMX ARGENTINA S.A.', 'rubro': 'SERVICIOS_TIC', 'frecuencia_dias': 30},
                {'cuit': '30-70000000-3', 'razon_social': 'EDENOR S.A.', 'rubro': 'ENERGIA', 'frecuencia_dias': 30},
                {'cuit': '30-71000000-4', 'razon_social': 'EDESUR S.A.', 'rubro': 'ENERGIA', 'frecuencia_dias': 30},
                {'cuit': '30-50000001-5', 'razon_social': 'METROGAS S.A.', 'rubro': 'GAS', 'frecuencia_dias': 30},
                {'cuit': '30-50000002-6', 'razon_social': 'AYSA S.A.', 'rubro': 'AGUA', 'frecuencia_dias': 30},
                {'cuit': '33-60000000-9', 'razon_social': 'OSDE', 'rubro': 'SALUD', 'frecuencia_dias': 30},
                {'cuit': '30-50000003-7', 'razon_social': 'SWISS MEDICAL S.A.', 'rubro': 'SALUD', 'frecuencia_dias': 30},
                {'cuit': '30-50000004-8', 'razon_social': 'GALENO ARGENTINA S.A.', 'rubro': 'SALUD', 'frecuencia_dias': 30},
                {'cuit': '30-11111111-1', 'razon_social': 'GOOGLE CLOUD ARGENTINA', 'rubro': 'TECNOLOGIA', 'frecuencia_dias': 30},
                {'cuit': '30-22222222-2', 'razon_social': 'AMAZON WEB SERVICES', 'rubro': 'TECNOLOGIA', 'frecuencia_dias': 30},
                {'cuit': '30-33333333-3', 'razon_social': 'FACEBOOK ARGENTINA', 'rubro': 'PUBLICIDAD', 'frecuencia_dias': 30},
                {'cuit': '30-44444444-4', 'razon_social': 'MERCADOLIBRE S.R.L.', 'rubro': 'ECOMMERCE', 'frecuencia_dias': 0},
                {'cuit': '33-55555555-5', 'razon_social': 'AFIP', 'rubro': 'IMPUESTOS', 'frecuencia_dias': 30}
            ]
            
            response = supabase.table('cuits_conocidos').upsert(cuits_data, on_conflict='cuit').execute()
            print(f"Inserted/Updated {len(response.data)} known CUITs.")

    except Exception as e:
        print(f"Error seeding CUITs: {e}")

def seed_transactions():
    print(f"Reading {DATA_FILE}...")
    try:
        # Check if file exists
        if not os.path.exists(DATA_FILE):
             print(f"File {DATA_FILE} not found!")
             return

        # 1. Get or Create Organization
        # For this demo, we'll create a default 'Demo Corp' organization if it doesn't exist
        # or fetch the first one available.
        
        org_res = supabase.table('organizations').select("*").limit(1).execute()
        if not org_res.data:
            print("No organization found. Creating 'Demo Corp'...")
            org_res = supabase.table('organizations').insert({"name": "Demo Corp", "tier": "pro"}).execute()
            
        organization_id = org_res.data[0]['id']
        print(f"Using Organization ID: {organization_id}")

        # 2. Parse Data File
        # Format: FECHA;DESCRIPCION;MONTO;CUIT;REFERENCIA
        df = pd.read_csv(DATA_FILE, sep=';', encoding='utf-8')
        
        transactions = []
        for index, row in df.iterrows():
            # Parse date YYYYMMDD -> YYYY-MM-DD
            date_str = str(row['FECHA'])
            date_formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
            
            # Map fields
            t = {
                "organization_id": organization_id,
                "fecha": date_formatted,
                "descripcion": row['DESCRIPCION'],
                "monto": float(row['MONTO']),
                "moneda": "ARS",
                "cuit_origen": row['CUIT'], # In this context, who we paid implies they are the 'destination' usually, but 'origen_dato' creates context. 
                                            # Let's assume 'cuit_origen' is the counterparty for simplicity or check schema.
                                            # Schema has cuit_origen and cuit_destino.
                                            # If these are expenses, we are the origin? Or is it from bank statement?
                                            # Usually bank statement: I am origin (or just account holder), CUIT is the other party.
                                            # Let's put the other party in `cuit_destino` (payee) and leave origin null or my own cuit.
                                            # For simplicity let's stick to putting it in `cuit_destino` as these are mostly payments (negative amounts).
                "cuit_destino": row['CUIT'], 
                "origen_dato": "csv_import",
                "estado": "pendiente"
            }
            transactions.append(t)
            
        # 3. Batch Insert
        # Supabase limits batch size, let's do chunks of 100
        batch_size = 100
        for i in range(0, len(transactions), batch_size):
            batch = transactions[i:i + batch_size]
            response = supabase.table('transacciones').insert(batch).execute()
            print(f"Inserted batch {i // batch_size + 1}/{len(transactions) // batch_size + 1} ({len(batch)} records)")
            
        print("Transactions seeded successfully.")

    except Exception as e:
        print(f"Error seeding transactions: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    seed_cuits()
    seed_transactions()
