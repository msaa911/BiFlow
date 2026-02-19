'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { DailyBalance } from '@/lib/treasury-engine'

interface CashFlowChartProps {
    data: DailyBalance[]
}

export function CashFlowChart({ data }: CashFlowChartProps) {
    const formattedData = data.map(item => ({
        ...item,
        displayDate: new Date(item.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    }))

    return (
        <Card className="bg-gray-950 border-gray-800">
            <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-400">
                    Proyección de Liquidez (30 días)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={formattedData}>
                            <defs>
                                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="displayDate"
                                stroke="#4b5563"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#4b5563"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                            />
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#030712', border: '1px solid #1f2937', borderRadius: '8px' }}
                                itemStyle={{ color: '#10b981' }}
                                formatter={(value: any) => [`$${Number(value).toLocaleString('es-AR')}`, 'Saldo Electrónico']}
                            />
                            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                            <Area
                                type="monotone"
                                dataKey="balance"
                                stroke="#10b981"
                                fillOpacity={1}
                                fill="url(#colorBalance)"
                                strokeWidth={2}
                                animationDuration={1000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
