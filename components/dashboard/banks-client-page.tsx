'use client'

import { BanksTab } from '@/components/dashboard/banks-tab'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface BanksClientPageProps {
    orgId: string
    initialTransactions: any[]
}

export function BanksClientPage({ orgId, initialTransactions }: BanksClientPageProps) {
    const [transactions, setTransactions] = useState(initialTransactions)
    const [pendingTransactions, setPendingTransactions] = useState<any[]>([])
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    const fetchData = useCallback(async () => {
        setLoading(true)
        const [txRes, pendingRes, bankRes] = await Promise.all([
            supabase
                .from('transacciones')
                .select('*, comprobantes!comprobante_id(nro_factura, entidades(razon_social))')
                .eq('organization_id', orgId)
                .order('fecha', { ascending: false }),
            supabase
                .from('transacciones')
                .select('*, comprobantes!comprobante_id(nro_factura, entidades(razon_social))')
                .eq('organization_id', orgId)
                .in('estado', ['pendiente', 'parcial'])
                .order('fecha', { ascending: false })
                .limit(200),
            supabase
                .from('cuentas_bancarias')
                .select('id, banco_nombre, saldo_inicial')
                .eq('organization_id', orgId)
        ])

        if (txRes.data) setTransactions(txRes.data)
        if (pendingRes.data) setPendingTransactions(pendingRes.data)
        if (bankRes.data) setBankAccounts(bankRes.data)
        setLoading(false)
    }, [orgId, supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    return (
        <BanksTab
            orgId={orgId}
            initialTransactions={transactions}
            pendingTransactions={pendingTransactions}
            bankAccounts={bankAccounts}
            onRefresh={fetchData}
        />
    )
}
