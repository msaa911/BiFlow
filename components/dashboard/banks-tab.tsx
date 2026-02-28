'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LayoutDashboard, List, Banknote, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { CheckPortfolio } from './check-portfolio'

interface BanksTabProps {
    orgId: string
    initialTransactions: any[]
}

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export function BanksTab({ orgId, initialTransactions }: BanksTabProps) {
    const [activeTab, setActiveTab] = useState('summary')

    const incomes = initialTransactions.filter(t => t.monto > 0)
    const expenses = initialTransactions.filter(t => t.monto < 0)

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-gray-900 border border-gray-800 p-1 h-12 gap-1">
                <TabsTrigger
                    value="summary"
                    className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-2 px-6"
                >
                    <LayoutDashboard className="w-4 h-4" />
                    Resumen
                </TabsTrigger>
                <TabsTrigger
                    value="transactions"
                    className="data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 gap-2 px-6"
                >
                    <List className="w-4 h-4" />
                    Transacciones
                </TabsTrigger>
                <TabsTrigger
                    value="portfolio"
                    className="data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-400 gap-2 px-6"
                >
                    <Banknote className="w-4 h-4" />
                    Cartera
                </TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-6 animate-in fade-in duration-500">
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Recent Transactions Table (from Dashboard) */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl h-[450px] flex flex-col">
                        <div className="p-4 border-b border-gray-800 flex justify-between bg-gray-800/20">
                            <h3 className="font-bold text-white text-xs flex items-center gap-2">
                                <Clock className="w-4 h-4 text-blue-400" /> Movimientos Recientes
                            </h3>
                        </div>
                        <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                            <table className="w-full text-left text-xs text-gray-400">
                                <tbody className="divide-y divide-gray-800">
                                    {initialTransactions.slice(0, 20).map((t: any) => (
                                        <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="px-4 py-3 font-mono text-gray-500">
                                                {formatDate(t.fecha)}
                                            </td>
                                            <td className="px-4 py-3 text-white font-medium truncate max-w-[180px]">{t.descripcion}</td>
                                            <td className={`px-4 py-3 text-right font-black ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Incomes & Expenses Split (from Dashboard) */}
                    <div className="grid grid-rows-2 gap-6 h-[450px]">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                            <div className="p-3 border-b border-gray-800 bg-emerald-500/5">
                                <h3 className="font-bold text-white text-[11px] uppercase flex items-center gap-2">
                                    <TrendingUp className="w-3 h-3 text-emerald-500" /> Ingresos
                                </h3>
                            </div>
                            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                                <table className="w-full text-left text-[10px] text-gray-400">
                                    <tbody className="divide-y divide-gray-800">
                                        {incomes.slice(0, 15).map((t: any) => (
                                            <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                                <td className="px-4 py-2 font-mono">{formatDate(t.fecha)}</td>
                                                <td className="px-4 py-2 text-white truncate max-w-[150px]">{t.descripcion}</td>
                                                <td className="px-4 py-2 text-right font-black text-emerald-400">
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                            <div className="p-3 border-b border-gray-800 bg-red-500/5">
                                <h3 className="font-bold text-white text-[11px] uppercase flex items-center gap-2">
                                    <TrendingDown className="w-3 h-3 text-red-500" /> Egresos
                                </h3>
                            </div>
                            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                                <table className="w-full text-left text-[10px] text-gray-400">
                                    <tbody className="divide-y divide-gray-800">
                                        {expenses.slice(0, 15).map((t: any) => (
                                            <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                                <td className="px-4 py-2 font-mono">{formatDate(t.fecha)}</td>
                                                <td className="px-4 py-2 text-white truncate max-w-[150px]">{t.descripcion}</td>
                                                <td className="px-4 py-2 text-right font-black text-red-400">
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="transactions" className="animate-in fade-in duration-500">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-800/50 text-xs uppercase font-medium text-gray-500">
                                <tr>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Descripción</th>
                                    <th className="px-6 py-4">Categoría</th>
                                    <th className="px-6 py-4 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {initialTransactions.map((t) => (
                                    <tr key={t.id} className="hover:bg-gray-800/50 transition-all group">
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                                            {new Date(t.fecha).toLocaleDateString('es-AR')}
                                        </td>
                                        <td className="px-6 py-4 text-white font-medium max-w-[300px] truncate">
                                            {t.descripcion}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-gray-800 text-gray-400 border border-gray-700">
                                                {t.metadata?.categoria || 'OTROS'}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold tabular-nums ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="portfolio" className="animate-in fade-in duration-500">
                <CheckPortfolio orgId={orgId} />
            </TabsContent>
        </Tabs>
    )
}
