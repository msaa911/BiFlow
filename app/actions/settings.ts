'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgId } from '@/lib/supabase/utils'
import { revalidatePath } from 'next/cache'

/**
 * Recupera toda la información de configuración de la empresa.
 * Incluye configuración financiera, cuentas bancarias, índices y miembros.
 */
export async function getCompanySettingsAction() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const orgId = await getOrgId(supabase, user.id)

        if (!orgId) {
            return { 
                data: {
                    config: null,
                    bankAccounts: [],
                    marketIndices: [],
                    taxRules: [],
                    members: []
                }, 
                error: 'No organization found' 
            }
        }

        const adminClient = createAdminClient()

        const [configRes, bankRes, marketRes, taxRes, membersRes, logsRes] = await Promise.all([
            adminClient.from('configuracion_empresa').select('*').eq('organization_id', orgId).single(),
            adminClient.from('cuentas_bancarias').select('*').eq('organization_id', orgId).order('created_at'),
            adminClient.from('indices_mercado').select('*').order('fecha', { ascending: false }).limit(1),
            adminClient.from('tax_intelligence_rules').select('*').eq('organization_id', orgId),
            adminClient.from('organization_members').select('id, role, user_id, created_at').eq('organization_id', orgId),
            adminClient.from('automation_logs').select('*').limit(5).order('created_at', { ascending: false })
        ])

        return {
            data: {
                config: configRes.data || null,
                bankAccounts: bankRes.data || [],
                marketIndices: marketRes.data || [],
                taxRules: taxRes.data || [],
                members: membersRes.data || [],
                automationLogs: logsRes.data || []
            },
            error: null
        }
    } catch (err: any) {
        console.error('Unexpected error in getCompanySettingsAction:', err)
        return { data: null, error: err.message }
    }
}

/**
 * Guarda la configuración de la empresa y actualiza las cuentas bancarias.
 */
export async function saveCompanySettingsAction(params: {
    config: {
        tna: number;
        limite_descubierto: number;
    };
    bankAccounts: any[];
}) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const orgId = await getOrgId(supabase, user.id)
        if (!orgId) throw new Error('No organization found')

        const adminClient = createAdminClient()

        // 1. Guardar Configuración de Empresa
        const { error: configError } = await adminClient
            .from('configuracion_empresa')
            .upsert({
                organization_id: orgId,
                tna: params.config.tna,
                limite_descubierto: params.config.limite_descubierto,
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id' })

        if (configError) throw configError

        // 2. Guardar Cuentas Bancarias
        // Mapeamos para asegurar que tengan el organization_id correcto
        const accountsToUpsert = params.bankAccounts.map(acc => ({
            ...acc,
            organization_id: orgId,
            updated_at: new Date().toISOString()
        }))

        if (accountsToUpsert.length > 0) {
            const { error: bankError } = await adminClient
                .from('cuentas_bancarias')
                .upsert(accountsToUpsert)

            if (bankError) throw bankError
        }

        revalidatePath('/dashboard/settings')
        return { success: true, error: null }
    } catch (err: any) {
        console.error('Error in saveCompanySettingsAction:', err)
        return { success: false, error: err.message }
    }
}

/**
 * Elimina un miembro de la organización.
 */
export async function removeOrganizationMemberAction(memberId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const adminClient = createAdminClient()

        const { error } = await adminClient
            .from('organization_members')
            .delete()
            .eq('id', memberId)

        if (error) throw error

        revalidatePath('/dashboard/settings')
        return { success: true, error: null }
    } catch (err: any) {
        console.error('Error in removeOrganizationMemberAction:', err)
        return { success: false, error: err.message }
    }
}

/**
 * Elimina una regla de inteligencia de impuestos.
 */
export async function deleteTaxRuleAction(ruleId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const adminClient = createAdminClient()

        const { error } = await adminClient
            .from('tax_intelligence_rules')
            .delete()
            .eq('id', ruleId)

        if (error) throw error

        revalidatePath('/dashboard/settings')
        return { success: true, error: null }
    } catch (err: any) {
        console.error('Error in deleteTaxRuleAction:', err)
        return { success: false, error: err.message }
    }
}

/**
 * Elimina una cuenta bancaria.
 */
export async function deleteBankAccountAction(accountId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('No authenticated user')

        const adminClient = createAdminClient()

        const { error } = await adminClient
            .from('cuentas_bancarias')
            .delete()
            .eq('id', accountId)

        if (error) throw error

        revalidatePath('/dashboard/settings')
        return { success: true, error: null }
    } catch (err: any) {
        console.error('Error in deleteBankAccountAction:', err)
        return { success: false, error: err.message }
    }
}
