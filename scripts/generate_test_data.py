import random
import datetime
import uuid

# Configuration
OUTPUT_FILE = "BiFlow_Mega_Audit.dat"
NUM_TRANSACTIONS = 200
START_DATE = datetime.date(2025, 1, 1)
END_DATE = datetime.date(2025, 3, 1)

# Probabilities
PROB_RECURRENCE = 0.3
PROB_DUPLICATE = 0.05
PROB_LEAK = 0.08 # Fiscal leak / Retention issue

# Reference Data (Mock Argentine Entities)
ENTITIES = [
    {"cuit": "30-11111111-1", "name": "DISTRIBUIDORA NORTE S.A.", "category": "PROVEEDOR"},
    {"cuit": "30-22222222-2", "name": "ENERGIA SUR S.A.", "category": "SERVICIOS"},
    {"cuit": "33-33333333-3", "name": "BANCO NACION", "category": "BANCO"},
    {"cuit": "30-44444444-4", "name": "AFIP", "category": "IMPUESTOS"},
    {"cuit": "30-55555555-5", "name": "LOGISTICA EXPRESS S.R.L.", "category": "PROVEEDOR"},
    {"cuit": "20-66666666-6", "name": "JUAN PEREZ (ALQUILER)", "category": "ALQUILER"},
    {"cuit": "30-77777777-7", "name": "TELEFONICA ARGENTINA", "category": "SERVICIOS"},
]

def random_date(start, end):
    return start + datetime.timedelta(
        seconds=random.randint(0, int((end - start).total_seconds())),
    )

def generate_line(date_obj, description, amount, cuit, reference):
    # Mock Interbanking-like format (Fixed width or CSV-like for this demo)
    # Format: YYYYMMDD;DESCRIPTION;AMOUNT;CUIT;REF
    date_str = date_obj.strftime("%Y%m%d")
    amount_str = f"{amount:.2f}"
    return f"{date_str};{description};{amount_str};{cuit};{reference}\n"

def main():
    print(f"Generando {NUM_TRANSACTIONS} transacciones en {OUTPUT_FILE}...")
    
    transactions = []
    
    # Base transactions
    for _ in range(NUM_TRANSACTIONS):
        entity = random.choice(ENTITIES)
        date = random_date(START_DATE, END_DATE)
        
        # Base amount logic
        base_amount = random.uniform(1000, 500000)
        if entity['name'] == "AFIP": base_amount = random.uniform(10000, 2000000)
        
        # Scenario: Recurrence
        if random.random() < PROB_RECURRENCE and entity['category'] in ['SERVICIOS', 'ALQUILER']:
            # Make amounts similar
            amount = round(base_amount, -3) # Round to thousands
        else:
            amount = round(base_amount, 2)

        desc = f"TRANSFERENCIA {entity['name']}"
        ref = str(uuid.uuid4())[:8].upper()
        
        line = generate_line(date, desc, -amount, entity['cuit'], ref) # Debit
        transactions.append(line)
        
        # Scenario: Duplicate
        if random.random() < PROB_DUPLICATE:
            # Add an exact copy or slight variation close in time
            dup_date = date + datetime.timedelta(days=random.randint(0, 2))
            dup_line = generate_line(dup_date, desc, -amount, entity['cuit'], ref + "DUP")
            transactions.append(dup_line)
            
        # Scenario: Fiscal Leak (Retencion no reclamada logic placeholder)
        if random.random() < PROB_LEAK:
             # Create a credit note or retention that is not matched
             ret_amount = amount * 0.03
             ret_line = generate_line(date, f"RETENCION IIBB {entity['name']}", -ret_amount, entity['cuit'], ref + "RET")
             transactions.append(ret_line)

    # Sort by date
    transactions.sort()
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("FECHA;DESCRIPCION;MONTO;CUIT;REFERENCIA\n") # Header
        for t in transactions:
            f.write(t)
            
    print("[OK] Generacion completada.")

if __name__ == "__main__":
    main()
