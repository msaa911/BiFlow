
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    // We'll just fetch 0 rows and check the keys of the returned object
    // Supabase JS sometimes caches the schema in the client, but let's try a fresh one.
    const { data: cols, error } = await supabase.from('movimientos_tesoreria').select('*').limit(1);

    if (error) {
        console.log('Error:', error);
    } else {
        console.log('Table columns found via SELECT *:');
        if (cols && cols.length > 0) {
            console.log(Object.keys(cols[0]));
        } else {
            console.log('No rows to check keys from.');
        }
    }
}

checkSchema();
