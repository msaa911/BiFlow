
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl!, supabaseKey!)

async function getDuplicates() {
  // 1. Get all transactions with NULL cuenta_id
  const { data: naTransactions } = await supabase
    .from('transacciones')
    .select('*')
    .is('cuenta_id', null)

  if (!naTransactions) return

  const toDelete = []
  const toKeepSafely = []

  for (const t of naTransactions) {
    // Look for a duplicate that HAS a cuenta_id
    const { data: dups } = await supabase
      .from('transacciones')
      .select('*')
      .eq('fecha', t.fecha)
      .eq('monto', t.monto)
      .not('cuenta_id', 'is', null)
      .not('id', 'eq', t.id)

    if (dups && dups.length > 0) {
      // It has a counterpart with a bank! This one is likely a junk duplicate from the demo file.
      toDelete.push({
        id: t.id,
        fecha: t.fecha,
        monto: t.monto,
        descripcion: t.descripcion,
        counterpart: dups[0].id,
        counterpart_bank: dups[0].cuenta_id,
        counterpart_desc: dups[0].descripcion
      })
    } else {
      // It's alone. We should probably NOT delete it, but find why it has no bank.
      toKeepSafely.push(t)
    }
  }

  const result = {
    summary: {
      total_na: naTransactions.length,
      to_delete_count: toDelete.length,
      unmatched_count: toKeepSafely.length
    },
    to_delete: toDelete,
    unmatched: toKeepSafely.map(u => ({ id: u.id, fecha: u.fecha, monto: u.monto, desc: u.descripcion }))
  }

  fs.writeFileSync('scripts/duplicates_report.json', JSON.stringify(result, null, 2))
  console.log(`Report generated: scripts/duplicates_report.json`)
  console.log(`Found ${toDelete.length} duplicates to delete and ${toKeepSafely.length} unmatched N/A transactions.`)
}

getDuplicates()
