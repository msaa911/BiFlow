import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkLogs() {
    const { data: userData } = await supabase.from('organization_members').select('organization_id').limit(1);
    if (!userData || userData.length === 0) {
        console.error('No organization found');
        return;
    }
    const orgId = userData[0].organization_id;

    const { data, error } = await supabase
        .from('reconciliation_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }

    console.log('Last Reconciliation Log:');
    console.log(JSON.stringify(data[0], null, 2));
}

checkLogs();
