import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertTriangle, List, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { DashboardCFO } from '@/components/dashboard/dashboard-cfo'
import { TaxRecoveryWidget } from '@/components/dashboard/tax-recovery-widget'
import { ExpenseGuardWidget } from '@/components/dashboard/expense-guard-widget'
import { DuplicateGuardWidget } from '@/components/dashboard/duplicate-guard-widget'
import { FeeAuditWidget } from '@/components/dashboard/fee-audit-widget'
import { TaxLearningWidget } from '@/components/dashboard/tax-learning-widget'
import { LiquidityEngine } from '@/lib/liquidity-engine'
import { TreasuryEngine } from '@/lib/treasury-engine'
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

    // 1. Fetch Transactions for Balance & Metrics
    const { data: allTransactions } = await supabase
        .from('transacciones')
        .select('id, monto, metadata, fecha, descripcion, created_at')
        .eq('organization_id', orgId)
        .order('fecha', { ascending: false })

    // Calculate Balance
    const latestWithSaldo = allTransactions?.find(t => t.metadata?.saldo !== undefined)
    let totalBalance = 0;
    if (latestWithSaldo) {
        const baseBalance = Number(latestWithSaldo.metadata.saldo);
        const moreRecentTransactions = allTransactions
            ?.filter(t => new Date(t.fecha) > new Date(latestWithSaldo.fecha) || (t.fecha === latestWithSaldo.fecha && t.id !== latestWithSaldo.id && new Date(t.created_at || 0) > new Date(latestWithSaldo.created_at || 0)))
            ?.reduce((acc: number, curr: any) => acc + curr.monto, 0) || 0
        totalBalance = baseBalance + moreRecentTransactions;
    } else {
        const { data: bankAccounts } = await supabase.from('cuentas_bancarias').select('saldo_inicial').eq('organization_id', orgId)
        const initialBalancesSum = bankAccounts?.reduce((acc: number, curr: any) => acc + (Number(curr.saldo_inicial) || 0), 0) || 0
        const transactionsSum = allTransactions?.reduce((acc: number, curr: any) => acc + curr.monto, 0) || 0
        totalBalance = initialBalancesSum + transactionsSum
    }

    // Burn Rate
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const monthlyExpenses = allTransactions?.filter(t => t.monto < 0 && new Date(t.fecha) >= thirtyDaysAgo)?.reduce((acc, t) => acc + Math.abs(t.monto), 0) || 0
    const dailyBurn = monthlyExpenses / 30

    // 2. Fetch Invoices & Config for Projections
    const { data: pendingInvoices } = await supabase
        .from('comprobantes')
        .select('*')
        .eq('organization_id', orgId)
        .neq('estado', 'pagado')
        .order('fecha_vencimiento', { ascending: true })

    const { data: orgConfig } = await supabase.from('configuracion_empresa').select('*').eq('organization_id', orgId).single()
    const liquidityCushion = orgConfig?.colchon_liquidez || 0
    const overdraftLimit = orgConfig?.limite_descubierto || 0
    const tnaEfectiva = orgConfig?.tna || 0.70

    // 3. Process Projection Data
    const invoicesForProjection = (pendingInvoices || []).map(i => ({
        id: i.id,
        tipo: i.tipo,
        razon_social_socio: i.razon_social_socio,
        cuit_socio: i.cuit_socio,
        fecha_emision: i.fecha_emision,
        fecha_vencimiento: i.fecha_vencimiento,
        monto_total: i.monto_total,
        monto_pendiente: i.monto_pendiente,
        estado: i.estado
    }))
    const projectionData = TreasuryEngine.projectDailyBalance(totalBalance, invoicesForProjection as any, [], liquidityCushion)

    // 4. Fetch Other Widgets Data
    const { data: taxItems } = await supabase.from('transacciones').select('*').eq('organization_id', orgId).contains('tags', ['impuesto_recuperable']).order('fecha', { ascending: false })
    const totalRecoverable = taxItems?.reduce((acc: number, curr: any) => acc + curr.monto, 0) || 0
    const { data: anomalies } = await supabase.from('transacciones').select('*').eq('organization_id', orgId).or('tags.cs.{"alerta_precio"},tags.cs.{"posible_duplicado"},tags.cs.{"riesgo_bec"}').order('fecha', { ascending: false })
    const anomalyCount = anomalies?.length || 0
    const { count: quarantineCount } = await supabase.from('transacciones_revision').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('estado', 'pendiente')
    const { count: pendingTaxesCount } = await supabase.from('reglas_fiscales_ia').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('estado', 'PENDIENTE')
    const { data: findings } = await supabase.from('hallazgos').select('tipo, severidad').eq('organization_id', orgId).eq('estado', 'detectado')

    let healthScore = 100
    if (findings) findings.forEach(f => {
        if (f.severidad === 'critical') healthScore -= 20
        else if (f.severidad === 'high') healthScore -= 10
        else healthScore -= 3
    })
    healthScore = Math.max(15, healthScore)

    const opportunityCost = LiquidityEngine.calculateOpportunityCost(totalBalance, 30, tnaEfectiva, liquidityCushion)
    const daysOfRunway = dailyBurn > 100 ? Math.min(365, Math.floor((totalBalance + overdraftLimit) / dailyBurn)) : 'stable'

    // Triple View Data
    const incomes = allTransactions?.filter(t => t.monto > 0).slice(0, 20) || []
    const expenses = allTransactions?.filter(t => t.monto < 0).slice(0, 20) || []
    const bankTransactions = allTransactions?.slice(0, 20) || []

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <Suspense fallback={null}><ScrollToFocus /></Suspense>
                    <h2 className="text-2xl font-bold tracking-tight">Panel de Control</h2>
                    <p className="text-gray-400">Todo el poder de la inteligencia financiera en tu mano.</p>
                </div>
            </div>

            {quarantineCount && quarantineCount > 0 ? (
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-500/20 rounded-full"><AlertTriangle className="w-6 h-6 text-purple-400" /></div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Tienes {quarantineCount} transacciones en revisión</h3>
                        </div>
                    </div>
                    <a href="/dashboard/quarantine" className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-purple-500/20 whitespace-nowrap">Revisar</a>
                </div>
            ) : null}

            {pendingTaxesCount && pendingTaxesCount > 0 ? (
                <div className="max-w-4xl mx-auto"><TaxLearningWidget organizationId={orgId} /></div>
            ) : null}

            <DashboardCFO
                healthScore={healthScore}
                anomalyCount={anomalyCount}
                recoveryPotential={Math.round((totalRecoverable / (totalBalance || 1)) * 100)}
                totalBalance={totalBalance}
                totalRecoverable={totalRecoverable}
                opportunityCost={opportunityCost}
                daysOfRunway={daysOfRunway}
                overdraftLimit={overdraftLimit}
                liquidityBuffer={liquidityCushion}
                projectionData={projectionData}
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <TaxRecoveryWidget totalRecoverable={totalRecoverable} taxItems={taxItems || []} />
                <ExpenseGuardWidget anomalies={anomalies?.filter(a => a.tags?.includes('alerta_precio')) || []} />
                <DuplicateGuardWidget duplicates={anomalies?.filter(a => a.tags?.includes('posible_duplicado')) || []} />
                <FeeAuditWidget />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl h-[400px] flex flex-col">
                    <div className="p-4 border-b border-gray-800 flex justify-between bg-gray-800/20">
                        <h3 className="font-bold text-white text-xs flex items-center gap-2"><List className="w-4 h-4 text-emerald-500" /> Transacciones Recientes</h3>
                        <Link href="/dashboard/transactions" className="text-[10px] text-emerald-500 uppercase font-black">Ver todas</Link>
                    </div>
                    <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                        <table className="w-full text-left text-xs text-gray-400">
                            <tbody className="divide-y divide-gray-800">
                                {bankTransactions.map((t: any) => (
                                    <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-4 py-3 font-mono text-gray-500">{new Date(t.fecha).toLocaleDateString('es-AR')}</td>
                                        <td className="px-4 py-3 text-white font-medium truncate max-w-[150px]">{t.descripcion}</td>
                                        <td className={`px-4 py-3 text-right font-black ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-rows-2 gap-6 h-[400px]">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                        <div className="p-3 border-b border-gray-800 bg-emerald-500/5">
                            <h3 className="font-bold text-white text-[11px] uppercase flex items-center gap-2"><TrendingUp className="w-3 h-3 text-emerald-500" /> Ingresos</h3>
                        </div>
                        <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                            <table className="w-full text-left text-[10px] text-gray-400">
                                <tbody className="divide-y divide-gray-800">
                                    {incomes.map((t: any) => (
                                        <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="px-4 py-2 font-mono">{new Date(t.fecha).toLocaleDateString('es-AR')}</td>
                                            <td className="px-4 py-2 text-white truncate max-w-[120px]">{t.descripcion}</td>
                                            <td className="px-4 py-2 text-right font-black text-emerald-400">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                        <div className="p-3 border-b border-gray-800 bg-red-500/5">
                            <h3 className="font-bold text-white text-[11px] uppercase flex items-center gap-2"><TrendingDown className="w-3 h-3 text-red-500" /> Egresos</h3>
                        </div>
                        <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                            <table className="w-full text-left text-[10px] text-gray-400">
                                <tbody className="divide-y divide-gray-800">
                                    {expenses.map((t: any) => (
                                        <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="px-4 py-2 font-mono">{new Date(t.fecha).toLocaleDateString('es-AR')}</td>
                                            <td className="px-4 py-2 text-white truncate max-w-[120px]">{t.descripcion}</td>
                                            <td className="px-4 py-2 text-right font-black text-red-400">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}</td>
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
