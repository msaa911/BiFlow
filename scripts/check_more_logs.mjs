import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMoreLogs() {
    const { data: userData } = await supabase.from('organization_members').select('organization_id').limit(1);
    const orgId = userData[0].organization_id;

    const { data, error } = await supabase
        .from('reconciliation_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }

    console.log('Last 5 Reconciliation Logs:');
    console.table(data.map(l => ({
        created_at: l.created_at,
        metodo: l.metodo,
        total_leidos: l.total_leidos,
        total_conciliados: l.total_conciliados,
        admin_results: l.detalle?.admin_results,
        matched_count: l.detalle?.matched_count
    })));
}

checkMoreLogs();
