'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { DailyBalance } from '@/lib/treasury-engine'

interface CashFlowChartProps {
    data: DailyBalance[]
    liquidityBuffer?: number
}

export function CashFlowChart({ data, liquidityBuffer = 0 }: CashFlowChartProps) {
    const formattedData = data.map(item => ({
        ...item,
        displayDate: new Date(item.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    }))

    return (
        <Card className="bg-gray-950 border-gray-800 shadow-2xl">
            <CardHeader className="pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center justify-between">
                    <span>Proyección de Liquidez (30 días)</span>
                    {liquidityBuffer > 0 && (
                        <span className="text-[10px] text-red-500/80 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                            Colchón: ${liquidityBuffer.toLocaleString('es-AR')}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorAlert" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="displayDate"
                                stroke="#374151"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#374151"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                            />
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#030712', border: '1px solid #1f2937', borderRadius: '12px', fontSize: '12px' }}
                                itemStyle={{ fontWeight: 'bold' }}
                                formatter={(value: any, name: string, props: any) => {
                                    const isAlert = props.payload.isAlert;
                                    return [
                                        <span style={{ color: isAlert ? '#f87171' : '#10b981' }}>
                                            ${Number(value).toLocaleString('es-AR')}
                                        </span>,
                                        'Saldo Proyectado'
                                    ]
                                }}
                            />
                            {liquidityBuffer > 0 && (
                                <ReferenceLine
                                    y={liquidityBuffer}
                                    stroke="#ef4444"
                                    strokeDasharray="5 5"
                                    strokeOpacity={0.5}
                                    label={{
                                        position: 'right',
                                        value: 'Buffer',
                                        fill: '#ef4444',
                                        fontSize: 10,
                                        fontWeight: 'bold'
                                    }}
                                />
                            )}
                            <ReferenceLine y={0} stroke="#374151" />
                            <Area
                                type="monotone"
                                dataKey="balance"
                                stroke="#10b981"
                                fillOpacity={1}
                                fill="url(#colorBalance)"
                                strokeWidth={3}
                                animationDuration={1500}
                                dot={(props: any) => {
                                    if (props.payload.isAlert) {
                                        return (
                                            <circle
                                                cx={props.cx}
                                                cy={props.cy}
                                                r={3}
                                                fill="#ef4444"
                                                stroke="#ef4444"
                                                strokeWidth={2}
                                            />
                                        )
                                    }
                                    return <></>;
                                }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
