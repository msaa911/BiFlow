'use client'

import { Card } from '@/components/ui/card'
import { MonthlyCashFlowData } from '@/lib/treasury-engine'
import { TrendingUp, Info } from 'lucide-react'

interface MonthlyCashFlowProps {
    data: MonthlyCashFlowData
}

export function MonthlyCashFlow({ data }: MonthlyCashFlowProps) {
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0
        }).format(value)
    }

    const getMonthLabel = (monthStr: string) => {
        const [year, month] = monthStr.split('-')
        const date = new Date(parseInt(year), parseInt(month) - 1, 1)
        return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).toUpperCase()
    }

    return (
        <Card className="bg-gray-900 border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-800 bg-gray-800/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                        Flujo de Caja Mensual (Proyectado 12 Meses)
                    </h3>
                    <div title="Los saldos futuros incluyen estimación de IVA a pagar el día 20 del mes siguiente y cheques diferidos según fecha de disponibilidad.">
                        <Info className="w-3.5 h-3.5 text-gray-600 hover:text-gray-400 cursor-help" />
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                    <thead>
                        <tr className="bg-gray-950/50">
                            <th className="sticky left-0 z-20 bg-gray-950 p-4 border-r border-gray-800 min-w-[200px] text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                                Concepto / Mes
                            </th>
                            {data.months.map((month, i) => (
                                <th key={month} className="p-4 border-r border-gray-800 text-center min-w-[100px] text-[10px] font-black text-gray-400">
                                    {getMonthLabel(month)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {data.rows.map((row, idx) => {
                            const isResumen = row.category === 'resumen'
                            const isTotal = row.isTotal
                            const isHeader = isResumen && !isTotal && idx < 5

                            return (
                                <tr
                                    key={row.label}
                                    className={`
                                        group transition-colors
                                        ${isResumen ? 'bg-gray-900/40' : 'hover:bg-gray-800/30'}
                                        ${isTotal ? 'bg-gray-800/20 font-bold' : ''}
                                    `}
                                >
                                    <td className={`
                                        sticky left-0 z-10 p-4 border-r border-gray-800 truncate text-[11px]
                                        ${isResumen ? 'bg-gray-900 font-bold text-white' : 'bg-gray-950 text-gray-400'}
                                        ${isTotal ? 'text-emerald-400' : ''}
                                        ${row.label.includes('IVA') ? 'italic text-amber-500/80' : ''}
                                    `}>
                                        <div className="flex items-center gap-2">
                                            {isTotal && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                                            {row.label}
                                        </div>
                                    </td>
                                    {row.values.map((val, i) => {
                                        const isNegative = val < 0
                                        const isPositive = val > 0
                                        const isFlowNet = row.label.includes('Flujo de caja neto')
                                        const isBalanceFinal = row.label.includes('Saldo Final')

                                        return (
                                            <td
                                                key={i}
                                                className={`
                                                    p-4 text-right border-r border-gray-800 font-mono text-[10px]
                                                    ${isNegative ? 'text-red-400' : isPositive ? 'text-emerald-400' : 'text-gray-700'}
                                                    ${isBalanceFinal && val < 0 ? 'bg-red-500/10 text-red-500 animate-pulse' : ''}
                                                    ${isTotal ? 'text-[11px] font-black' : ''}
                                                `}
                                            >
                                                {formatCurrency(val)}
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    height: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #0d1117;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1f2937;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #374151;
                }
            `}</style>
        </Card>
    )
}
