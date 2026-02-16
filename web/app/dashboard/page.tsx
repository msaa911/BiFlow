
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Activity } from 'lucide-react'

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
        .limit(10)

    if (error) {
        console.error('Error fetching transactions:', error)
    }

    // Calculate Metrics (Simple sum for demo)
    // In a real app, use a database aggregation or a separate metrics table/view
    const { data: allTransactions } = await supabase
        .from('transacciones')
        .select('monto')

    const totalBalance = allTransactions?.reduce((acc, curr) => acc + curr.monto, 0) || 0

    // Fetch Leaks Count
    const { count: leaksFound } = await supabase
        .from('hallazgos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'detectado')

    const leaksCount = leaksFound ?? 0

    const potentialRecovery = 0 // Still dummy for now, or sum 'monto_estimado_recupero' if available

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel de Control</h1>
                <p className="text-gray-500 dark:text-gray-400">
                    Visión general de tu estado financiero auditado.
                </p>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card
                    title="Saldo Operativo (Est.)"
                    value={formatCurrency(totalBalance)}
                    description="Basado en transacciones importadas"
                    icon={<Activity className="text-emerald-500" />}
                    trend="neutral"
                />
                <Card
                    title="Fugas Detectadas"
                    value={leaksCount.toString()}
                    description="Anomalías pendientes de revisión"
                    icon={<AlertTriangle className="text-amber-500" />}
                    trend="bad"
                />
                <Card
                    title="Potencial Recupero"
                    value={formatCurrency(potentialRecovery)}
                    description="Retenciones y cobros indebidos"
                    icon={<ArrowUpRight className="text-emerald-500" />}
                    trend="good"
                />
            </div>

            {/* Transactions Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Últimos Movimientos</h2>
                    <button className="text-sm text-emerald-600 hover:text-emerald-500 font-medium">
                        Ver todos
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase font-medium text-gray-500 dark:text-gray-400">
                            <tr>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Descripción</th>
                                <th className="px-6 py-4">Entidad</th>
                                <th className="px-6 py-4 text-right">Monto</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {transactions?.map((t) => (
                                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {new Date(t.fecha).toLocaleDateString('es-AR')}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                        {t.descripcion}
                                    </td>
                                    <td className="px-6 py-4">
                                        {t.cuit_destino || '-'}
                                    </td>
                                    <td className={`px-6 py-4 text-right font-medium ${t.monto < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {formatCurrency(t.monto)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500">
                                            {t.estado}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {transactions?.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                        No hay transacciones registradas.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function Card({ title, value, description, icon, trend }: any) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    {icon}
                </div>
                {/* Badge placeholder if needed */}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</h3>
                <p className="text-xs text-gray-400 mt-2">{description}</p>
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
