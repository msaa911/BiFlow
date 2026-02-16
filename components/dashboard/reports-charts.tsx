
'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'

interface ReportsChartsProps {
    data: {
        date: string
        income: number
        expense: number
    }[]
}

export function ReportsCharts({ data }: ReportsChartsProps) {
    // Format dates for display (DD/MM)
    const formattedData = data.map(item => ({
        ...item,
        shortDate: new Date(item.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    }))

    return (
        <div className="space-y-6">
            <Card className="bg-gray-900 border-gray-800 text-white">
                <CardHeader>
                    <CardTitle>Flujo de Caja Diario</CardTitle>
                    <CardDescription className="text-gray-400">
                        Evolución de ingresos y egresos en los últimos 30 días
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={formattedData}>
                                <defs>
                                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="shortDate"
                                    stroke="#6b7280"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="#6b7280"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${value / 1000}k`}
                                />
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                    formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Area
                                    type="monotone"
                                    dataKey="income"
                                    name="Ingresos"
                                    stroke="#10b981"
                                    fillOpacity={1}
                                    fill="url(#colorIncome)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="expense"
                                    name="Egresos"
                                    stroke="#ef4444"
                                    fillOpacity={1}
                                    fill="url(#colorExpense)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-gray-900 border-gray-800 text-white">
                    <CardHeader>
                        <CardTitle>Balance Neto Diario</CardTitle>
                        <CardDescription className="text-gray-400">
                            Resultado operativo día a día
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={formattedData.map(d => ({ ...d, net: d.income - d.expense }))}>
                                    <XAxis
                                        dataKey="shortDate"
                                        stroke="#6b7280"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#6b7280"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `$${value / 1000}k`}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#1f2937' }}
                                        contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
                                    />
                                    <Bar dataKey="net" name="Balance Neto" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
