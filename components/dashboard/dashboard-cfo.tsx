'use client'

import { useState } from 'react'
import { CashHealthScore } from './cash-health-score'
import { StressTestModal } from './stress-test-modal'
import { DashboardActions } from './actions'
import { KPICard } from '@/components/ui/kpi-card'
import { Activity, DollarSign, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface DashboardCFOProps {
    healthScore: number
    anomalyCount: number
    recoveryPotential: number
    totalBalance: number
    totalRecoverable: number
    opportunityCost: number
    daysOfRunway: number | 'stable'
    overdraftLimit: number
    liquidityBuffer?: number
    apBatch?: { descripcion: string, monto: number, fecha: string }[]
}

export function DashboardCFO({
    healthScore,
    anomalyCount,
    recoveryPotential,
    totalBalance,
    totalRecoverable,
    opportunityCost,
    daysOfRunway,
    overdraftLimit,
    liquidityBuffer = 0,
    apBatch = []
}: DashboardCFOProps) {
    const [isStressTestOpen, setIsStressTestOpen] = useState(false)
    const isUnderBuffer = totalBalance < liquidityBuffer

    return (
        <>
            <div className="grid gap-6 md:grid-cols-4 mb-6">
                <KPICard
                    title="Saldo Operativo"
                    value={formatCurrency(totalBalance)}
                    description={isUnderBuffer ? "POR DEBAJO DEL COLCHÓN" : "Balance actual estimado"}
                    icon={<Activity className={`h-5 w-5 ${isUnderBuffer ? 'text-red-400' : 'text-blue-400'}`} />}
                    trend={isUnderBuffer ? "down" : "neutral"}
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

            {isUnderBuffer && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <div>
                            <p className="text-red-400 font-bold text-sm">Alerta de Liquidez Crítica</p>
                            <p className="text-gray-400 text-xs text-balance">El saldo actual está por debajo de tu colchón configurado de {formatCurrency(liquidityBuffer)}. Riesgo de incumplimiento en 48hs.</p>
                        </div>
                    </div>
                    <Badge variant="destructive" className="animate-pulse">RIESGO ALTO</Badge>
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-3 items-stretch">
                <div className="md:col-span-2 h-full">
                    <CashHealthScore
                        score={healthScore}
                        anomalyCount={anomalyCount}
                        recoveryPotential={recoveryPotential}
                        opportunityCost={opportunityCost}
                        onOpenStressTest={() => setIsStressTestOpen(true)}
                    />
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 group hover:border-gray-700 transition-all duration-500 shadow-2xl flex flex-col h-full">
                    <h3 className="font-bold text-white mb-6 uppercase tracking-tighter text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" /> Acciones Rápidas
                    </h3>
                    <div className="flex-1 flex flex-col justify-center">
                        <DashboardActions />
                    </div>
                </div>
            </div>

            <StressTestModal
                isOpen={isStressTestOpen}
                onClose={() => setIsStressTestOpen(false)}
                currentBalance={totalBalance}
                initialBatch={apBatch}
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
