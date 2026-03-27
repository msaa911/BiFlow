'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgId } from '@/lib/supabase/utils'

export async function getBankNotesAction(accountId?: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Auth error in getBankNotesAction:', authError)
      throw new Error('No authenticated user')
    }

    // Use the central utility which handles "Modo Dios" (Impersonation)
    // This correctly reads the 'biflow_impersonation' cookie for admins
    const orgId = await getOrgId(supabase, user.id)

    if (!orgId) {
      console.warn('No orgId found for user:', user.id)
      return { data: [], error: 'No organization context' }
    }

    // We use the adminClient to bypass RLS when fetching data for the identified orgId.
    // This is essential for "Modo Dios", as a Superadmin might not be an explicit 
    // member of the impersonated organization in the 'organization_members' table.
    const adminClient = createAdminClient()

    let query = adminClient
      .from('comprobantes')
      .select(`
        *,
        entidades (
          nombre,
          tipo_entidad
        ),
        transacciones!comprobante_id (
          id,
          descripcion,
          monto,
          fecha,
          metadata
        )
      `)
      .eq('organization_id', orgId)
      .in('tipo', ['ndb_bancaria', 'ncb_bancaria'])

    // Apply account filter if provided (stored in JSONB metadata)
    if (accountId) {
      query = query.filter('metadata->>cuenta_id', 'eq', accountId)
    }

    const { data: rawData, error } = await query.order('fecha_emision', { ascending: false })

    if (error) {
      console.error('Error fetching bank notes via Server Action:', error)
      return { data: [], error: error.message }
    }

    // Post-processing to ensure we have transaction data even if link is broken in DB
    // but exists in metadata (post-purge resilience)
    const processedNotes = await Promise.all((rawData || []).map(async (note) => {
      // If no transactions linked directly but we have a transaccion_id in metadata
      if ((!note.transacciones || note.transacciones.length === 0) && note.metadata?.transaccion_id) {
        try {
          const { data: txData, error: txErr } = await adminClient
            .from('transacciones')
            .select('*')
            .eq('id', note.metadata.transaccion_id)
            .maybeSingle()

          if (txData && !txErr) {
            return { ...note, transacciones: [txData] }
          }
        } catch (e) {
          console.warn(`[getBankNotesAction] Could not recover tx for note ${note.id}`, e)
        }
      }
      return note
    }))

    return { data: processedNotes, error: null }
  } catch (err: any) {
    console.error('Unexpected error in getBankNotesAction:', err)
    return { data: [], error: err.message || 'Internal Server Error' }
  }
}
