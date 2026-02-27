import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// simple env loader
const envFile = readFileSync('.env.local', 'utf-8');
envFile.split('\n').forEach(line => {
    const [key, ...defaultVal] = line.split('=');
    if (key && defaultVal) process.env[key] = defaultVal.join('=').trim();
});

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function getCols(table: string) {
    const { data, error } = await supabase.from(table).select().limit(1);
    if (error) console.error(`Error ${table}:`, error);
    if (data && data.length > 0) {
        console.log(`\n=== Table: ${table} ===`);
        console.log(Object.keys(data[0]).join(', '));
    } else {
        console.log(`\n=== Table: ${table} === (No rows found to inspect)`);
    }
}

async function run() {
    await getCols('transacciones');
    await getCols('comprobantes');
    await getCols('comprobante_metadata');
    await getCols('entidades_financieras');
    await getCols('entidades');
}

run();
