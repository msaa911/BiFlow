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

    const formatDateLabel = (label: string) => {
        if (label.length === 7) { // Monthly YYYY-MM
            const [year, month] = label.split('-')
            const date = new Date(parseInt(year), parseInt(month) - 1, 1)
            return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).toUpperCase()
        } else if (label.length === 10) { // Daily YYYY-MM-DD
            const [year, month, day] = label.split('-')
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
            return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).toUpperCase()
        }
        return label
    }
    const finalBalanceRow = data.rows.find(r => r.label === 'Saldo Final (=)')
    const netFlowRow = data.rows.find(r => r.label === 'Flujo de caja neto (=)')

    const finalBalance = finalBalanceRow ? finalBalanceRow.values[finalBalanceRow.values.length - 1] : 0
    const netFlowTotal = netFlowRow ? netFlowRow.values.reduce((acc, v) => acc + v, 0) : 0
    const avgNetFlow = netFlowRow ? netFlowTotal / netFlowRow.values.length : 0

    const lastLabel = formatDateLabel(data.months[data.months.length - 1])
    const firstLabel = formatDateLabel(data.months[0])

    return (
        <div className="space-y-6">
            {/* Forecast Summary Header */}
            <div className="flex flex-col md:flex-row gap-6 animate-in fade-in slide-in-from-top-2 duration-700">
                <div className="flex-1 bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
                    <h3 className="text-xl font-black text-white mb-6 flex items-center gap-3">
                        Pronóstico de Flujo de Caja
                        <span className="text-xs font-bold text-gray-500 bg-gray-950 px-2 py-1 rounded border border-gray-800">
                            ({firstLabel} - {lastLabel})
                        </span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Saldo Final Total ({lastLabel})</p>
                            <div className="flex items-end gap-2">
                                <span className={`text-3xl font-black ${finalBalance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {formatCurrency(finalBalance)}
                                </span>
                                <TrendingUp className={`w-5 h-5 mb-1.5 ${finalBalance < 0 ? 'text-red-500 rotate-180' : 'text-emerald-500'}`} />
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Flujo Neto Promedio ({data.months.length === 12 ? 'Mensual' : 'Diario'})</p>
                            <span className="text-2xl font-black text-white">
                                {formatCurrency(avgNetFlow)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="md:w-1/3 bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col">
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Flujo Neto {data.months.length === 12 ? 'Mensual' : 'Diario'}</h4>
                    <div className="flex-1 flex items-end gap-1 px-1 h-24">
                        {netFlowRow?.values.map((v, i) => {
                            const maxVal = Math.max(...netFlowRow.values.map(val => Math.abs(val)), 1)
                            const height = Math.max((Math.abs(v) / maxVal) * 100, 4)
                            return (
                                <div
                                    key={i}
                                    title={`${formatDateLabel(data.months[i])}: ${formatCurrency(v)}`}
                                    className={`flex-1 rounded-t-sm transition-all duration-500 hover:opacity-80 cursor-help ${v >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`}
                                    style={{ height: `${height}%` }}
                                />
                            )
                        })}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-800/50 flex justify-between items-center">
                        <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tighter">Histórico Proyectado</span>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-500/60"></div>
                                <span className="text-[8px] text-gray-500 font-bold">POS</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-red-500/60"></div>
                                <span className="text-[8px] text-gray-500 font-bold">NEG</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Card className="bg-gray-900 border-gray-800 overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            Spreadsheet: Flujo de Caja Detallado
                        </h3>
                        <div title="Los saldos futuros incluyen estimación de IVA a pagar el día 20 del mes siguiente (solo en vista mensual) y cheques diferidos según fecha de disponibilidad.">
                            <Info className="w-3.5 h-3.5 text-gray-600 hover:text-gray-400 cursor-help" />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1200px]">
                        <thead>
                            <tr className="border-b border-gray-800">
                                <th className="sticky left-0 z-20 bg-gray-900 px-4 py-3 min-w-[200px] border-r border-gray-800/50 shadow-[4px_0_8px_rgba(0,0,0,0.3)]">
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Concepto / Partida</span>
                                </th>
                                {data.months.map((label, i) => (
                                    <th key={i} className="px-4 py-3 text-center min-w-[100px] bg-gray-900/30">
                                        <span className="text-[10px] font-black text-white whitespace-nowrap">
                                            {formatDateLabel(label)}
                                        </span>
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
        </div>
    )
}
