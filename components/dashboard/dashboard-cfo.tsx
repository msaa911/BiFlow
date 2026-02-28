'use client'

import { useState } from 'react'
import { CashHealthScore } from './cash-health-score'
import { StressTestModal } from './stress-test-modal'
import { DashboardActions } from './actions'
import { KPICard } from '@/components/ui/kpi-card'
import { Activity, DollarSign, AlertCircle, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CashFlowChart } from './cash-flow-chart'
import { ReconciliationAlerts } from './reconciliation-alerts'
import { DailyBalance } from '@/lib/treasury-engine'

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
    projectionData?: DailyBalance[]
    scoreHistory?: { score: number, fecha: string }[]
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
    projectionData = [],
    scoreHistory = [],
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

            <div className="grid gap-6 lg:grid-cols-3 mb-6">
                {/* Main Projections Area */}
                <div className="lg:col-span-2 space-y-6">
                    {isUnderBuffer && (
                        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-500">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-red-500" />
                                <div>
                                    <p className="text-red-400 font-bold text-sm">Alerta de Liquidez Crítica</p>
                                    <p className="text-gray-400 text-xs">El saldo actual está por debajo de tu colchón de {formatCurrency(liquidityBuffer)}. Riesgo de incumplimiento en 48hs.</p>
                                </div>
                            </div>
                            <Badge variant="destructive" className="animate-pulse">RIESGO ALTO</Badge>
                        </div>
                    )}

                    <CashFlowChart data={projectionData} liquidityBuffer={liquidityBuffer} />
                </div>

                {/* Right Alerts Area */}
                <div className="space-y-6">
                    <ReconciliationAlerts />

                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 group hover:border-gray-700 transition-all duration-500 shadow-2xl flex flex-col h-fit">
                        <h3 className="font-bold text-white mb-6 uppercase tracking-tighter text-sm flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-500" /> Acciones Rápidas
                        </h3>
                        <DashboardActions />
                    </div>
                </div>
            </div>

            <div className="mb-6">
                <CashHealthScore
                    score={healthScore}
                    anomalyCount={anomalyCount}
                    recoveryPotential={recoveryPotential}
                    opportunityCost={opportunityCost}
                    history={scoreHistory}
                    onOpenStressTest={() => setIsStressTestOpen(true)}
                />
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
