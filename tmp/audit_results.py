import pandas as pd
import re
import math
from datetime import datetime, timedelta

def clean_ref(ref):
    if not isinstance(ref, str): return ""
    return re.sub(r'[^0-9]', '', ref)

def get_last_4(ref):
    cleaned = clean_ref(ref)
    if len(cleaned) < 4: return None
    return cleaned[-4:]

def parse_date(date_str):
    if not isinstance(date_str, str): return None
    try:
        return datetime.strptime(date_str, '%d/%m/%Y')
    except:
        return None

# Load CSVs
galicia = pd.read_csv('d:/proyecto-biflow/test_data/extracto_galicia_demo.csv', skiprows=7)
macro = pd.read_csv('d:/proyecto-biflow/test_data/extracto_macro_demo.csv', skiprows=7)
recibos = pd.read_csv('d:/proyecto-biflow/test_data/recibos.csv')
ops = pd.read_csv('d:/proyecto-biflow/test_data/ordenes_pago.csv')

# Preprocess bank statements
statements = []
# Galicia
for _, row in galicia.iterrows():
    if pd.isna(row['Fecha']): continue
    monto = float(row['Credito']) if not pd.isna(row['Credito']) else -float(row['Debito'])
    statements.append({
        'banco': 'Galicia',
        'fecha': parse_date(row['Fecha']),
        'monto': monto,
        'desc': str(row['Concepto'])
    })

# Macro
for _, row in macro.iterrows():
    if pd.isna(row['Fecha']) or row['Concepto'] == 'Saldo Inicial': continue
    monto = float(row['Credito']) if not pd.isna(row['Credito']) else -float(row['Debito'])
    statements.append({
        'banco': 'Macro',
        'fecha': parse_date(row['Fecha']),
        'monto': monto,
        'desc': str(row['Concepto'])
    })

# Preprocess internal records
internal = []
for _, row in recibos.iterrows():
    internal.append({
        'tipo': 'cobro',
        'fecha': parse_date(row['Fecha']),
        'monto': float(row['Importe']),
        'ref': str(row['Detalle']),
        'banco_esperado': str(row['Banco'])
    })

for _, row in ops.iterrows():
    internal.append({
        'tipo': 'pago',
        'fecha': parse_date(row['Fecha']),
        'monto': -float(row['Importe']),
        'ref': str(row['Detalle']),
        'banco_esperado': str(row['Banco'])
    })

# Analysis
matches = []
matched_internal_indices = set()

for s_idx, s in enumerate(statements):
    s_monto_int = abs(int(s['monto']))
    s_ref_4 = get_last_4(s['desc'])
    
    potential_matches = []
    
    # LEVEL 3: 4 digits + Integer Amount
    for i_idx, i in enumerate(internal):
        if i_idx in matched_internal_indices: continue
        
        i_monto_int = abs(int(i['monto']))
        i_ref_4 = get_last_4(i['ref'])
        
        if s_monto_int == i_monto_int and s_ref_4 and i_ref_4 and s_ref_4 == i_ref_4:
            potential_matches.append(i_idx)
            
    # If Level 3 fails, try Level 4: Proximity (Date +/- 3 days, Amount +/- 0.05)
    if not potential_matches:
        for i_idx, i in enumerate(internal):
            if i_idx in matched_internal_indices: continue
            
            if abs(s['monto'] - i['monto']) <= 0.05 and abs((s['fecha'] - i['fecha']).days) <= 3:
                potential_matches.append(i_idx)
                
    # Rule: Only match if UNIQUE
    if len(potential_matches) == 1:
        match_idx = potential_matches[0]
        matches.append((s, internal[match_idx]))
        matched_internal_indices.add(match_idx)

print(f"Total Transactions in Statements: {len(statements)}")
print(f"Total Matches Identified: {len(matches)}")
for idx, (s, i) in enumerate(matches):
    print(f"Match {idx+1}: {s['banco']} | {s['fecha'].strftime('%Y-%m-%d')} | {s['monto']} vs {i['monto']} | Ref: {s['desc']} vs {i['ref']}")
