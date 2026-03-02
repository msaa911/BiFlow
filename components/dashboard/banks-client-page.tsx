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
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    const fetchData = useCallback(async () => {
        setLoading(true)
        const [txRes, pendingRes] = await Promise.all([
            supabase
                .from('transacciones')
                .select('*')
                .eq('organization_id', orgId)
                .order('fecha', { ascending: false }),
            supabase
                .from('transacciones')
                .select('*')
                .eq('organization_id', orgId)
                .in('estado', ['pendiente', 'parcial'])
                .order('fecha', { ascending: false })
                .limit(200)
        ])

        if (txRes.data) setTransactions(txRes.data)
        if (pendingRes.data) setPendingTransactions(pendingRes.data)
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
            onRefresh={fetchData}
        />
    )
}
