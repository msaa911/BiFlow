
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function diagnose() {
  console.log('--- DIAGNOSTIC START ---')

  // 1. Get transactions with NULL cuenta_id
  const { data: naTransactions, error: naError } = await supabase
    .from('transacciones')
    .select('*')
    .is('cuenta_id', null)
    .order('fecha', { ascending: false })

  if (naError) {
    console.error('Error fetching N/A transactions:', naError)
    return
  }

  console.log(`Found ${naTransactions.length} transactions with NULL cuenta_id.`)

  if (naTransactions.length === 0) return

  // 2. Sample first 10
  console.log('\nSample N/A Transactions:')
  naTransactions.slice(0, 10).forEach(t => {
    console.log(`[${t.id}] ${t.fecha} | ${t.monto} | ${t.descripcion}`)
  })

  // 3. Find potential duplicates for the first few
  console.log('\nChecking for duplicates (Same Date + Same Amount):')
  for (const t of naTransactions.slice(0, 10)) {
    const { data: dups, error: dupError } = await supabase
      .from('transacciones')
      .select('id, descripcion, cuenta_id, estado')
      .eq('fecha', t.fecha)
      .eq('monto', t.monto)
      .not('id', 'eq', t.id)

    if (dups && dups.length > 0) {
      console.log(`\nPotential duplicates for N/A ID ${t.id} (${t.descripcion}):`)
      dups.forEach(d => {
        console.log(` - ID ${d.id} | Account: ${d.cuenta_id || 'N/A'} | Status: ${d.estado} | ${d.descripcion}`)
      })
    }
  }

  // 4. Summarize by description
  const summary: Record<string, number> = {}
  naTransactions.forEach(t => {
    summary[t.descripcion] = (summary[t.descripcion] || 0) + 1
  })

  console.log('\nN/A Summarized by Description:')
  Object.entries(summary).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([desc, count]) => {
    console.log(`${count}x: ${desc}`)
  })

  console.log('--- DIAGNOSTIC END ---')
}

diagnose()
