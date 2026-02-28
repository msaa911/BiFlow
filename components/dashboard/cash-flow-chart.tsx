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
                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                                    <stop offset="80%" stopColor="#10b981" stopOpacity={0.1} />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                                </linearGradient>
                                <linearGradient id="colorAlert" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                                    <stop offset="80%" stopColor="#ef4444" stopOpacity={0.1} />
                                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="displayDate"
                                stroke="#4b5563"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                                tick={{ fill: '#6b7280' }}
                            />
                            <YAxis
                                stroke="#4b5563"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                tick={{ fill: '#6b7280' }}
                            />
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} opacity={0.4} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(3, 7, 18, 0.9)',
                                    border: '1px solid #374151',
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    backdropFilter: 'blur(8px)',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                                }}
                                itemStyle={{ fontWeight: 'bold' }}
                                cursor={{ stroke: '#374151', strokeWidth: 1 }}
                                formatter={(value: any, name: string, props: any) => {
                                    const isAlert = props.payload.isAlert;
                                    return [
                                        <span key="val" style={{ color: isAlert ? '#f87171' : '#10b981' }}>
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
                                    strokeOpacity={0.3}
                                    label={{
                                        position: 'insideBottomRight',
                                        value: 'Buffer Mínimo',
                                        fill: '#ef4444',
                                        fontSize: 9,
                                        fontWeight: 'bold',
                                        opacity: 0.6
                                    }}
                                />
                            )}
                            <ReferenceLine y={0} stroke="#374151" strokeOpacity={0.5} />
                            <Area
                                type="monotone"
                                dataKey="balance"
                                stroke="#10b981"
                                fill="#10b981"
                                fillOpacity={0.15}
                                strokeWidth={4}
                                strokeLinecap="round"
                                baseValue={-10000000} // Forzar relleno hacia abajo
                                isAnimationActive={false} // Desactivar animación para depuración de visibilidad
                                dot={(props: any) => {
                                    if (props.payload.isAlert) {
                                        return (
                                            <circle
                                                key={`alert-${props.index}`}
                                                cx={props.cx}
                                                cy={props.cy}
                                                r={4}
                                                fill="#ef4444"
                                                stroke="#030712"
                                                strokeWidth={2}
                                            />
                                        )
                                    }
                                    return <></>;
                                }}
                                activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
