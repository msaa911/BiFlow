
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ReportsCharts } from '@/components/dashboard/reports-charts'
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Fetch transactions for the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: transactions } = await supabase
        .from('transacciones')
        .select('*')
        .gte('fecha', thirtyDaysAgo.toISOString())
        .order('fecha', { ascending: true })

    // Process data for charts
    // Group by date for the line chart
    const dailyData: Record<string, { date: string, income: number, expense: number }> = {}

    // Initialize last 30 days with 0
    for (let i = 0; i < 30; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        dailyData[dateStr] = { date: dateStr, income: 0, expense: 0 }
    }

    let totalIncome = 0
    let totalExpense = 0

    transactions?.forEach(t => {
        const dateStr = t.fecha.split('T')[0]
        if (dailyData[dateStr]) {
            if (t.monto > 0) {
                dailyData[dateStr].income += t.monto
                totalIncome += t.monto
            } else {
                dailyData[dateStr].expense += Math.abs(t.monto)
                totalExpense += Math.abs(t.monto)
            }
        }
    })

    const chartData = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date))

    // Calculate savings rate
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0
    const netBalance = totalIncome - totalExpense

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Reportes Financieros</h2>
                <p className="text-gray-400">Análisis detallado de tus movimientos en los últimos 30 días.</p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-gray-900 border-gray-800 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-400">Ingresos Totales</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-400">{formatCurrency(totalIncome)}</div>
                        <p className="text-xs text-gray-500 font-mono mt-1">+12% vs mes anterior</p>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900 border-gray-800 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-400">Egresos Totales</CardTitle>
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-400">{formatCurrency(totalExpense)}</div>
                        <p className="text-xs text-gray-500 font-mono mt-1">-5% vs mes anterior</p>
                    </CardContent>
                </Card>
                <Card className="bg-gray-900 border-gray-800 text-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-400">Resultado Neto</CardTitle>
                        <TrendingUp className={`h-4 w-4 ${netBalance >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${netBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
                            {formatCurrency(netBalance)}
                        </div>
                        <p className="text-xs text-gray-500 font-mono mt-1">
                            {savingsRate.toFixed(1)}% margen de ahorro
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Component (Client Side) */}
            <div className="grid gap-6 md:grid-cols-1">
                <ReportsCharts data={chartData} />
            </div>
        </div>
    )
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
    }).format(amount)
}
