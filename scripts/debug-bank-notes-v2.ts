import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { readFileSync } from 'fs'

// Cargar variables de entorno desde .env.local de forma robusta para scripts
try {
    const envFile = readFileSync('.env.local', 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...defaultVal] = line.split('=');
        if (key && defaultVal) process.env[key.trim()] = defaultVal.join('=').trim();
    });
} catch (e) {
    dotenv.config({ path: '.env.local' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Faltan credenciales de Supabase en .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugNoteTraceability() {
    console.log('--- Buscando notas bancarias recientes ---')
    const { data: notes, error: notesError } = await supabase
        .from('comprobantes')
        .select('*, entidades(razon_social), transacciones!comprobante_id(*)')
        .in('tipo', ['ndb_bancaria', 'ncb_bancaria'])
        .order('created_at', { ascending: false })
        .limit(5)

    if (notesError) {
        console.error('Error al obtener notas:', notesError)
        return
    }

    if (!notes || notes.length === 0) {
        console.log('No se encontraron notas bancarias.')
        return
    }

    notes.forEach((note: any) => {
        console.log(`Nota ID: ${note.id}`)
        console.log(`Nro Factura: ${note.nro_factura}`)
        console.log(`Monto: ${note.monto_total}`)
        console.log(`Metadata:`, JSON.stringify(note.metadata, null, 2))
        console.log(`Transacciones vinculadas: ${note.transacciones?.length || 0}`)
        if (note.transacciones && note.transacciones.length > 0) {
            note.transacciones.forEach((tx: any, idx: number) => {
                console.log(`  Tx ${idx + 1}: ID=${tx.id}, Desc=${tx.descripcion}, Comprobante ID en TX=${tx.comprobante_id}`)
            })
        }
        console.log('---')
    })
}

debugNoteTraceability()
