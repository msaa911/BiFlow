import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bnlmoupgzbtgfgominzd.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubG1vdXBnemJ0Z2Znb21pbnpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTExMzgxNywiZXhwIjoyMDg2Njg5ODE3fQ.EtWUj0RXD6k2WpRKO426r39q4GQ3RI5enfeRZQU0PCQ'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyFix() {
    console.log('--- APPLYING SCHEMA FIX ---')

    // We try to use a direct SQL RPC if it exists, otherwise we'll have to ask the user.
    // In many BiFlow setups we added 'exec_sql'.
    const sql = `
        ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS banco text;
        ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS numero_cheque text;
        ALTER TABLE public.comprobantes ADD COLUMN IF NOT EXISTS nombre_entidad text;
        ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS numero_cheque text;
        ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS comprobante_id UUID REFERENCES public.comprobantes(id) ON DELETE SET NULL;
    `;

    console.log('Attempting to apply migrations via RPC...')
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error('RPC exec_sql failed:', error.message)
        console.log('This usually means the project does not have the exec_sql helper.')
    } else {
        console.log('Migration applied successfully!')
    }
}

applyFix()
