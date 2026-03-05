import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSchema() {
    try {
        const { data, error } = await supabase
            .from('trust_ledger')
            .select('*')
            .limit(1)

        if (error) {
            console.log('Error code:', error.code)
            console.log('Error message:', error.message)
            if (error.code === '42P01') {
                console.log('RESULT: Table "trust_ledger" does NOT exist.')
            } else {
                console.log('RESULT: Table error, check message.')
            }
        } else {
            console.log('RESULT: Table "trust_ledger" EXISTS.')
        }
    } catch (e) {
        console.error('Fatal error checking table:', e.message)
    }
}

checkSchema()
