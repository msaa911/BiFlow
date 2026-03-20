
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl!, supabaseKey!)

async function getDetailedDuplicates() {
  const { data: naTransactions } = await supabase
    .from('transacciones')
    .select('*')
    .is('cuenta_id', null)

  if (!naTransactions) return

  const actions = []

  for (const t of naTransactions) {
    // Look for a duplicate that HAS a cuenta_id
    const { data: dups } = await supabase
      .from('transacciones')
      .select('*')
      .eq('fecha', t.fecha)
      .eq('monto', t.monto)
      .not('cuenta_id', 'is', null)
      .not('id', 'eq', t.id)
    
    // Normalize descriptions for better matching
    const normalize = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    const tNorm = normalize(t.descripcion);
    const bestDup = dups?.find(d => normalize(d.descripcion) === tNorm) || dups?.[0];

    if (bestDup) {
      actions.push({
        type: 'DELETE_AND_TRANSFER',
        na_id: t.id,
        na_desc: t.descripcion,
        na_status: t.estado,
        na_mov_id: t.movimiento_id,
        bank_id: bestDup.id,
        bank_desc: bestDup.descripcion,
        bank_status: bestDup.estado,
        bank_mov_id: bestDup.movimiento_id,
        amount: t.monto,
        date: t.fecha
      })
    } else {
      actions.push({
        type: 'KEEP_AND_FIX',
        na_id: t.id,
        na_desc: t.descripcion,
        na_status: t.estado,
        amount: t.monto,
        reason: 'No bank counterpart found'
      })
    }
  }

  fs.writeFileSync('scripts/detailed_duplicates.json', JSON.stringify(actions, null, 2))
  console.log(`Detailed report generated: scripts/detailed_duplicates.json`)
}

getDetailedDuplicates()
