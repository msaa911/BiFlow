import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function debug() {
    console.log('--- Inspecting archivos_importados ---')

    // 1. Check Table Info
    const { data: tableInfo, error: tableErr } = await supabase.rpc('get_table_info', { t_name: 'archivos_importados' })
    if (tableErr) {
        // Fallback to manual query if RPC doesn't exist
        const { data: cols, error: colErr } = await supabase.from('information_schema.columns').select('*').eq('table_name', 'archivos_importados')
        console.log('Columns:', colErr || cols?.map(c => `${c.column_name} (${c.data_type}, null:${c.is_nullable})`))
    } else {
        console.log('Table Info:', tableInfo)
    }

    // 2. Check Constraints
    const { data: constraints, error: consErr } = await supabase.from('information_schema.table_constraints').select('*').eq('table_name', 'archivos_importados')
    console.log('Constraints:', consErr || constraints)

    // 3. Check RLS
    const { data: rls, error: rlsErr } = await supabase.from('pg_policies').select('*').eq('tablename', 'archivos_importados')
    console.log('RLS Policies:', rlsErr || rls)

    // 4. Test a dummy insert with admin client
    const { data: insertTest, error: insertErr } = await supabase.from('archivos_importados').insert({
        organization_id: '00000000-0000-0000-0000-000000000000', // Dummy or find one
        nombre_archivo: 'test_audit.xlsx',
        storage_path: 'test/path.xlsx',
        estado: 'procesando',
        metadata: { test: true }
    }).select()

    console.log('Insert Test with Admin Client:', insertErr ? `FAILED: ${insertErr.message} (${insertErr.code})` : 'SUCCESS')
}

debug()
