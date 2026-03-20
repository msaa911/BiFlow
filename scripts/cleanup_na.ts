
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl!, supabaseKey!)

async function cleanupDuplicates() {
  const reportPath = 'scripts/detailed_duplicates.json'
  if (!fs.existsSync(reportPath)) {
    console.error('Report not found. Run generate_detailed_report.ts first.')
    return
  }

  const actions = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const stats = { deleted: 0, transferred: 0, errors: 0 }

  for (const action of actions) {
    if (action.type === 'DELETE_AND_TRANSFER') {
      try {
        // 1. If NA has a movement, transfer it to Bank if Bank is pending
        if (action.na_mov_id) {
          if (action.bank_status === 'pendiente') {
            console.log(`Transferring movement ${action.na_mov_id} from ${action.na_id} to ${action.bank_id}`)
            const { error: updateError } = await supabase
              .from('transacciones')
              .update({ 
                movimiento_id: action.na_mov_id,
                estado: 'conciliado'
              })
              .eq('id', action.bank_id)
            
            if (updateError) throw updateError
            stats.transferred++
          } else if (action.bank_status === 'conciliado' && action.bank_mov_id !== action.na_mov_id) {
            console.warn(`CONFLICT: Both transactions ${action.na_id} and ${action.bank_id} are reconciled to DIFFERENT movements. Deleting NA anyway to clear dashboard, but manual check might be needed for movement ${action.na_mov_id}`)
          }
        }

        // 2. Delete the NA transaction
        const { error: deleteError } = await supabase
          .from('transacciones')
          .delete()
          .eq('id', action.na_id)
        
        if (deleteError) throw deleteError
        stats.deleted++
      } catch (err) {
        console.error(`Error processing ${action.na_id}:`, err)
        stats.errors++
      }
    }
  }

  console.log('Cleanup complete:', stats)
}

cleanupDuplicates()
