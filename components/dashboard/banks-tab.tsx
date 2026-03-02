'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LayoutDashboard, List, Banknote, TrendingUp, TrendingDown, Clock, FileUp, Settings, ChevronDown, AlertCircle } from 'lucide-react'
import { CheckPortfolio } from './check-portfolio'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { SmartFormatBuilder } from './smart-format-builder'
import { UnreconciledPanel } from './unreconciled-panel'

interface BanksTabProps {
    orgId: string
    initialTransactions: any[]
    pendingTransactions?: any[]
    onRefresh?: () => void
}

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export function BanksTab({ orgId, initialTransactions, pendingTransactions = [], onRefresh }: BanksTabProps) {
    const [activeTab, setActiveTab] = useState('summary')
    const [showFormatBuilder, setShowFormatBuilder] = useState(false)
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    const incomes = initialTransactions.filter(t => t.monto > 0)
    const expenses = initialTransactions.filter(t => t.monto < 0)

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <TabsList className="bg-gray-900 border border-gray-800 p-1 h-12 gap-1 w-full md:w-auto">
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
                    <TabsTrigger
                        value="reconciliation"
                        className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-400 gap-2 px-6"
                    >
                        <AlertCircle className="w-4 h-4" />
                        Pendientes de Conciliación
                    </TabsTrigger>
                </TabsList>

                <div className="relative">
                    <Button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-6 px-6 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-3 transition-all active:scale-95"
                    >
                        <FileUp className="w-5 h-5" />
                        CARGA DE EXTRACTO
                        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`} />
                    </Button>

                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                            <div className="absolute right-0 mt-3 w-64 bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl z-50 py-3 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="px-4 py-2 mb-1">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">Opciones de Entrada</p>
                                </div>
                                <Link
                                    href="/dashboard/upload?context=bank"
                                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-900 hover:text-emerald-400 transition-all group"
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                        <FileUp className="w-4 h-4" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold">Carga Tradicional</span>
                                        <span className="text-[10px] text-gray-500">Detección Inteligente v4.0</span>
                                    </div>
                                </Link>

                                <div className="h-px bg-gray-900 my-2 mx-3" />

                                <button
                                    onClick={() => {
                                        setShowFormatBuilder(true)
                                        setIsMenuOpen(false)
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-900 hover:text-blue-400 transition-all group"
                                >
                                    <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-all">
                                        <Settings className="w-4 h-4" />
                                    </div>
                                    <div className="flex flex-col text-left">
                                        <span className="font-bold">Formato Manual</span>
                                        <span className="text-[10px] text-gray-500">Para extractos no reconocidos</span>
                                    </div>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showFormatBuilder && (
                <SmartFormatBuilder
                    onClose={() => setShowFormatBuilder(false)}
                    onFormatSaved={() => {
                        setShowFormatBuilder(false)
                        window.location.reload() // Refresh to show new data
                    }}
                />
            )}

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
                                            {formatDate(t.fecha)}
                                        </td>
                                        <td className="px-6 py-4 text-white font-medium max-w-[300px] truncate">
                                            {t.descripcion}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-gray-800 text-gray-400 border border-gray-700">
                                                {(t.metadata && typeof t.metadata === 'object' && 'categoria' in t.metadata) ? (t.metadata as any).categoria : 'OTROS'}
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

            <TabsContent value="reconciliation" className="animate-in fade-in duration-500">
                <UnreconciledPanel transactions={pendingTransactions} onRefresh={onRefresh} />
            </TabsContent>
        </Tabs>
    )
}
