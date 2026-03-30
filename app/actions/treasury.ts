'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgId } from '@/lib/supabase/utils'

export async function getTreasuryMovementsAction(filters: {
  typeFilter?: 'cobro' | 'pago',
  accountId?: string,
  claseDocumentoFilter?: string[]
} = {}) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Auth error in getTreasuryMovementsAction:', authError)
      throw new Error('No authenticated user')
    }

    // Resolve orgId handling "Modo Dios" (Impersonation)
    const orgId = await getOrgId(supabase, user.id)

    if (!orgId) {
      console.log('[getTreasuryMovementsAction] No orgId found. Returning empty data.');
      return { data: [], error: null }
    }

    // Use adminClient to bypass RLS for "Modo Dios" support
    const adminClient = createAdminClient()

    let query = adminClient
      .from('movimientos_tesoreria')
      .select(`
        *,
        entidades (razon_social),
        instrumentos_pago (*),
        transacciones (id),
        aplicaciones_pago (
          monto_aplicado,
          comprobante_id,
          comprobantes (*)
        )
      `)
      .eq('organization_id', orgId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.typeFilter) {
      query = query.eq('tipo', filters.typeFilter)
    }

    if (filters.accountId && filters.accountId !== 'all') {
      query = query.eq('cuenta_id', filters.accountId)
    }

    if (filters.claseDocumentoFilter && filters.claseDocumentoFilter.length > 0) {
      query = query.in('clase_documento', filters.claseDocumentoFilter)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching treasury movements via Server Action:', error)
      return { data: [], error: error.message }
    }

    return { data: data || [], error: null }
  } catch (err: any) {
    console.error('Unexpected error in getTreasuryMovementsAction:', err)
    return { data: [], error: err.message || 'Internal Server Error' }
  }
}

export async function getTreasuryOverviewAction() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Auth error in getTreasuryOverviewAction:', authError)
      throw new Error('No authenticated user')
    }

    const orgId = await getOrgId(supabase, user.id)

    if (!orgId) {
      return { 
        data: { invoices: [], bankAccounts: [], transactions: [], pendingTransactions: [] }, 
        error: null 
      }
    }

    const adminClient = createAdminClient()

    // Perform queries in parallel using adminClient
    const [invRes, bankRes, txRes, qRes] = await Promise.all([
      adminClient
        .from('comprobantes')
        .select('*')
        .eq('organization_id', orgId)
        .order('fecha_vencimiento', { ascending: true }),
      adminClient
        .from('cuentas_bancarias')
        .select('id, nombre, banco, saldo_inicial, metadata')
        .eq('organization_id', orgId),
      adminClient
        .from('transacciones')
        .select('id, monto, metadata, fecha, created_at, estado, descripcion')
        .eq('organization_id', orgId)
        .order('fecha', { ascending: false }),
      adminClient
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .in('estado', ['pendiente', 'conciliado'])
        .order('fecha', { ascending: false })
        .limit(200)
    ])

    return {
      data: {
        invoices: invRes.data || [],
        bankAccounts: bankRes.data || [],
        transactions: txRes.data || [],
        pendingTransactions: qRes.data || []
      },
      error: null
    }
  } catch (err: any) {
    console.error('Unexpected error in getTreasuryOverviewAction:', err)
    return { 
      data: { invoices: [], bankAccounts: [], transactions: [], pendingTransactions: [] }, 
      error: err.message || 'Internal Server Error' 
    }
  }
}
