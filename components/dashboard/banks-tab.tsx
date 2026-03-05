'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LayoutDashboard, List, Banknote, TrendingUp, TrendingDown, Clock, FileUp, Settings, ChevronDown, AlertCircle, FileText, Trash2, RotateCcw } from 'lucide-react'
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
    isReconciling?: boolean
    bankAccounts?: any[]
}

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function BanksTab({ orgId, initialTransactions, pendingTransactions = [], bankAccounts = [], onRefresh }: BanksTabProps) {
    const [activeTab, setActiveTab] = useState('summary')
    const [showFormatBuilder, setShowFormatBuilder] = useState(false)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reconciled'>('all')
    const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set())
    const [isDeletingBulk, setIsDeletingBulk] = useState(false)
    const [reconciling, setReconciling] = useState(false)
    const supabase = createClient()

    // Dashboard Calculations
    const initialSum = bankAccounts.reduce((acc, curr) => acc + (Number(curr.saldo_inicial) || 0), 0)
    const txsSum = initialTransactions.reduce((acc, t) => acc + (Number(t.monto) || 0), 0)
    const realBalance = initialSum + txsSum
    const latestTx = initialTransactions.length > 0 ? initialTransactions[0] : null
    const latestTxDate = latestTx ? formatDate(latestTx.fecha) : 'N/A'

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

    const handleReconcile = async () => {
        setReconciling(true)
        try {
            const res = await fetch('/api/reconcile/auto', {
                method: 'POST',
                body: JSON.stringify({ scope: 'bank' })
            })
            const data = await res.json()

            if (!res.ok) {
                toast.error(`Error: ${data.error || 'Fallo al conciliar.'}`)
                return
            }

            if (data.matched > 0) {
                toast.success(`¡Éxito! Se conciliaron ${data.matched} movimientos con el extracto bancario.`)
                if (onRefresh) onRefresh()
            } else {
                toast.info(`Proceso bancario finalizado. No se encontraron nuevos matches (0).`)
            }
        } catch (error) {
            console.error('Reconciliation failed:', error)
            toast.error('Error al ejecutar la conciliación.')
        } finally {
            setReconciling(false)
        }
    }

    const handleUnreconcile = async (tx: any) => {
        if (!confirm('¿Seguro que desea revertir esta conciliación? Se eliminarán los recibos/notas generados y las facturas volverán a estar pendientes.')) return

        try {
            const principalMovId = tx.movimiento_id
            const allMovIds = (tx.metadata?.all_movement_ids || (principalMovId ? [principalMovId] : [])) as string[]

            if (allMovIds.length > 0) {
                for (const movId of allMovIds) {
                    // 1. Get Applications to find Invoices
                    const { data: apps } = await supabase.from('aplicaciones_pago').select('id, comprobante_id').eq('movimiento_id', movId)

                    if (apps && apps.length > 0) {
                        for (const app of apps) {
                            // 2. Reset Invoices
                            if (app.comprobante_id) {
                                const { data: comp } = await supabase.from('comprobantes').select('*').eq('id', app.comprobante_id).single()
                                if (comp) {
                                    // If it's a bank note or auto-generated, delete it
                                    if (comp.tipo.includes('_bancaria') || (comp.numero && comp.numero.includes('AUTO-'))) {
                                        await supabase.from('comprobantes').delete().eq('id', comp.id)
                                    } else {
                                        // Otherwise just reset state and balance
                                        await supabase.from('comprobantes').update({
                                            estado: 'pendiente',
                                            monto_pendiente: comp.monto_total
                                        }).eq('id', comp.id)
                                    }
                                }
                            }
                            // 3. Delete Application
                            await supabase.from('aplicaciones_pago').delete().eq('id', app.id)
                        }
                    }

                    // 4. Delete Instruments
                    await supabase.from('instrumentos_pago').delete().eq('movimiento_id', movId)

                    // 5. Delete Movement
                    await supabase.from('movimientos_tesoreria').delete().eq('id', movId)
                }
            }

            // 6. Reset Bank Transaction
            const { error: txErr } = await supabase
                .from('transacciones')
                .update({
                    movimiento_id: null,
                    comprobante_id: null,
                    estado: 'pendiente',
                    monto_usado: 0,
                    metadata: {
                        ...(tx.metadata || {}),
                        reverted_at: new Date().toISOString(),
                        previous_state: 'conciliado'
                    }
                })
                .eq('id', tx.id)

            if (txErr) throw txErr

            toast.success('Conciliación revertida exitosamente')
            if (onRefresh) onRefresh()
        } catch (error: any) {
            console.error('Error undoing reconciliation:', error)
            toast.error('Error al revertir: ' + error.message)
        }
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                {/* Card 1: Conciliación */}
                <div className="p-6 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl flex flex-col justify-center gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-amber-400 shrink-0" />
                            Conciliación Bancaria
                        </h3>
                        <p className="text-gray-400 text-xs mt-1">
                            Cruce de extractos vs Movimientos de Tesorería
                        </p>
                    </div>
                    <Button
                        onClick={handleReconcile}
                        disabled={reconciling}
                        className={`
                            w-full 
                            bg-amber-600 hover:bg-amber-500 
                            text-white font-bold py-2 px-4 rounded-lg
                            shadow-md shadow-amber-900/20 
                            flex items-center justify-center gap-2 transition-all active:scale-95
                            ${reconciling ? 'animate-pulse cursor-wait opacity-80' : ''}
                        `}
                    >
                        {reconciling ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                PROCESANDO...
                            </>
                        ) : (
                            <>
                                <TrendingUp className="w-4 h-4" />
                                CONCILIACIÓN BANCARIA
                            </>
                        )}
                    </Button>
                </div>

                {/* Card 2: Saldo Inicial */}
                <div className="p-6 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                        <Clock className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Saldo Inicial Consol.</p>
                        <h3 className="text-2xl font-bold text-white">
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(initialSum)}
                        </h3>
                        <p className="text-[10px] text-gray-500 mt-0.5">Suma de configuraciones</p>
                    </div>
                </div>

                {/* Card 3: Saldo Actual */}
                <div className="p-6 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl">
                        <TrendingUp className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Saldo Real en Banco</p>
                        <h3 className="text-2xl font-bold text-white">
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(realBalance)}
                        </h3>
                        <p className="text-[10px] text-emerald-500/70 font-medium mt-0.5 uppercase tracking-wide">
                            Última tx: {latestTxDate}
                        </p>
                    </div>
                </div>
            </div>

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

                    <div className="flex flex-col md:flex-row items-center gap-3">
                        <div className="relative w-full md:w-auto">
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

                <TabsContent value="transactions" className="space-y-6 animate-in fade-in duration-500">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/20">
                            <h3 className="font-bold text-white text-xs flex items-center gap-2 uppercase tracking-tighter">
                                <List className="w-4 h-4 text-emerald-400" /> Listado Completo de Movimientos
                            </h3>
                            <div className="flex gap-2">
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                    {initialTransactions.length} registros
                                </Badge>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-800/50 text-[10px] uppercase font-black text-gray-500 tracking-widest border-b border-gray-800">
                                        <th className="pl-4 pr-1 py-4 font-black">Estado</th>
                                        <th className="px-1 py-4 font-black">Fecha</th>
                                        <th className="px-1 py-4 font-black">Descripción / Concepto</th>
                                        <th className="px-1 py-4 font-black">Referencia</th>
                                        <th className="px-1 py-4 font-black">Categoría</th>
                                        <th className="pr-4 pl-1 py-4 text-right font-black">Monto (ARS)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50">
                                    {initialTransactions.map((t: any) => (
                                        <tr key={t.id} className="group hover:bg-emerald-500/[0.02] transition-colors">
                                            <td className="pl-4 pr-1 py-2.5">
                                                <span className={`
                                                    inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter
                                                    ${t.estado === 'conciliado' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}
                                                `}>
                                                    {t.estado}
                                                </span>
                                            </td>
                                            <td className="px-1 py-2.5 font-mono text-[11px] text-gray-500 tracking-tighter">
                                                {formatDate(t.fecha)}
                                            </td>
                                            <td className="px-1 py-2.5">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-white transition-colors group-hover:text-emerald-400 truncate max-w-[300px]">
                                                        {t.descripcion}
                                                    </span>
                                                    <span className="text-[9px] text-gray-600 font-mono tracking-tighter uppercase">ID: {t.id.split('-')[0]}</span>
                                                </div>
                                            </td>
                                            <td className="px-1 py-2.5 font-mono text-[10px] text-gray-400">
                                                {t.metadata?.referencia || t.metadata?.external_ref || '-'}
                                            </td>
                                            <td className="px-1 py-2.5">
                                                <span className="px-2 py-0.5 rounded text-[8px] uppercase font-bold bg-gray-800 text-gray-400 border border-gray-700 block w-fit truncate max-w-full">
                                                    {(t.metadata && typeof t.metadata === 'object' && 'categoria' in t.metadata) ? (t.metadata as any).categoria : (t.categoria || 'OTROS')}
                                                </span>
                                            </td>
                                            <td className={`pr-4 pl-1 py-2.5 text-right font-black tabular-nums transition-colors text-xs ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'} whitespace-nowrap flex items-center justify-end gap-3`}>
                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}
                                                {t.estado === 'conciliado' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-gray-500 hover:text-amber-500 hover:bg-amber-500/10"
                                                        onClick={() => handleUnreconcile(t)}
                                                        title="Revertir Conciliación (Desarmar)"
                                                    >
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
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
        </div>
    )
}
