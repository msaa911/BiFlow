require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function run() {
    const query = `
    ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS monto_usado numeric(12,2) NOT NULL DEFAULT 0;

    DO $$ 
    DECLARE
        constraint_name text;
    BEGIN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'public.transacciones'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%estado%';

        IF constraint_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE public.transacciones DROP CONSTRAINT ' || constraint_name;
        END IF;
    END $$;

    ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_estado_check CHECK (estado IN ('pendiente', 'conciliado', 'anulado', 'parcial'));
  `;

    // Standard RPC execution if RPC exists
    const { data, error } = await supabase.rpc('exec_sql', { query });

    if (error) {
        console.error('RPC exec_sql failed:', error.message);
        console.log('Since exec_sql might not exist, you must run this manually in the Supabase SQL editor:');
        console.log(query);
    } else {
        console.log('Success:', data);
    }
}
run();
