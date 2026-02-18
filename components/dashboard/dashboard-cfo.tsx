'use client'

import { useState } from 'react'
import { CashHealthScore } from './cash-health-score'
import { StressTestModal } from './stress-test-modal'
import { KPICard } from '@/components/ui/kpi-card'
import { Activity, DollarSign } from 'lucide-react'

interface DashboardCFOProps {
    healthScore: number
    anomalyCount: number
    recoveryPotential: number
    totalBalance: number
    totalRecoverable: number
    opportunityCost: number
    daysOfRunway: number | 'stable'
    overdraftLimit: number
}

export function DashboardCFO({
    healthScore,
    anomalyCount,
    recoveryPotential,
    totalBalance,
    totalRecoverable,
    opportunityCost,
    daysOfRunway,
    overdraftLimit
}: DashboardCFOProps) {
    const [isStressTestOpen, setIsStressTestOpen] = useState(false)

    return (
        <>
            <div className="grid gap-6 md:grid-cols-4 mb-6">
                <KPICard
                    title="Saldo Operativo"
                    value={formatCurrency(totalBalance)}
                    description="Balance actual estimado"
                    icon={<Activity className="h-5 w-5 text-blue-400" />}
                    trend="neutral"
                />
                <KPICard
                    title="Costo Oportunidad"
                    value={formatCurrency(opportunityCost)}
                    description="Dinero ocioso (30 días)"
                    icon={<DollarSign className="h-5 w-5 text-amber-400" />}
                    trend={opportunityCost > 0 ? "down" : "neutral"}
                    trendValue={opportunityCost > 0 ? "Pérdida" : undefined}
                />
                <KPICard
                    title="Supervivencia"
                    value={daysOfRunway === 'stable' ? 'Estable' : `${daysOfRunway} días`}
                    description={`Incluye $${overdraftLimit.toLocaleString()} desc.`}
                    icon={<Activity className="h-5 w-5 text-purple-400" />}
                    trend={daysOfRunway === 'stable' || daysOfRunway > 30 ? "up" : "down"}
                />
                <KPICard
                    title="Recupero Pendiente"
                    value={formatCurrency(totalRecoverable)}
                    description="Impuestos AFIP/ARBA"
                    icon={<DollarSign className="h-5 w-5 text-emerald-400" />}
                    trend="up"
                />
            </div>

            <div className="grid gap-6 md:grid-cols-1">
                <CashHealthScore
                    score={healthScore}
                    anomalyCount={anomalyCount}
                    recoveryPotential={recoveryPotential}
                    onOpenStressTest={() => setIsStressTestOpen(true)}
                />
            </div>

            <StressTestModal
                isOpen={isStressTestOpen}
                onClose={() => setIsStressTestOpen(false)}
                currentBalance={totalBalance}
                initialBatch={[]} // Can be populated from recent uploads if needed
            />
        </>
    )
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
    }).format(amount)
}
