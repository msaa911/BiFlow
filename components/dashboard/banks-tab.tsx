'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LayoutDashboard, List, Banknote, TrendingUp, TrendingDown, Clock, FileUp, Settings, ChevronDown, AlertCircle, FileText, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CheckPortfolio } from './check-portfolio'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { SmartFormatBuilder } from './smart-format-builder'
import { UnreconciledPanel } from './unreconciled-panel'
import { TreasuryHistory } from './treasury-history'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface BanksTabProps {
    orgId: string
    initialTransactions: any[]
    pendingTransactions?: any[]
    onRefresh?: () => void
}

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function BanksTab({ orgId, initialTransactions, pendingTransactions = [], onRefresh }: BanksTabProps) {
    const [activeTab, setActiveTab] = useState('summary')
    const [showFormatBuilder, setShowFormatBuilder] = useState(false)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reconciled'>('all')
    const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set())
    const [isDeletingBulk, setIsDeletingBulk] = useState(false)
    const supabase = createClient()

    const incomes = initialTransactions.filter(t => t.monto > 0)
    const expenses = initialTransactions.filter(t => t.monto < 0)

    const filteredTx = initialTransactions.filter(t => {
        if (filterStatus === 'pending') return t.estado === 'pendiente' || t.estado === 'parcial'
        if (filterStatus === 'reconciled') return t.estado === 'conciliado'
        return true
    })

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedTxIds(new Set(filteredTx.map(t => t.id)))
        } else {
            setSelectedTxIds(new Set())
        }
    }

    const handleSelect = (id: string, checked: boolean) => {
        const newSet = new Set(selectedTxIds)
        if (checked) newSet.add(id)
        else newSet.delete(id)
        setSelectedTxIds(newSet)
    }

    const handleBulkDelete = async () => {
        if (selectedTxIds.size === 0) return
        if (!confirm(`¿Seguro que desea eliminar ${selectedTxIds.size} transacciones del histórico? Esta acción es irreversible.`)) return

        setIsDeletingBulk(true)
        try {
            const idsToDelete = Array.from(selectedTxIds)
            const { error } = await supabase.from('transacciones').delete().in('id', idsToDelete)

            if (error) throw error

            toast.success(`${selectedTxIds.size} transacciones eliminadas con éxito`)
            setSelectedTxIds(new Set())
            if (onRefresh) onRefresh()
        } catch (error: any) {
            console.error('Error deleting bulk:', error)
            toast.error('Error al eliminar en lote: ' + error.message)
        } finally {
            setIsDeletingBulk(false)
        }
    }

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
                    <TabsTrigger
                        value="audit"
                        className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-2 px-6"
                    >
                        <FileText className="w-4 h-4" />
                        Notas Bancarias
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
                            <div className="border border-gray-800 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-500/20 hover:scrollbar-thumb-emerald-500/40">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-gray-800 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold uppercase text-[10px] text-gray-400 tracking-widest">Fecha</th>
                                            <th className="px-4 py-3 text-left font-bold uppercase text-[10px] text-gray-400 tracking-widest">Descripción</th>
                                            <th className="px-4 py-3 text-right font-bold uppercase text-[10px] text-gray-400 tracking-widest">Monto</th>
                                        </tr>
                                    </thead>
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
                            <div className="border border-gray-800 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-red-500/20 hover:scrollbar-thumb-red-500/40">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-gray-800 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold uppercase text-[10px] text-gray-400 tracking-widest">Fecha</th>
                                            <th className="px-4 py-3 text-left font-bold uppercase text-[10px] text-gray-400 tracking-widest">Descripción</th>
                                            <th className="px-4 py-3 text-right font-bold uppercase text-[10px] text-gray-400 tracking-widest">Monto</th>
                                        </tr>
                                    </thead>
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
                    {/* Barra de acciones y filtros movida fuera de la tabla */}
                    <div className="p-4 bg-gray-900 border-b border-gray-800 flex flex-wrap gap-2 justify-between items-center w-full">
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setFilterStatus('all')}
                                className={`text-[10px] font-bold uppercase transition-all ${filterStatus === 'all' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Todos ({initialTransactions.length})
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setFilterStatus('pending')}
                                className={`text-[10px] font-bold uppercase transition-all ${filterStatus === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Pendientes ({initialTransactions.filter(t => t.estado === 'pendiente' || t.estado === 'parcial').length})
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setFilterStatus('reconciled')}
                                className={`text-[10px] font-bold uppercase transition-all ${filterStatus === 'reconciled' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Conciliados ({initialTransactions.filter(t => t.estado === 'conciliado').length})
                            </Button>
                        </div>
                        <Button
                            variant={selectedTxIds.size > 0 ? "destructive" : "outline"}
                            size="sm"
                            className={`gap-2 h-8 text-[10px] font-bold uppercase transition-all ${selectedTxIds.size > 0 ? 'shadow-lg' : 'opacity-40 border-dashed text-gray-500 bg-transparent hover:bg-transparent hover:text-gray-500 border-gray-700'}`}
                            onClick={handleBulkDelete}
                            disabled={isDeletingBulk || selectedTxIds.size === 0}
                            title={selectedTxIds.size === 0 ? "Marca las casillas de las transacciones para activar este botón" : "Eliminar seleccionados"}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {isDeletingBulk ? 'Borrando...' : (selectedTxIds.size > 0 ? `Eliminar ${selectedTxIds.size}` : 'Seleccionados')}
                        </Button>
                    </div>

                    <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-emerald-500/20 hover:scrollbar-thumb-emerald-500/40">
                        <table className="w-full text-left text-xs text-gray-400 border-separate border-spacing-0">
                            <thead className="bg-gray-800 sticky top-0 z-20">
                                <tr className="divide-x divide-gray-800/10">
                                    <th className="py-3 w-[40px] text-center border-b border-gray-800">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-700 bg-gray-900/50 text-emerald-500 focus:ring-emerald-500/20 w-3.5 h-3.5 cursor-pointer"
                                            checked={filteredTx.length > 0 && selectedTxIds.size === filteredTx.length}
                                            onChange={handleSelectAll}
                                            title="Seleccionar todas las visibles"
                                        />
                                    </th>
                                    <th className="px-3 py-3 w-[85px] font-bold uppercase text-[9px] text-gray-400 tracking-widest border-b border-gray-800">Fecha</th>
                                    <th className="px-3 py-3 font-bold uppercase text-[9px] text-gray-400 tracking-widest border-b border-gray-800">Descripción</th>
                                    <th className="px-3 py-3 w-[100px] font-bold uppercase text-[9px] text-gray-400 tracking-widest border-b border-gray-800 text-center">Estado</th>
                                    <th className="px-3 py-3 w-[120px] font-bold uppercase text-[9px] text-gray-400 tracking-widest border-b border-gray-800">Categoría</th>
                                    <th className="px-4 py-3 w-[150px] text-right font-bold uppercase text-[9px] text-gray-400 tracking-widest border-b border-gray-800">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {filteredTx.map((t) => (
                                    <tr key={t.id} className={`hover:bg-gray-800/50 transition-all group border-b border-gray-800/30 last:border-0 ${selectedTxIds.has(t.id) ? 'bg-emerald-500/5' : ''}`}>
                                        <td className="py-3 text-center align-middle">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-700 bg-gray-900/50 text-emerald-500 focus:ring-emerald-500/20 w-3.5 h-3.5 cursor-pointer"
                                                checked={selectedTxIds.has(t.id)}
                                                onChange={(e) => handleSelect(t.id, e.target.checked)}
                                            />
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-gray-400 font-mono text-[9px]">
                                            {formatDate(t.fecha)}
                                        </td>
                                        <td className="px-3 py-3 text-white font-medium truncate max-w-[0] w-auto">
                                            {t.descripcion}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            {t.estado === 'conciliado' ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px] font-bold uppercase px-1 h-4">
                                                    Conciliado
                                                </Badge>
                                            ) : t.estado === 'parcial' ? (
                                                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[8px] font-bold uppercase px-1 h-4">
                                                    Parcial
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[8px] font-bold uppercase px-1 h-4">
                                                    Pendiente
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className="px-2 py-0.5 rounded text-[8px] uppercase font-bold bg-gray-800 text-gray-400 border border-gray-700 block w-fit truncate max-w-full">
                                                {(t.metadata && typeof t.metadata === 'object' && 'categoria' in t.metadata) ? (t.metadata as any).categoria : (t.categoria || 'OTROS')}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-3 text-right font-black tabular-nums transition-colors text-xs ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'} whitespace-nowrap`}>
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
                <UnreconciledPanel orgId={orgId} transactions={pendingTransactions} onRefresh={onRefresh} />
            </TabsContent>

            <TabsContent value="audit" className="animate-in fade-in duration-500">
                <div className="space-y-6">
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-emerald-500/20 rounded-lg">
                                <FileText className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Notas Bancarias (NDB/NCB)</h3>
                                <p className="text-xs text-gray-400">Consulta y exporta los movimientos generados directamente desde el extracto (Impuestos, Comisiones, Intereses).</p>
                            </div>
                        </div>
                    </div>
                    {/* Reuse TreasuryHistory with filter for NDB/NCB */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                        <TreasuryHistory orgId={orgId} claseDocumentoFilter={['NDB', 'NCB']} />
                    </div>
                </div>
            </TabsContent>
        </Tabs>
    )
}
