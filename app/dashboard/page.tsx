import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowUpRight, AlertTriangle, Activity, DollarSign, Brain, Link as LinkIcon, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { KPICard } from '@/components/ui/kpi-card'
import { DashboardActions } from '@/components/dashboard/actions'
import { TaxRecoveryWidget } from '@/components/dashboard/tax-recovery-widget'
import { ExpenseGuardWidget } from '@/components/dashboard/expense-guard-widget'
import { FeeAuditWidget } from '@/components/dashboard/fee-audit-widget'
import { DashboardCFO } from '@/components/dashboard/dashboard-cfo'
import { TaxLearningWidget } from '@/components/dashboard/tax-learning-widget'
import { LiquidityEngine } from '@/lib/liquidity-engine'
import { getOrgId } from '@/lib/supabase/utils'
import { ScrollToFocus } from '@/components/dashboard/scroll-to-focus'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const orgId = await getOrgId(supabase, user.id)

    // Fetch Transactions
    const { data: transactions, error } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .order('fecha', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error fetching transactions:', error)
    }

    // Fetch Thesaurus
    const { data: thesaurusEntries } = await supabase
        .from('financial_thesaurus')
        .select('raw_pattern, normalized_concept')

    const thesaurusMap = new Map(thesaurusEntries?.map(e => [e.raw_pattern, e.normalized_concept]) || [])

    // Fetch All Transactions for Metrics
    const { data: allTransactions } = await supabase
        .from('transacciones')
        .select('monto, metadata, fecha')
        .eq('organization_id', orgId)
        .order('fecha', { ascending: false })

    // 1. Calculate OPERATIVE BALANCE
    // Find the latest transaction that has a 'saldo' in its metadata
    const latestWithSaldo = allTransactions?.find(t => t.metadata?.saldo !== undefined)

    let totalBalance = 0
    if (latestWithSaldo) {
        // Current Balance = Latest reported Balance + any NEWER transactions (if not included in the latest report)
        // Since we ordered by date DESC, if we found it, it's the most recent state.
        totalBalance = Number(latestWithSaldo.metadata.saldo)
    } else {
        // Fallback: Simple sum (less accurate if history is partial)
        const transactionsSum = allTransactions?.reduce((acc: number, curr: any) => acc + curr.monto, 0) || 0
        totalBalance = transactionsSum
    }

    // Fetch Initial Bank Balances (Only used as additional cushion if no saldo in metadata)
    const { data: bankAccounts } = await supabase
        .from('cuentas_bancarias')
        .select('saldo_inicial')
        .eq('organization_id', orgId)

    const initialBalancesSum = bankAccounts?.reduce((acc: number, curr: any) => acc + (Number(curr.saldo_inicial) || 0), 0) || 0

    if (!latestWithSaldo) {
        totalBalance += initialBalancesSum
    }

    // 2. Calculate BURN RATE (Expenses in last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const monthlyExpenses = allTransactions
        ?.filter(t => t.monto < 0 && new Date(t.fecha) >= thirtyDaysAgo)
        ?.reduce((acc, t) => acc + Math.abs(t.monto), 0) || 0

    const dailyBurn = monthlyExpenses / 30

    // Fetch Tax Recovery Items
    const { data: taxItems } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .contains('tags', ['impuesto_recuperable'])
        .order('fecha', { ascending: false })

    const totalRecoverable = taxItems?.reduce((acc: number, curr: any) => acc + curr.monto, 0) || 0

    // Fetch Expense Guard Anomalies (Include duplicates and trust ledger alerts)
    const { data: anomalies } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', orgId)
        .or('tags.cs.{"alerta_precio"},tags.cs.{"posible_duplicado"},tags.cs.{"riesgo_bec"}')
        .order('fecha', { ascending: false })

    const anomalyCount = anomalies?.length || 0

    // Fetch Quarantine Count
    const { count: quarantineCount } = await supabase
        .from('transacciones_revision')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('estado', 'pendiente')

    // Fetch Pending Tax Rules for Alert
    const { count: pendingTaxesCount } = await supabase
        .from('tax_intelligence_rules')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('estado', 'PENDIENTE')

    // 2. Fetch Audit Findings for Score
    const { data: findings } = await supabase
        .from('hallazgos')
        .select('tipo, severidad')
        .eq('organization_id', orgId)
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

    // 3. Fetch Company Config (TNA & Overdraft) (orgId already fetched above)
    const { data: orgConfig } = await supabase
        .from('configuracion_empresa')
        .select('*')
        .eq('organization_id', orgId)
        .single()

    const tnaManual = orgConfig?.tna || 0.70
    const modoTasa = orgConfig?.modo_tasa || 'AUTOMATICO'
    const overdraftLimit = orgConfig?.limite_descubierto || 0

    let tnaEfectiva = tnaManual
    if (modoTasa === 'AUTOMATICO') {
        const { data: marketData } = await supabase
            .from('indices_mercado')
            .select('tasa_plazo_fijo_30d, tasa_plazo_fijo')
            .order('fecha', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (marketData) {
            tnaEfectiva = marketData.tasa_plazo_fijo_30d || marketData.tasa_plazo_fijo || tnaManual
        }
    }

    // Total spent in last 30 days including taxes
    const totalVolume = allTransactions
        ?.filter(t => new Date(t.fecha) >= thirtyDaysAgo)
        ?.reduce((acc, t) => acc + Math.abs(t.monto), 0) || 1 // Avoid divide by zero

    const recoveryPotential = Math.min(100, Math.round((totalRecoverable / totalVolume) * 100))

    // Liquidity Logic
    const opportunityCost = LiquidityEngine.calculateOpportunityCost(totalBalance, 30, tnaEfectiva)
    const daysOfRunway = dailyBurn > 100 ? Math.min(365, Math.floor((totalBalance + overdraftLimit) / dailyBurn)) : 'stable'

    return (
        <div className="space-y-8">
            <div>
                <Suspense fallback={null}>
                    <ScrollToFocus />
                </Suspense>
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

            {/* Tax Learning Widget - Direct interaction if pending taxes exist */}
            {pendingTaxesCount && pendingTaxesCount > 0 ? (
                <div className="max-w-4xl mx-auto">
                    <TaxLearningWidget organizationId={orgId} />
                </div>
            ) : null}

            {/* Algorithmic CFO Widgets */}
            <DashboardCFO
                healthScore={healthScore}
                anomalyCount={anomalyCount}
                recoveryPotential={recoveryPotential}
                totalBalance={totalBalance}
                totalRecoverable={totalRecoverable}
                opportunityCost={opportunityCost}
                daysOfRunway={daysOfRunway}
                overdraftLimit={overdraftLimit}
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <TaxRecoveryWidget totalRecoverable={totalRecoverable} taxItems={taxItems || []} />
                <ExpenseGuardWidget anomalies={anomalies || []} />
                <FeeAuditWidget />
            </div>

            {/* Recent Transactions & Actions */}
            <div className="grid gap-6 md:grid-cols-3">
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
                                    <th className="px-6 py-3">Hallazgos</th>
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
                                            <div className="flex flex-wrap gap-1">
                                                {t.tags && t.tags.filter((tag: string) => ['posible_duplicado', 'alerta_precio', 'impuesto_recuperable', 'pendiente_clasificacion', 'servicio_detectado', 'costo_impositivo'].includes(tag)).map((tag: string) => (
                                                    <span
                                                        key={tag}
                                                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter border ${tag === 'impuesto_recuperable' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                            tag === 'pendiente_clasificacion' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                                tag === 'servicio_detectado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                    tag === 'costo_impositivo' ? 'bg-gray-800 text-gray-500 border-gray-700' :
                                                                        'bg-red-500/10 text-red-500 border-red-500/20'
                                                            }`}
                                                    >
                                                        {tag === 'posible_duplicado' ? 'Duplicado' :
                                                            tag === 'alerta_precio' ? 'Sobreprecio' :
                                                                tag === 'pendiente_clasificacion' ? 'Impuesto' :
                                                                    tag === 'servicio_detectado' ? 'Servicio' :
                                                                        tag === 'costo_impositivo' ? 'Costo Fiscal' :
                                                                            'Crédito Fiscal'}
                                                    </span>
                                                ))}
                                                {(!t.tags || t.tags.length === 0) && <span className="text-gray-600 text-[10px]">---</span>}
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
