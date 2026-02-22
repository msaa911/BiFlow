import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowUpRight, AlertTriangle, Activity, DollarSign, Brain, Link as LinkIcon, ArrowRight, List, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { KPICard } from '@/components/ui/kpi-card'
import { DashboardActions } from '@/components/dashboard/actions'
import { TaxRecoveryWidget } from '@/components/dashboard/tax-recovery-widget'
import { ExpenseGuardWidget } from '@/components/dashboard/expense-guard-widget'
import { DuplicateGuardWidget } from '@/components/dashboard/duplicate-guard-widget'
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
        .select('id, monto, metadata, fecha, descripcion')
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

    // Separate anomalies for widgets
    const priceSpikes = anomalies?.filter(a => a.tags?.includes('alerta_precio')) || []
    const duplicates = anomalies?.filter(a => a.tags?.includes('posible_duplicado')) || []

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

    // Triple View Calculations
    const incomes = allTransactions?.filter(t => t.monto > 0).slice(0, 20) || []
    const expenses = allTransactions?.filter(t => t.monto < 0).slice(0, 20) || []
    const bankTransactions = allTransactions?.slice(0, 20) || []

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

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <TaxRecoveryWidget totalRecoverable={totalRecoverable} taxItems={taxItems || []} />
                <ExpenseGuardWidget anomalies={priceSpikes} />
                <DuplicateGuardWidget duplicates={duplicates} />
                <FeeAuditWidget />
            </div>

            {/* Transactions Refactor: Triple View */}
            <div className="grid gap-6 md:grid-cols-2 items-stretch">
                {/* Left: Global Bank Transactions */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl h-[600px] flex flex-col">
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/20">
                        <h3 className="font-bold text-white uppercase tracking-tighter text-sm flex items-center gap-2">
                            <List className="w-4 h-4 text-emerald-500" /> Transacciones Bancarias
                        </h3>
                        <Link href="/dashboard/transactions" className="text-[10px] text-emerald-500 hover:text-emerald-400 font-black uppercase tracking-widest transition-colors">Ver todas</Link>
                    </div>
                    <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                        <table className="w-full text-left text-xs text-gray-400">
                            <thead className="bg-black/20 text-[10px] uppercase font-bold text-gray-500 sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    <th className="px-6 py-3">Fecha</th>
                                    <th className="px-6 py-3">Descripción</th>
                                    <th className="px-6 py-3 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {bankTransactions.map((t: any) => (
                                    <tr key={t.id} className="hover:bg-gray-800/30 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-500 group-hover:text-gray-300">
                                            {new Date(t.fecha).toLocaleDateString('es-AR')}
                                        </td>
                                        <td className="px-6 py-4 text-white font-medium truncate max-w-[200px]">
                                            {t.descripcion}
                                        </td>
                                        <td className={`px-6 py-4 text-right font-black ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {formatCurrency(t.monto)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: Income & Expenses Split */}
                <div className="flex flex-col gap-6 h-[600px]">
                    {/* Top: Incomes */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex-1 flex flex-col">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-emerald-500/5">
                            <h3 className="font-bold text-white uppercase tracking-tighter text-xs flex items-center gap-2">
                                <TrendingUp className="w-3 h-3 text-emerald-500" /> Ingresos Recientes
                            </h3>
                            <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded uppercase">Últimos 20</span>
                        </div>
                        <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                            <table className="w-full text-left text-[11px] text-gray-400">
                                <tbody className="divide-y divide-gray-800">
                                    {incomes.map((t: any) => (
                                        <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-500">
                                                {new Date(t.fecha).toLocaleDateString('es-AR')}
                                            </td>
                                            <td className="px-4 py-3 text-white font-medium truncate max-w-[150px]">
                                                {t.descripcion}
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-emerald-400">
                                                {formatCurrency(t.monto)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Bottom: Expenses */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex-1 flex flex-col">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-red-500/5">
                            <h3 className="font-bold text-white uppercase tracking-tighter text-xs flex items-center gap-2">
                                <TrendingDown className="w-3 h-3 text-red-500" /> Egresos Recientes
                            </h3>
                            <span className="text-[9px] font-black bg-red-500/10 text-red-500 px-2 py-0.5 rounded uppercase">Últimos 20</span>
                        </div>
                        <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                            <table className="w-full text-left text-[11px] text-gray-400">
                                <tbody className="divide-y divide-gray-800">
                                    {expenses.map((t: any) => (
                                        <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-500">
                                                {new Date(t.fecha).toLocaleDateString('es-AR')}
                                            </td>
                                            <td className="px-4 py-3 text-white font-medium truncate max-w-[150px]">
                                                {t.descripcion}
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-red-400">
                                                {formatCurrency(t.monto)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
