'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgId } from '@/lib/supabase/utils'

/**
 * Recupera los cheques en cartera (instrumentos de pago) para la organización actual.
 */
export async function getBankPortfolioAction() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const orgId = await getOrgId(supabase, user.id)

        if (!orgId) {
            return { data: [], error: null }
        }

        const adminClient = createAdminClient()

        const { data, error } = await adminClient
            .from('instrumentos_pago')
            .select(`
                *,
                movimientos_tesoreria!inner (
                    fecha,
                    entidades (razon_social)
                )
            `)
            .eq('movimientos_tesoreria.organization_id', orgId)
            .eq('metodo', 'cheque_terceros')
            .order('fecha_emision', { ascending: false })

        if (error) {
            console.error('Error fetching bank portfolio:', error)
            return { data: [], error: error.message }
        }

        return { data: data || [], error: null }
    } catch (err: any) {
        console.error('Unexpected error in getBankPortfolioAction:', err)
        return { data: [], error: err.message }
    }
}

/**
 * Recupera el resumen de transacciones y cuentas bancarias para el dashboard.
 */
export async function getBankOverviewAction() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const orgId = await getOrgId(supabase, user.id)

        if (!orgId) {
            return { data: { transactions: [], bankAccounts: [] }, error: null }
        }

        const adminClient = createAdminClient()

        const [txRes, pendingRes, bankRes] = await Promise.all([
            adminClient
                .from('transacciones')
                .select('*, comprobantes!comprobante_id(nro_factura, entidades(razon_social))')
                .eq('organization_id', orgId)
                .order('fecha', { ascending: false }),
            adminClient
                .from('transacciones')
                .select('*, comprobantes!comprobante_id(nro_factura, entidades(razon_social))')
                .eq('organization_id', orgId)
                .in('estado', ['pendiente', 'parcial'])
                .order('fecha', { ascending: false })
                .limit(200),
            adminClient
                .from('cuentas_bancarias')
                .select('id, banco_nombre, saldo_inicial, cbu')
                .eq('organization_id', orgId)
        ])

        if (txRes.error) throw txRes.error
        if (pendingRes.error) throw pendingRes.error
        if (bankRes.error) throw bankRes.error

        return {
            data: {
                transactions: txRes.data || [],
                pendingTransactions: pendingRes.data || [],
                bankAccounts: bankRes.data || []
            },
            error: null
        }
    } catch (err: any) {
        console.error('Unexpected error in getBankOverviewAction:', err)
        return { 
            data: { transactions: [], pendingTransactions: [], bankAccounts: [] }, 
            error: err.message 
        }
    }
}

/**
 * Recupera la lista de cuentas bancarias.
 */
export async function getBankAccountsAction() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const orgId = await getOrgId(supabase, user.id)

        if (!orgId) return { data: [], error: null }

        const adminClient = createAdminClient()

        const { data, error } = await adminClient
            .from('cuentas_bancarias')
            .select('*')
            .eq('organization_id', orgId)

        if (error) throw error

        return { data: data || [], error: null }
    } catch (err: any) {
        console.error('Unexpected error in getBankAccountsAction:', err)
        return { data: [], error: err.message }
    }
}

/**
 * Registra el depósito de un lote de cheques.
 */
export async function depositChecksAction(selectedCheckIds: string[], selectedAccountId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const adminClient = createAdminClient()

        const { error } = await adminClient
            .from('instrumentos_pago')
            .update({
                estado: 'depositado',
                metadata: {
                    deposito_banco_id: selectedAccountId,
                    fecha_deposito: new Date().toISOString()
                }
            })
            .in('id', selectedCheckIds)

        if (error) throw error

        return { success: true, error: null }
    } catch (err: any) {
        console.error('Error in depositChecksAction:', err)
        return { success: false, error: err.message }
    }
}
/**
 * Actualiza el estado de un instrumento de pago.
 */
export async function updateCheckStatusAction(checkId: string, newStatus: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const adminClient = createAdminClient()

        const { error } = await adminClient
            .from('instrumentos_pago')
            .update({ estado: newStatus })
            .eq('id', checkId)

        if (error) throw error

        return { success: true, error: null }
    } catch (err: any) {
        console.error('Error in updateCheckStatusAction:', err)
        return { success: false, error: err.message }
    }
}

/**
 * Ejecuta el rechazo de un cheque.
 */
export async function rejectCheckAction(params: {
    checkId: string,
    feeAmount: number,
    transactionId?: string | null
}) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const adminClient = createAdminClient()

        const { data, error } = await adminClient.rpc('handle_cheque_rejection', {
            p_instrument_id: params.checkId,
            p_fee_amount: params.feeAmount || 0,
            p_transaction_id: params.transactionId || null
        })

        if (error) throw error
        if (!data.success) throw new Error(data.error || 'Error desconocido')

        return { data, error: null }
    } catch (err: any) {
        console.error('Error in rejectCheckAction:', err)
        return { data: null, error: err.message }
    }
}
