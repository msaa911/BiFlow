import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowUpRight, AlertTriangle, Activity, DollarSign } from 'lucide-react'
import { KPICard } from '@/components/ui/kpi-card'
import { DashboardActions } from '@/components/dashboard/actions'
import { TaxRecoveryWidget } from '@/components/dashboard/tax-recovery-widget'
import { ExpenseGuardWidget } from '@/components/dashboard/expense-guard-widget'
import { CashHealthScore } from '@/components/dashboard/cash-health-score'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Fetch Transactions
    const { data: transactions, error } = await supabase
        .from('transacciones')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error fetching transactions:', error)
    }

    // Calculate Metrics (Simple sum for demo)
    const { data: allTransactions } = await supabase
        .from('transacciones')
        .select('monto')

    const totalBalance = allTransactions?.reduce((acc, curr) => acc + curr.monto, 0) || 0

    // Fetch Tax Recovery Items
    const { data: taxItems } = await supabase
        .from('transacciones')
        .select('*')
        .contains('tags', ['impuesto_recuperable'])
        .order('fecha', { ascending: false })

    const totalRecoverable = taxItems?.reduce((acc, curr) => acc + curr.monto, 0) || 0

    // Fetch Expense Guard Anomalies
    const { data: anomalies } = await supabase
        .from('transacciones')
        .select('*')
        .contains('tags', ['alerta_precio'])
        .order('fecha', { ascending: false })

    const anomalyCount = anomalies?.length || 0

    // Fetch Quarantine Count
    const { count: quarantineCount } = await supabase
        .from('transacciones_revision')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente')

    // 2. Fetch Audit Findings for Score
    const { data: findings } = await supabase
        .from('hallazgos')
        .select('tipo, severidad')
        .eq('estado', 'detectado')

    // Calculate Score (Base 100)
    let healthScore = 100
    if (findings) {
        findings.forEach(f => {
            if (f.severidad === 'critical') healthScore -= 20
            else if (f.severidad === 'high') healthScore -= 10
            else healthScore -= 3
        })
    }
    healthScore = Math.max(15, healthScore) // Floor at 15

    const recoveryPotential = totalBalance > 0 ? Math.round((totalRecoverable / Math.abs(totalBalance)) * 100) : 0

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Panel de Control</h2>
                <p className="text-gray-400">Bienvenido a tu centro de inteligencia financiera.</p>
            </div>

            {/* Quarantine Alert */}
            {quarantineCount && quarantineCount > 0 ? (
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-500/20 rounded-full">
                            <AlertTriangle className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Tienes {quarantineCount} transacciones en revisión</h3>
                            <p className="text-sm text-purple-200/70">
                                Detectamos datos ambiguos en tus últimas importaciones. Revísalos para asegurar la integridad.
                            </p>
                        </div>
                    </div>
                    <a
                        href="/dashboard/quarantine"
                        className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-purple-500/20 whitespace-nowrap"
                    >
                        Revisar Cuarentena
                    </a>
                </div>
            ) : null}

            {/* Algorithmic CFO Widgets */}
            <div className="grid gap-6 md:grid-cols-4">
                <div className="md:col-span-2">
                    <CashHealthScore
                        score={healthScore}
                        anomalyCount={findings?.length || 0}
                        recoveryPotential={recoveryPotential}
                    />
                </div>
                <div className="md:col-span-1">
                    <KPICard
                        title="Saldo Operativo"
                        value={formatCurrency(totalBalance)}
                        description="Balance actual estimado"
                        icon={<Activity className="h-5 w-5 text-blue-400" />}
                        trend="neutral"
                    />
                </div>
                <div className="md:col-span-1">
                    <KPICard
                        title="Recupero Pendiente"
                        value={formatCurrency(totalRecoverable)}
                        description="Impuestos AFIP/ARBA"
                        icon={<DollarSign className="h-5 w-5 text-emerald-400" />}
                        trend="up"
                        trendValue="+5.2%"
                    />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <TaxRecoveryWidget totalRecoverable={totalRecoverable} taxItems={taxItems || []} />
                <ExpenseGuardWidget anomalies={anomalies || []} />
            </div>

            {/* Recent Transactions & Actions */}
            <div className="grid gap-6 md:grid-cols-3">
                {/* Transacciones (Wider) */}
                <div className="md:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                        <h3 className="font-semibold text-white">Transacciones Recientes</h3>
                        <button className="text-xs text-emerald-500 hover:text-emerald-400 font-medium transition-colors">Ver todas</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-800/50 text-xs uppercase font-medium text-gray-500">
                                <tr>
                                    <th className="px-6 py-3">Fecha</th>
                                    <th className="px-6 py-3">Descripción</th>
                                    <th className="px-6 py-3">Tags</th>
                                    <th className="px-6 py-3 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {transactions?.map((t) => (
                                    <tr key={t.id} className="hover:bg-gray-800/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {new Date(t.fecha).toLocaleDateString('es-AR')}
                                        </td>
                                        <td className="px-6 py-4 text-white truncate max-w-[200px]">
                                            {t.descripcion}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-1">
                                                {t.tags && t.tags.map((tag: string) => (
                                                    <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 border border-gray-700">
                                                        {tag.replace('_', ' ')}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className={`px-6 py-4 text-right font-medium ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {formatCurrency(t.monto)}
                                        </td>
                                    </tr>
                                ))}
                                {(!transactions || transactions.length === 0) && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                            No hay movimientos recientes.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Accesos Rápidos / Anomalías */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h3 className="font-semibold text-white mb-4">Acciones Rápidas</h3>
                    <DashboardActions />

                    <div className="mt-6">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Estado del Sistema</h4>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400">Base de Datos</span>
                                <span className="flex items-center gap-1.5 text-emerald-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                                    Conectado
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-400">Motor AI</span>
                                <span className="flex items-center gap-1.5 text-emerald-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                                    Listo
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
    }).format(amount)
}
