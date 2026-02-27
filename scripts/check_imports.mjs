import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
    console.log('=== FULL DATABASE AUDIT ===\n');

    // 1. archivos_importados
    const { data: files, count: fileCount } = await supabase
        .from('archivos_importados')
        .select('id, nombre_archivo, estado, metadata, created_at', { count: 'exact' })
        .order('created_at', { ascending: false });
    console.log(`📁 ARCHIVOS_IMPORTADOS: ${fileCount} records`);
    files?.forEach(f => console.log(`  ${f.nombre_archivo} | ${f.estado} | ${f.created_at}`));

    // 2. transacciones (bank)
    const { count: txCount } = await supabase
        .from('transacciones')
        .select('*', { count: 'exact', head: true });
    const { data: txSample } = await supabase
        .from('transacciones')
        .select('id, descripcion, monto, origen_dato, archivo_importacion_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log(`\n💰 TRANSACCIONES: ${txCount} records`);
    const withFileId = txSample?.filter(t => t.archivo_importacion_id) || [];
    const withoutFileId = txSample?.filter(t => !t.archivo_importacion_id) || [];
    console.log(`  Con archivo_importacion_id: ${withFileId.length}/5 muestras`);
    console.log(`  Sin archivo_importacion_id: ${withoutFileId.length}/5 muestras`);
    txSample?.forEach(t => console.log(`  ${t.origen_dato || 'NULL'} | ${t.descripcion?.substring(0, 40)} | archivo_id: ${t.archivo_importacion_id || 'NULL'}`));

    // 3. comprobantes (invoices)
    const { count: compCount } = await supabase
        .from('comprobantes')
        .select('*', { count: 'exact', head: true });
    const { data: compSample } = await supabase
        .from('comprobantes')
        .select('id, tipo, numero, razon_social_socio, archivo_importacion_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
    console.log(`\n📄 COMPROBANTES: ${compCount} records`);
    const compWithFile = compSample?.filter(c => c.archivo_importacion_id) || [];
    console.log(`  Con archivo_importacion_id: ${compWithFile.length}/${compSample?.length}`);
    compSample?.forEach(c => console.log(`  ${c.tipo} | ${c.numero || 'Sin Num'} | ${c.razon_social_socio} | archivo_id: ${c.archivo_importacion_id || 'NULL'} | ${c.created_at}`));

    // 4. movimientos_tesoreria
    const { count: movCount } = await supabase
        .from('movimientos_tesoreria')
        .select('*', { count: 'exact', head: true });
    const { data: movSample } = await supabase
        .from('movimientos_tesoreria')
        .select('id, tipo, numero, monto_total, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
    console.log(`\n🏦 MOVIMIENTOS_TESORERIA: ${movCount} records`);
    movSample?.forEach(m => {
        const archId = m.metadata?.archivo_importacion_id || 'NULL';
        const importType = m.metadata?.import_type || 'NULL';
        console.log(`  ${m.tipo} | ${m.numero || 'N/A'} | $${m.monto_total} | import: ${importType} | archivo_id: ${archId} | ${m.created_at}`);
    });

    // 5. entidades
    const { count: entCount } = await supabase
        .from('entidades')
        .select('*', { count: 'exact', head: true });
    const { data: entSample } = await supabase
        .from('entidades')
        .select('id, razon_social, categoria, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
    console.log(`\n👥 ENTIDADES: ${entCount} records`);
    entSample?.forEach(e => {
        const origen = e.metadata?.origen || 'manual/script';
        console.log(`  ${e.razon_social} | ${e.categoria} | origen: ${origen} | ${e.created_at}`);
    });

    console.log('\n=== END AUDIT ===');
}

audit();
