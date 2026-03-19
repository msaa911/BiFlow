import { createAdminClient } from './lib/supabase/admin';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

(async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(10);
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
})();
