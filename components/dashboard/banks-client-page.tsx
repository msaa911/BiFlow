'use client'

import { BanksTab } from '@/components/dashboard/banks-tab'
import { useState, useEffect, useCallback } from 'react'
import { getBankOverviewAction } from '@/app/actions/banks'

interface BanksClientPageProps {
    orgId: string
    initialTransactions: any[]
}

export function BanksClientPage({ orgId, initialTransactions }: BanksClientPageProps) {
    const [transactions, setTransactions] = useState(initialTransactions)
    const [pendingTransactions, setPendingTransactions] = useState<any[]>([])
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        const { data, error } = await getBankOverviewAction()

        if (!error && data) {
            setTransactions(data.transactions || [])
            setPendingTransactions(data.pendingTransactions || [])
            setBankAccounts(data.bankAccounts || [])
        }
        setLoading(false)
    }, [])

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
