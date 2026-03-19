
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '..', 'test_data');

// Load env
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const getEnv = (key) => envContent.split('\n').find(l => l.startsWith(key))?.split('=')[1]?.trim();

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const ORG_ID = '8bca8172-b23f-4da7-b50c-ba2fd78187ac';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseCSV(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Find the header row (first row with at least 3 columns)
    let headerIdx = 0;
    while (headerIdx < lines.length) {
        if (lines[headerIdx].split(',').length >= 3) break;
        headerIdx++;
    }
    
    if (headerIdx >= lines.length) return [];

    const headers = lines[headerIdx].toLowerCase().split(',').map(h => h.trim());
    return lines.slice(headerIdx + 1)
        .filter(line => line.trim() !== '' && line.split(',').length >= 2)
        .map(line => {
            const values = line.split(',');
            const obj = {};
            headers.forEach((h, i) => {
                let val = values[i];
                if (val !== undefined) {
                    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                    obj[h] = val.trim();
                }
            });
            return obj;
        });
}

async function runTest() {
    console.log('🚀 Starting v5.3.0 Test Reproduction...');

    // 1. Clear Old Data
    console.log('🧹 Clearing old test data...');
    await supabase.from('transacciones').delete().eq('organization_id', ORG_ID);
    await supabase.from('aplicaciones_pago').delete().eq('organization_id', ORG_ID);
    await supabase.from('instrumentos_pago').delete().match({ organization_id: ORG_ID }); // Warning: instrumentos might not have org_id directly?
    // Usually matched via movimiento_id
    await supabase.from('movimientos_tesoreria').delete().eq('organization_id', ORG_ID);
    await supabase.from('comprobantes').delete().eq('organization_id', ORG_ID);
    await supabase.from('entidades').delete().eq('organization_id', ORG_ID);

    // 2. Insert Entities (Clientes & Proveedores)
    console.log('👥 Inserting Entities...');
    const clientes = parseCSV(path.join(testDataDir, 'clientes.csv'));
    const proveedores = parseCSV(path.join(testDataDir, 'proveedores.csv'));
    const allEntidades = [...clientes, ...proveedores];
    
    const { data: entRows, error: entErr } = await supabase.from('entidades').insert(
        allEntidades.map(e => ({
            organization_id: ORG_ID,
            razon_social: e['razón social'] || e['proveedor'] || e['cliente'],
            cuit: e.cuit
        }))
    ).select();
    if (entErr) throw entErr;
    
    const entMap = entRows.reduce((acc, row) => {
        acc[row.cuit] = row.id;
        return acc;
    }, {});

    // 3. Insert Invoices (Ventas & Compras)
    console.log('📄 Inserting Invoices...');
    const ventas = parseCSV(path.join(testDataDir, 'ventas_ingresos.csv'));
    const compras = parseCSV(path.join(testDataDir, 'compras_egresos.csv'));
    
    const allInvoices = [
        ...ventas.map(v => ({ ...v, tipo: 'venta' })),
        ...compras.map(c => ({ ...c, tipo: 'compra' }))
    ];

    for (const inv of allInvoices) {
        const entityId = entMap[inv.cuit];
        if (!entityId) {
            console.warn(`Entity not found for CUIT: ${inv.cuit} for invoice ${inv.numero}. Skipping.`);
            continue;
        }

        const { error } = await supabase.from('comprobantes').insert({
            organization_id: ORG_ID,
            entidad_id: entityId,
            tipo: inv.tipo === 'venta' ? 'factura_venta' : 'factura_compra',
            nro_factura: inv.numero,
            cuit_socio: inv.cuit,
            razon_social_socio: inv['razón social'] || inv.cliente || inv.proveedor,
            razon_social_entidad: inv['razón social'] || inv.cliente || inv.proveedor, // Assuming same for now
            cuit_entidad: inv.cuit, // Assuming same for now
            fecha_emision: inv.fecha.split('/').reverse().join('-'),
            fecha_vencimiento: inv.fecha.split('/').reverse().join('-'), // Using emission date for simplicity
            monto_total: parseFloat(inv.monto),
            monto_pendiente: parseFloat(inv.monto),
            estado: 'pendiente',
            moneda: 'ARS'
        });
        if (error) console.error(`Error inserting invoice ${inv.numero}:`, error);
    }

    // 4. Insert Treasury (Recibos & OP)
    console.log('💰 Inserting Treasury & Instruments...');
    const recibos = parseCSV(path.join(testDataDir, 'recibos.csv'));
    const ops = parseCSV(path.join(testDataDir, 'ordenes_pago.csv'));

    const allMovements = [
        ...recibos.map(r => ({ ...r, tipo: 'cobro', numero: r.recibo, concepto: r.concepto || r.detalle })),
        ...ops.map(o => ({ ...o, tipo: 'pago', numero: o.op, concepto: o.concepto || o.detalle }))
    ];

    for (const mov of allMovements) {
        const cuit = mov.cuit;
        const entidadId = entMap[cuit];
        if (!entidadId) {
            console.warn(`Entity not found for CUIT: ${cuit} for movement ${mov.numero}. Skipping.`);
            continue;
        }
        
        const { data: insertedMov, error: movErr } = await supabase.from('movimientos_tesoreria').insert({
            organization_id: ORG_ID,
            entidad_id: entidadId,
            tipo: mov.tipo,
            fecha: mov.fecha.split('/').reverse().join('-'),
            monto_total: parseFloat(mov.importe),
            moneda: 'ARS',
            observaciones: mov.concepto,
            nro_comprobante: mov.numero,
            concepto: mov.concepto
        }).select().single();

        if (movErr) {
            console.error(`Error inserting movement ${mov.numero}:`, movErr);
            continue;
        }

        // Insert Instrument
        await supabase.from('instrumentos_pago').insert({
            movimiento_id: insertedMov.id,
            metodo: mov.medio?.toLowerCase().includes('cheque') ? 'cheque' : 'transferencia',
            monto: parseFloat(mov.importe),
            detalle_referencia: mov.referencia || mov.detalle,
            banco: mov.banco,
            estado: 'pendiente'
        });
    }

    // 5. Insert Bank Transactions
    console.log('🏦 Inserting Bank Transactions...');
    const bank = parseCSV(path.join(testDataDir, 'extracto_galicia_demo.csv'));
    const bankData = bank.map(t => {
        const debito = parseFloat(t.debito || 0);
        const credito = parseFloat(t.credito || 0);
        return {
            organization_id: ORG_ID,
            fecha: t.fecha.split('/').reverse().join('-'),
            descripcion: t.concepto,
            monto: credito - debito,
            estado: 'pendiente',
            origen_dato: 'banco_galicia'
        };
    }).filter(t => Math.abs(t.monto) > 0);

    const { error: bankErr } = await supabase.from('transacciones').insert(bankData);
    if (bankErr) throw bankErr;

    // 6. Execute Reconcile Engine v5.3.0
    console.log('⚙️ Executing Reconcile Engine v5.3.0 (RPC)...');
    const { data: result, error: rpcErr } = await supabase.rpc('reconcile_v3_1', {
        p_org_id: ORG_ID,
        p_dry_run: false
    });
    if (rpcErr) throw rpcErr;

    console.log('✅ TEST COMPLETED SUCCESSFULLY');
    console.log('-----------------------------------');
    console.log('Result Summary:', result);
    
    // Check Logs table
    const { data: logs } = await supabase.from('reconciliation_logs')
        .select('*')
        .eq('organization_id', ORG_ID)
        .order('created_at', { ascending: false })
        .limit(1);
    
    if (logs && logs.length > 0) {
        console.log('Last Log Version:', logs[0].metodo);
        console.log('Last Log Detail:', JSON.stringify(logs[0].detalle, null, 2));
    }
}

runTest().catch(err => {
    console.error('❌ TEST FAILED:', err);
});
