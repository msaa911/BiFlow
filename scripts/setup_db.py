import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file.")
    sys.exit(1)

def run_sql_migration():
    print("Conectando a Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    schema_path = os.path.join("supabase", "schema.sql")
    
    if not os.path.exists(schema_path):
        print(f"Error: No se encontró el archivo {schema_path}")
        sys.exit(1)
        
    print(f"Leyendo {schema_path}...")
    with open(schema_path, "r", encoding="utf-8") as f:
        sql = f.read()
        
    # Split by statements? 
    # The supabase-py client (and postgrest) usually takes raw SQL via rpc or special endpoint if enabled, 
    # OR we have to use the dashboard SQL editor.
    # HOWEVER, supabase-py doesn't have a direct 'query' method for raw SQL unless we use a stored procedure like 'exec_sql'.
    # 
    # BUT, we can try to use the REST API to call a postgres function if it exists, but we are creating tables.
    #
    # Actually, usually migrations are done via CLI. 
    #
    # Let's try to see if we can use a python driver (psycopg2) if we have the connection string.
    # The user has DB_CONNECTION_STRING in .env but it might be empty/placeholder.
    
    # Let's check if we can simply ask the user to run it in the dashboard if this fails, 
    # BUT wait, the supabase client might have a way.
    # Actually, for standard Supabase projects without a specific 'exec_sql' RPC, we can't run DDL via the JS/Python client easily.
    
    # PLAN B: Try to use psycopg2 if available and connection string is valid.
    # If not, we will notify the user to run it in the dashboard.
    
    # Let's try to extract the connection string from .env if it exists.
    conn_str = os.getenv("DB_CONNECTION_STRING")
    if conn_str and "postgres" in conn_str and "[PASSWORD]" not in conn_str:
        try:
            import psycopg2
            print("Usando psycopg2 para ejecutar SQL...")
            conn = psycopg2.connect(conn_str)
            cur = conn.cursor()
            cur.execute(sql)
            conn.commit()
            cur.close()
            conn.close()
            print("Migración completada exitosamente vía psycopg2.")
            return
        except ImportError:
            print("psycopg2 no instalado.")
        except Exception as e:
            print(f"Error con psycopg2: {e}")

    print("\n⚠️  ATENCIÓN ⚠️")
    print("El cliente de Supabase-Python no permite ejecutar DDL (Create Table) directamente sin una función RPC.")
    print("Por favor, copia el contenido de 'supabase/schema.sql' y ejecútalo en el SQL Editor de tu Dashboard de Supabase:")
    print(f"URL: {SUPABASE_URL}")
    
if __name__ == "__main__":
    run_sql_migration()
