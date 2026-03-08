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
import { PortfolioEngine } from '@/lib/portfolio-engine'
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

    // 1. Fetch Bank Accounts for Initial Balance
    const { data: bankAccounts } = await supabase.from('cuentas_bancarias').select('saldo_inicial').eq('organization_id', orgId)
    const initialBalancesSum = bankAccounts?.reduce((acc: number, curr: any) => acc + (Number(curr.saldo_inicial) || 0), 0) || 0

    // 2. Fetch Transactions for Balance & Metrics
    const { data: allTransactions } = await supabase
        .from('transacciones')
        .select('id, monto, metadata, fecha, descripcion, created_at')
        .eq('organization_id', orgId)
        .order('fecha', { ascending: false })

    // Calculate Total Balance (Consolidated)
    const transactionsSum = allTransactions?.reduce((acc: number, curr: any) => acc + curr.monto, 0) || 0
    const totalBalance = initialBalancesSum + transactionsSum

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

    // 3. Fetch Checks for Portfolio Projection
    const { data: checks } = await supabase
        .from('instrumentos_pago')
        .select('*')
        .eq('metodo', 'cheque_terceros')
        .in('estado', ['pendiente', 'depositado', 'rechazado'])

    // 4. Process Projection Data
    const invoicesForProjection = (pendingInvoices || []).map(i => ({
        id: i.id,
        tipo: i.tipo,
        razon_social_entidad: i.razon_social_socio,
        cuit_socio: i.cuit_socio,
        fecha_emision: i.fecha_emision,
        fecha_vencimiento: i.fecha_vencimiento,
        monto_total: i.monto_total,
        monto_pendiente: i.monto_pendiente,
        estado: i.estado
    }))

    // Base projection from Liquidity Engine
    const baseProjection = TreasuryEngine.projectDailyBalance(totalBalance, invoicesForProjection as any, [], liquidityCushion, 30)

    // Enrich with Checks Projection from Portfolio Engine
    const projectionDataWithChecks = PortfolioEngine.projectWithChecks(baseProjection, checks || [])

    // Calculate Monthly Data for the "Cherry on Top" view
    const monthlyData = TreasuryEngine.getMonthlyCashFlow(
        totalBalance,
        invoicesForProjection as any,
        allTransactions || [],
        [] // No projects on main dashboard yet
    )

    // 5. Fetch Other Widgets Data
    const { data: taxItems } = await supabase.from('transacciones').select('*').eq('organization_id', orgId).contains('tags', ['impuesto_recuperable']).order('fecha', { ascending: false })
    const totalRecoverable = taxItems?.reduce((acc: number, curr: any) => acc + curr.monto, 0) || 0
    const { data: anomalies } = await supabase.from('transacciones').select('*').eq('organization_id', orgId).or('tags.cs.{"alerta_precio"},tags.cs.{"posible_duplicado"},tags.cs.{"riesgo_bec"}').order('fecha', { ascending: false })
    const { data: findings } = await supabase.from('hallazgos').select('*, transacciones(*), comprobantes(*)').eq('organization_id', orgId).eq('estado', 'detectado')

    // Unified Anomaly Count (Transactions with tags + Findings not linked to those transactions)
    const anomalyCount = (anomalies?.length || 0) + (findings?.filter(f => !f.transaccion_id).length || 0)

    const { count: quarantineCount } = await supabase.from('transacciones_revision').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('estado', 'pendiente')
    const { count: pendingTaxesCount } = await supabase.from('tax_intelligence_rules').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('estado', 'PENDIENTE')

    const opportunityCost = LiquidityEngine.calculateOpportunityCost(totalBalance, 30, tnaEfectiva, liquidityCushion)

    // 5. Calculate Multidimensional Health Score
    const healthScore = LiquidityEngine.calculateHealthScore(
        totalBalance,
        monthlyExpenses,
        overdraftLimit,
        findings || [],
        totalRecoverable,
        opportunityCost
    )

    // 6. Fetch / Save Score History
    const { data: scoreHistory } = await supabase
        .from('score_historial')
        .select('score, fecha')
        .eq('organization_id', orgId)
        .order('fecha', { ascending: true })
        .limit(30)

    const daysOfRunway = dailyBurn > 100 ? Math.min(365, Math.floor((totalBalance + overdraftLimit) / dailyBurn)) : 'stable'

    // Triple View Data
    const incomes = allTransactions?.filter(t => t.monto > 0).slice(0, 20) || []
    const expenses = allTransactions?.filter(t => t.monto < 0).slice(0, 20) || []
    const bankTransactions = allTransactions?.slice(0, 20) || []

    // 7. Portfolio KPIs for Alertas
    const portfolioKPIs = PortfolioEngine.calculateKPIs(checks || [])

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <Suspense fallback={null}><ScrollToFocus /></Suspense>
                    <h2 className="text-2xl font-bold tracking-tight">Panel de Control</h2>
                    <p className="text-gray-400">Todo el poder de la inteligencia financiera en tu mano.</p>
                </div>
            </div>

            {/* Check Portfolio Alerts */}
            {portfolioKPIs.toExpireSoon > 0 && (
                <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-6 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500/20 rounded-full"><TrendingUp className="w-6 h-6 text-amber-400" /></div>
                        <div>
                            <h3 className="text-lg font-bold text-white uppercase tracking-tight">Vencimientos Inminentes: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(portfolioKPIs.toExpireSoon)}</h3>
                            <p className="text-sm text-gray-400">Hay cheques en cartera que vencen en los próximos 7 días e impactarán en tu liquidez.</p>
                        </div>
                    </div>
                    <a href="/dashboard/banks?tab=reconciliation" className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-amber-500/20 whitespace-nowrap">Gestionar valores</a>
                </div>
            )}

            {quarantineCount && quarantineCount > 0 ? (
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-500/20 rounded-full"><AlertTriangle className="w-6 h-6 text-purple-400" /></div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Tienes {quarantineCount} movimientos pendientes de conciliación</h3>
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
                projectionData={projectionDataWithChecks}
                monthlyData={monthlyData}
                scoreHistory={scoreHistory || []}
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <TaxRecoveryWidget totalRecoverable={totalRecoverable} taxItems={taxItems || []} />
                <ExpenseGuardWidget
                    anomalies={[
                        ...(anomalies?.filter(a => a.tags?.includes('alerta_precio')) || []),
                        ...(findings?.filter(f => f.tipo === 'monto_inusual' && f.comprobante_id).map(f => ({
                            id: f.id,
                            descripcion: `Factura ${f.comprobantes?.numero} - ${f.comprobantes?.razon_social_socio}`, // Rebranded in UI via component logic
                            monto: f.comprobantes?.monto_total,
                            fecha: f.comprobantes?.fecha_emision,
                            is_invoice: true
                        })) || [])
                    ]}
                />
                <DuplicateGuardWidget duplicates={anomalies?.filter(a => a.tags?.includes('posible_duplicado')) || []} />
                <FeeAuditWidget />
            </div>
        </div>
    )
}
