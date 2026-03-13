'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LayoutDashboard, List, Banknote, TrendingUp, TrendingDown, Clock, FileUp, Settings, ChevronDown, AlertCircle, FileText, Trash2, RotateCcw, Landmark } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CheckPortfolio } from './check-portfolio'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { SmartFormatBuilder } from './smart-format-builder'
import { UnreconciledPanel } from './unreconciled-panel'
import { TreasuryHistory } from './treasury-history'
import { BankNotesHistory } from './bank-notes-history'
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
    const [reconcilingAdmin, setReconcilingAdmin] = useState(false)
    const [reconcilingBank, setReconcilingBank] = useState(false)
    const [selectedAccountId, setSelectedAccountId] = useState<string>('all')
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(20)
    const supabase = createClient()

    const bankAccountMap = useMemo(() => {
        const map: Record<string, string> = {}
        bankAccounts.forEach(acc => {
            map[acc.id] = acc.banco_nombre
        })
        return map
    }, [bankAccounts])

    // Filter by Account
    const accountFilteredTransactions = selectedAccountId === 'all'
        ? initialTransactions
        : initialTransactions.filter(t => t.banco_cuenta_id === selectedAccountId)

    const counts = useMemo(() => ({
        all: accountFilteredTransactions.length,
        pending: accountFilteredTransactions.filter(t => t.estado === 'pendiente' || t.estado === 'parcial').length,
        reconciled: accountFilteredTransactions.filter(t => t.estado === 'conciliado').length,
        income: accountFilteredTransactions.filter(t => t.monto > 0).length,
        expense: accountFilteredTransactions.filter(m => m.monto < 0).length
    }), [accountFilteredTransactions])

    const accountFilteredPending = selectedAccountId === 'all'
        ? pendingTransactions
        : pendingTransactions.filter(t => t.cuenta_id === selectedAccountId)

    // Dashboard Calculations (Filtered by Account)
    const targetAccounts = selectedAccountId === 'all'
        ? bankAccounts
        : bankAccounts.filter(acc => acc.id === selectedAccountId)

    const initialSum = targetAccounts.reduce((acc, curr) => acc + (Number(curr.saldo_inicial) || 0), 0)
    const txsSum = accountFilteredTransactions.reduce((acc, t) => acc + (Number(t.monto) || 0), 0)
    const realBalance = initialSum + txsSum
    const latestTx = accountFilteredTransactions.length > 0 ? accountFilteredTransactions[0] : null
    const latestTxDate = latestTx ? formatDate(latestTx.fecha) : 'N/A'

    const incomes = accountFilteredTransactions.filter(t => t.monto > 0)
    const expenses = accountFilteredTransactions.filter(t => t.monto < 0)

    const filteredTx = accountFilteredTransactions.filter(t => {
        const matchesStatus = filterStatus === 'all'
            ? true
            : filterStatus === 'pending'
                ? (t.estado === 'pendiente' || t.estado === 'parcial')
                : t.estado === 'conciliado'

        const matchesType = filterType === 'all'
            ? true
            : filterType === 'income'
                ? t.monto > 0
                : t.monto < 0

        return matchesStatus && matchesType
    })

    const totalPages = Math.ceil(filteredTx.length / itemsPerPage)
    const paginatedTx = filteredTx.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

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

    const handleReconcile = async (scope: 'admin' | 'bank' = 'bank') => {
        if (scope === 'admin') setReconcilingAdmin(true)
        else setReconcilingBank(true)

        try {
            const res = await fetch('/api/reconcile/auto', {
                method: 'POST',
                body: JSON.stringify({
                    scope,
                    cuentaId: selectedAccountId !== 'all' ? selectedAccountId : undefined
                })
            })
            const data = await res.json()

            if (!res.ok) {
                toast.error(`Error: ${data.error || 'Fallo al conciliar.'}`)
                return
            }

            if (data.matched > 0) {
                const message = scope === 'admin'
                    ? `¡Éxito! Se vincularon ${data.matched} facturas con recibos/OP.`
                    : `¡Éxito! Se conciliaron ${data.matched} movimientos con el extracto bancario.`;
                toast.success(message)
                if (onRefresh) onRefresh()
            } else {
                toast.info(`Proceso finalizado. No se encontraron nuevos matches (0).`)
            }
        } catch (error) {
            console.error('Reconciliation failed:', error)
            toast.error('Error al ejecutar la acción.')
        } finally {
            if (scope === 'admin') setReconcilingAdmin(false)
            else setReconcilingBank(false)
        }
    }

    const handleUnreconcile = async (tx: any) => {
        if (!confirm('¿Seguro que desea revertir esta conciliación? Se eliminarán los recibos/notas generados y las facturas volverán a estar pendientes.')) return

        try {
            const principalMovId = tx.movimiento_id
            const allMovIds = (tx.metadata?.all_movement_ids || (principalMovId ? [principalMovId] : [])) as string[]

            // 1. Reversal of Treasury Movements (Step 2 flow)
            if (allMovIds.length > 0) {
                for (const movId of allMovIds) {
                    const { data: apps } = await supabase.from('aplicaciones_pago').select('id, comprobante_id').eq('movimiento_id', movId)
                    if (apps && apps.length > 0) {
                        for (const app of apps) {
                            if (app.comprobante_id) {
                                const { data: comp } = await supabase.from('comprobantes').select('*').eq('id', app.comprobante_id).single()
                                if (comp) {
                                    if (comp.tipo.includes('_bancaria') || ((comp.nro_factura || comp.numero) && (comp.nro_factura || comp.numero).includes('AUTO-'))) {
                                        await supabase.from('comprobantes').delete().eq('id', comp.id)
                                    } else {
                                        // Limpiar claves de metadata de wizard al revertir
                                        const { wizard_paid_at: _wpa, movimiento_id: _movId, reconciled_v2: _rv2, last_auto_reconciled: _lar, ...cleanMeta } = (comp.metadata || {})
                                        await supabase.from('comprobantes').update({
                                            estado: 'pendiente',
                                            monto_pendiente: comp.monto_total,
                                            metadata: cleanMeta
                                        }).eq('id', comp.id)
                                    }
                                }
                            }
                            await supabase.from('aplicaciones_pago').delete().eq('id', app.id)
                        }
                    }
                    await supabase.from('instrumentos_pago').delete().eq('movimiento_id', movId)
                    await supabase.from('movimientos_tesoreria').delete().eq('id', movId)
                }
            }

            // 2. Reversal of Direct Bank Notes (New Direct circuit flow)
            else if (tx.comprobante_id) {
                const { data: comp } = await supabase
                    .from('comprobantes')
                    .select('id, tipo')
                    .eq('id', tx.comprobante_id)
                    .single()

                if (comp && (comp.tipo === 'ndb_bancaria' || comp.tipo === 'ncb_bancaria')) {
                    await supabase.from('comprobantes').delete().eq('id', comp.id)
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
                        previous_state: 'conciliado',
                        reversal_method: 'unreconcile_tool'
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
            {/* Bank Account Selector */}
            <div className="flex bg-gray-900/50 border border-gray-800 p-2 rounded-2xl items-center gap-3">
                <div className="px-4 py-1 border-r border-gray-800 flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Vista de Banco</span>
                </div>
                <div className="relative flex-1 overflow-hidden">
                    <div className="flex overflow-x-auto no-scrollbar gap-2 py-1 scroll-smooth">
                        <button
                            onClick={() => setSelectedAccountId('all')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${selectedAccountId === 'all'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                                }`}
                        >
                            TODOS
                        </button>
                        {bankAccounts.map(acc => (
                            <button
                                key={acc.id}
                                onClick={() => setSelectedAccountId(acc.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${selectedAccountId === acc.id
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800 border border-transparent select-none'
                                    }`}
                            >
                                {acc.banco_nombre}
                                <span className={`text-[10px] font-bold font-mono ml-1 ${selectedAccountId === acc.id ? 'text-emerald-50' : 'text-gray-400'}`}>
                                    ({acc.cbu ? `*${acc.cbu.slice(-4)}` : (acc.moneda === 'USD' ? 'u$s' : '$')})
                                </span>
                            </button>
                        ))}
                    </div>
                    {/* Gradient Fade for overflow indication */}
                    <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-gray-900/80 to-transparent pointer-events-none" />
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                {/* Card 1: Conciliación */}
                <div className="p-6 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl flex flex-col justify-center gap-3">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-emerald-400 shrink-0" />
                            Automatización
                        </h3>
                        <p className="text-gray-400 text-[10px] mt-1">
                            Sincronización de extractos y facturación.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Button
                            onClick={() => handleReconcile('admin')}
                            disabled={reconcilingAdmin}
                            className={`
                                w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-9 rounded-lg transition-all active:scale-95 text-[11px]
                                ${reconcilingAdmin ? 'animate-pulse opacity-80' : ''}
                            `}
                        >
                            {reconcilingAdmin ? 'Procesando...' : 'Vincular Facturas'}
                        </Button>
                        <Button
                            onClick={() => handleReconcile('bank')}
                            disabled={reconcilingBank}
                            className={`
                                w-full bg-amber-600 hover:bg-amber-500 text-white font-bold h-9 rounded-lg transition-all active:scale-95 text-[11px]
                                ${reconcilingBank ? 'animate-pulse opacity-80' : ''}
                            `}
                        >
                            {reconcilingBank ? 'Procesando...' : 'Conciliación Bancaria'}
                        </Button>
                    </div>
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
                    <div className="flex flex-col gap-4">
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
                                Pendientes ({accountFilteredPending.length})
                            </TabsTrigger>
                            <TabsTrigger
                                value="audit"
                                className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 gap-2 px-6"
                            >
                                <FileText className="w-4 h-4" />
                                Notas Bancarias
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-3">
                        <div className="relative w-full md:w-auto">
                            <Button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-6 px-6 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-3 transition-all active:scale-95 text-sm"
                            >
                                <FileUp className="w-5 h-5" />
                                Carga De Extracto
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
                                            href={`/dashboard/upload?context=bank${selectedAccountId !== 'all' ? `&cuenta_id=${selectedAccountId}` : ''}`}
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
                            window.location.reload()
                        }}
                    />
                )}

                <TabsContent value="summary" className="space-y-6 animate-in fade-in duration-500">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl h-[450px] flex flex-col">
                            <div className="p-4 border-b border-gray-800 flex justify-between bg-gray-800/20">
                                <h3 className="font-bold text-white text-xs flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-blue-400" /> Movimientos Recientes
                                </h3>
                            </div>
                            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                                <table className="w-full text-left text-xs text-gray-400">
                                    <tbody className="divide-y divide-gray-800">
                                        {accountFilteredTransactions.slice(0, 20).map((t: any) => (
                                            <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                                                <td className="px-4 py-3 font-mono text-gray-500">
                                                    {formatDate(t.fecha)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col">
                                                        <span className="text-white font-medium truncate max-w-[180px]">{t.descripcion}</span>
                                                        {selectedAccountId === 'all' && t.cuenta_id && (
                                                            <span className="text-[9px] text-emerald-500/60 font-bold uppercase tracking-tighter">
                                                                {bankAccountMap[t.cuenta_id] || 'Banco Desconocido'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className={`px-4 py-3 text-right font-black ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="grid grid-rows-2 gap-6 h-[450px]">
                            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                                <div className="p-3 border-b border-gray-800 bg-emerald-500/5">
                                    <h3 className="font-bold text-white text-[11px] flex items-center gap-2">
                                        <TrendingUp className="w-3 h-3 text-emerald-500" /> Ingresos
                                    </h3>
                                </div>
                                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-500/20">
                                    <table className="w-full text-xs text-left">
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
                                    <h3 className="font-bold text-white text-[11px] flex items-center gap-2">
                                        <TrendingDown className="w-3 h-3 text-red-500" /> Egresos
                                    </h3>
                                </div>
                                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-red-500/20">
                                    <table className="w-full text-xs text-left">
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
                        <div className="p-4 border-b border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-800/20">
                            <div className="flex flex-col gap-1">
                                <h3 className="font-bold text-white text-xs flex items-center gap-2 uppercase tracking-tighter">
                                    <List className="w-4 h-4 text-emerald-400" /> Listado Completo de Movimientos
                                </h3>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800 w-fit">
                                        {[
                                            { id: 'all', label: 'TODOS', color: 'emerald', count: counts.all },
                                            { id: 'pending', label: 'PENDIENTES', color: 'amber', count: counts.pending },
                                            { id: 'reconciled', label: 'CONCILIADOS', color: 'blue', count: counts.reconciled }
                                        ].map((f) => (
                                            <button
                                                key={f.id}
                                                onClick={() => setFilterStatus(f.id as any)}
                                                className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all flex items-center gap-2 ${filterStatus === f.id
                                                    ? `bg-${f.color}-500 text-white shadow-lg shadow-${f.color}-500/20`
                                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
                                                    }`}
                                            >
                                                {f.label}
                                                <span className={`
                                                    px-1.5 py-0.5 rounded text-[9px] font-black
                                                    ${filterStatus === f.id ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-400'}
                                                `}>
                                                    {f.count}
                                                </span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800 w-fit">
                                        {[
                                            { id: 'all', label: 'TODOS', color: 'emerald', count: counts.all },
                                            { id: 'income', label: 'INGRESOS', color: 'emerald', count: counts.income },
                                            { id: 'expense', label: 'EGRESOS', color: 'red', count: counts.expense }
                                        ].map((f) => (
                                            <button
                                                key={f.id}
                                                onClick={() => setFilterType(f.id as any)}
                                                className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all flex items-center gap-2 ${filterType === f.id
                                                    ? `bg-${f.color}-500 text-white shadow-lg shadow-${f.color}-500/20`
                                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
                                                    }`}
                                            >
                                                {f.label}
                                                <span className={`
                                                    px-1.5 py-0.5 rounded text-[9px] font-black
                                                    ${filterType === f.id ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-400'}
                                                `}>
                                                    {f.count}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-[10px] bg-slate-800 text-emerald-300 border-slate-700 font-bold px-3 py-1">
                                    {filteredTx.length} registros
                                </Badge>
                            </div>
                        </div>
                        <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-emerald-500/20 hover:scrollbar-thumb-emerald-500/40 scrollbar-track-transparent">
                            <table className="w-full text-left text-xs border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-gray-800 text-[11px] font-bold text-gray-400 sticky top-0 z-10">
                                        <th className="px-6 py-4 font-black sticky top-0 z-20 bg-gray-800 text-left">
                                            <div className="flex items-center gap-1">
                                                Estado
                                                <div title="P = Pendiente | C = Conciliado" className="cursor-help text-gray-600 hover:text-emerald-400 transition-colors">
                                                    <AlertCircle className="w-3 h-3" />
                                                </div>
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 font-black sticky top-0 z-20 bg-gray-800 text-left">Fecha</th>
                                        {selectedAccountId === 'all' && (
                                            <th className="px-6 py-4 font-black sticky top-0 z-20 bg-gray-800 text-left">Banco</th>
                                        )}
                                        <th className="px-6 py-4 font-black sticky top-0 z-20 bg-gray-800 text-left">Descripción / Concepto</th>
                                        <th className="px-6 py-4 font-black sticky top-0 z-20 bg-gray-800 text-left">Referencia</th>
                                        <th className="px-6 py-4 font-black sticky top-0 z-20 bg-gray-800 text-left">Categoría</th>
                                        <th className="px-6 py-4 text-right font-black sticky top-0 z-20 bg-gray-800">Monto (ARS)</th>
                                        <th className="px-6 py-4 text-center font-black sticky top-0 z-20 bg-gray-800">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50">
                                    {paginatedTx.map((t: any) => (
                                        <tr key={t.id} className="group hover:bg-emerald-500/[0.02] transition-colors border-b border-gray-800/50">
                                            <td className="px-6 py-3">
                                                <div className="flex items-center">
                                                    <div className={`
                                                        w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black
                                                        ${t.estado === 'conciliado' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800/50 text-gray-600 border border-gray-800'}
                                                    `} title={t.estado === 'conciliado' ? 'Conciliado' : 'Pendiente'}>
                                                        {t.estado === 'conciliado' ? 'C' : 'P'}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 font-mono text-[11px] text-gray-500">{formatDate(t.fecha)}</td>
                                            {selectedAccountId === 'all' && (
                                                <td className="px-6 py-3">
                                                    <Badge variant="outline" className="text-[9px] bg-emerald-500/5 text-emerald-400 border-emerald-500/20 font-bold px-2 py-0">
                                                        {bankAccountMap[t.cuenta_id] || 'N/A'}
                                                    </Badge>
                                                </td>
                                            )}
                                            <td className="px-6 py-3">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-white group-hover:text-emerald-400 truncate max-w-[300px]">
                                                        {t.comprobantes?.entidades?.razon_social && (
                                                            <span className="text-emerald-500/80 mr-1.5 font-bold">[{t.comprobantes.entidades.razon_social}]</span>
                                                        )}
                                                        {t.descripcion}
                                                    </span>
                                                    <span className="text-[9px] text-gray-600 font-mono tracking-tighter uppercase">ID: {t.id.split('-')[0]}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 font-mono text-[10px] text-gray-400">
                                                {t.numero_cheque || t.metadata?.referencia || t.metadata?.external_ref || '-'}
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className="px-2 py-0.5 rounded text-[8px] uppercase font-bold bg-gray-800 text-gray-400 border border-gray-700 block w-fit">
                                                    {t.metadata?.categoria || t.categoria || 'OTROS'}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-3 text-right font-black text-xs ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'} whitespace-nowrap`}>
                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.monto)}
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="flex items-center justify-center">
                                                    {t.estado === 'conciliado' ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-gray-500 hover:text-amber-500 hover:bg-amber-500/10 transition-all rounded-full"
                                                            onClick={() => handleUnreconcile(t)}
                                                            title="Revertir Conciliación"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                        </Button>
                                                    ) : (
                                                        <div className="w-7 h-7" /> // Spacer to maintain alignment
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Paginación */}
                        <div className="p-4 border-t border-gray-800 bg-gray-900/40 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="text-[11px] text-gray-500 font-medium flex items-center gap-4">
                                <span>
                                    Mostrando <span className="text-gray-300">{filteredTx.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> - <span className="text-gray-300">{Math.min(currentPage * itemsPerPage, filteredTx.length)}</span> de <span className="text-gray-300">{filteredTx.length}</span> registros
                                </span>

                                <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
                                    <span className="text-gray-600">Ver:</span>
                                    {[20, 25, 50, 100, 200].map(size => (
                                        <button
                                            key={size}
                                            onClick={() => {
                                                setItemsPerPage(size)
                                                setCurrentPage(1)
                                            }}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${itemsPerPage === size ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-600 hover:text-gray-400'}`}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {totalPages > 1 && (
                                <div className="flex items-center bg-gray-950 border border-gray-800 rounded-lg p-1 gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 hover:bg-gray-800 text-gray-400"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronDown className="w-4 h-4 rotate-90" />
                                    </Button>

                                    <div className="flex items-center px-4 gap-2 border-x border-gray-800 px-6">
                                        <span className="text-xs font-bold text-emerald-500">{currentPage}</span>
                                        <span className="text-xs text-gray-600">/</span>
                                        <span className="text-xs text-gray-400 font-medium">{totalPages}</span>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 hover:bg-gray-800 text-gray-400"
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        <ChevronDown className="w-4 h-4 -rotate-90" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="portfolio" className="animate-in fade-in duration-500">
                    <CheckPortfolio orgId={orgId} accountId={selectedAccountId} />
                </TabsContent>

                <TabsContent value="reconciliation" className="animate-in fade-in duration-500">
                    <UnreconciledPanel orgId={orgId} transactions={accountFilteredPending} onRefresh={onRefresh} />
                </TabsContent>

                <TabsContent value="audit" className="animate-in fade-in duration-500">
                    <div className="space-y-6">
                        {/* Redundant title removed as BankNotesHistory provides its own header */}
                        <div className="space-y-6">
                            <BankNotesHistory 
                                orgId={orgId} 
                                accountId={selectedAccountId} 
                                bankAccounts={bankAccounts} 
                                onRefresh={onRefresh} 
                            />
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div >
    )
}
