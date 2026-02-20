
import os
import sys
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def analyze_data():
    print("Iniciando análisis del CFO Algorítmico...")
    
    # 1. Fetch Transactions
    # We fetch all for simplicity, in prod we would fetch by batch or date range
    res = supabase.table('transacciones').select("*").execute()
    transactions = res.data
    
    if not transactions:
        print("No hay transacciones para analizar.")
        return

    df = pd.DataFrame(transactions)
    df['fecha'] = pd.to_datetime(df['fecha'])
    
    findings = []
    
    # 2. Detect Duplicates
    # Criteria: Same Amount, Same CUIT Destino, Date within 7 days
    print("Buscando pagos duplicados...")
    
    # Group by Amount and CUIT
    # Filter only negative amounts (payments)
    payments = df[df['monto'] < 0].copy()
    
    # Sort by date
    payments = payments.sort_values('fecha')
    
    for (amount, cuit), group in payments.groupby(['monto', 'cuit_destino']):
        if len(group) > 1:
            # Check time diff between consecutive transactions in this group
            group = group.sort_values('fecha')
            prev_row = None
            
            for index, row in group.iterrows():
                if prev_row is not None:
                    days_diff = (row['fecha'] - prev_row['fecha']).days
                    if days_diff <= 7:
                        # Potential Duplicate!
                        print(f" -> Posible duplicado detectado: {row['descripcion']} ({amount})")
                        
                        finding = {
                            "organization_id": row['organization_id'],
                            "transaccion_id": row['id'],
                            "tipo": "duplicado",
                            "severidad": "high",
                            "estado": "detectado",
                            "monto_estimado_recupero": abs(amount), # Recover the second payment
                            "detalle": {
                                "razon": "Pago idéntico detectado",
                                "dias_diferencia": days_diff,
                                "transaccion_original_id": prev_row['id']
                            }
                        }
                        findings.append(finding)
                prev_row = row

    # 3. Detect Fiscal Leaks (Retenciones)
    # Criteria: Keywords in description
    print("Buscando fugas fiscales...")
    keywords = ['RETENCION', 'PERCEPCION', 'SIRCREB', 'IIBB']
    
    for index, row in df.iterrows():
        desc = str(row['descripcion']).upper()
        if any(keyword in desc for keyword in keywords):
             # Check if it's already flagged? (Skipping for simplicity)
             
             # Logic: If it's a retention, is it supported? 
             # For this demo, we flag ALL retentions as "potential recovery" or "compliance check"
             # Let's flag them as 'fuga_fiscal' (Fiscal Leak/Risk)
             
             finding = {
                "organization_id": row['organization_id'],
                "transaccion_id": row['id'],
                "tipo": "fuga_fiscal",
                "severidad": "medium",
                "estado": "detectado",
                "monto_estimado_recupero": abs(row['monto']), # Claim back
                "detalle": {
                    "razon": "Retención impositiva detectada",
                    "impuesto": "Ingresos Brutos / SIRCREB"
                }
            }
             findings.append(finding)

    # 4. Insert Findings
    print(f"Se encontraron {len(findings)} anomalías.")
    if findings:
        # Check for existing findings to avoid duplication (simple check by transaccion_id + tipo)
        # Fetch existing findings first
        existing_res = supabase.table('hallazgos').select("transaccion_id, tipo").execute()
        existing_keys = set((f['transaccion_id'], f['tipo']) for f in existing_res.data)
        
        new_findings = [f for f in findings if (f['transaccion_id'], f['tipo']) not in existing_keys]
        
        if new_findings:
            print(f"Insertando {len(new_findings)} nuevos hallazgos en Supabase...")
            # Insert in chunks
            batch_size = 50
            for i in range(0, len(new_findings), batch_size):
                 supabase.table('hallazgos').insert(new_findings[i:i+batch_size]).execute()
        else:
            print("Todas las anomalías ya estaban registradas.")

if __name__ == "__main__":
    analyze_data()
