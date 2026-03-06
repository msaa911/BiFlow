'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Search, ExternalLink, Tag, FileDown, Loader2, X, PlusCircle, Check, FileText, DollarSign, Pencil, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface Transaction {
    id: string
    organization_id?: string
    fecha: string
    descripcion: string
    referencia?: string
    monto: number
    estado: string
    cuit_origen?: string
    cuit_destino?: string
    monto_usado?: number
    concepto?: string
    movimiento_id?: string
    comprobante_id?: string
    metadata?: any
}

interface UnreconciledPanelProps {
    orgId: string
    transactions: Transaction[]
    onRefresh?: () => void
}

export function UnreconciledPanel({ orgId, transactions, onRefresh }: UnreconciledPanelProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [isCategorizing, setIsCategorizing] = useState(false)
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [categorizedTxIds, setCategorizedTxIds] = useState<string[]>([])
    const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set())
    const [isDeletingBulk, setIsDeletingBulk] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const supabase = createClient()

    const categories = [
        "Gastos Bancarios",
        "Impuestos y Tasas",
        "Intereses Pagados",
        "Intereses Ganados",
        "Comisiones Bancarias",
        "Servicios Públicos",
        "Retiro Particular",
        "Sueldos y Jornales",
        "Mantenimiento",
        "Honorarios Profesionales",
        "Otros Gastos Operativos",
        "Otros"
    ]

    const [isConciliating, setIsConciliating] = useState(false)
    const [globalAiSuggestions, setGlobalAiSuggestions] = useState<any[]>([])
    const [suggestedMovements, setSuggestedMovements] = useState<any[]>([])
    const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([])
    const [loadingInvoices, setLoadingInvoices] = useState(false)

    // Residuals and mixed payments
    const [processResidualAsGasto, setProcessResidualAsGasto] = useState(false)
    const [residualCategory, setResidualCategory] = useState('Gastos Bancarios')

    // Mixed Payment States
    const [secondaryPaymentEnabled, setSecondaryPaymentEnabled] = useState(false)
    const [secondaryPaymentMethod, setSecondaryPaymentMethod] = useState<'efectivo' | 'cheque' | 'retencion'>('efectivo')
    const [secondaryCheckData, setSecondaryCheckData] = useState({ numero: '', banco: '', vencimiento: '' })

    // Split States
    const [isSplitting, setIsSplitting] = useState(false)
    const [splitConcept, setSplitConcept] = useState('IVA Crédito Fiscal')
    const [splitAmount, setSplitAmount] = useState('0')
    const [splitType, setSplitType] = useState<'activo' | 'gasto'>('activo')

    const fetchGlobalSuggestions = async () => {
        try {
            const res = await fetch('/api/reconcile/suggestions')
            if (res.ok) {
                const data = await res.json()
                setGlobalAiSuggestions(data.suggestions || [])
            }
        } catch (error) {
            console.warn('Error fetching global suggestions:', error)
        }
    }

    useEffect(() => {
        fetchGlobalSuggestions()
    }, [])

    const fetchInvoicesAndSuggestions = async (txToMatch: Transaction) => {
        setLoadingInvoices(true)
        try {
            const orgId = (transactions[0] as any)?.organization_id
            const txAmount = Math.abs(txToMatch.monto)


            // 2. Fetch Treasury Movements (Recibos/OPs) already created but unlinked to any transaction
            const { data: linkedTxData } = await supabase.from('transacciones').select('movimiento_id').not('movimiento_id', 'is', null)
            const linkedMovIds = linkedTxData?.map(t => t.movimiento_id).filter(Boolean) || []

            const { data: instruments, error: insError } = await supabase
                .from('instrumentos_pago')
                .select('*, movimientos_tesoreria(*, entidades(razon_social), aplicaciones_pago(comprobantes(nro_factura, tipo)))')
                .eq('organization_id', orgId)
                // Filter by type: match bank inflow (cobro) or outflow (pago)
                .filter('movimientos_tesoreria.tipo', 'eq', txToMatch.monto > 0 ? 'cobro' : 'pago')

            if (!insError && instruments) {
                // Filter out those already linked
                const unlinkedMovs = instruments.filter(ins => !linkedMovIds.includes(ins.movimiento_id))

                // De-duplicate: A movement can have multiple instruments
                const uniqueMovs = new Map()
                unlinkedMovs.forEach(ins => {
                    if (ins.movimientos_tesoreria && !uniqueMovs.has(ins.movimiento_id)) {
                        uniqueMovs.set(ins.movimiento_id, {
                            id: ins.movimiento_id,
                            fecha: ins.movimientos_tesoreria.fecha,
                            monto: ins.monto,
                            observaciones: ins.movimientos_tesoreria.observaciones,
                            nro_comprobante: ins.movimientos_tesoreria.nro_comprobante,
                            entidad: ins.movimientos_tesoreria.entidad_id,
                            razonSocial: ins.movimientos_tesoreria.entidades?.razon_social,
                            tipo: ins.movimientos_tesoreria.tipo,
                            aplicaciones: ins.movimientos_tesoreria.aplicaciones_pago || []
                        })
                    }
                })

                setSuggestedMovements(Array.from(uniqueMovs.values()))
            } else {
                setSuggestedMovements([])
            }
        } catch (error) {
            console.error('Error fetching suggested movements:', error)
            toast.error('Error al cargar movimientos de tesorería')
        } finally {
            setLoadingInvoices(false)
        }
    }

    const handleConciliate = async () => {
        if (!selectedTx || selectedMovementIds.length === 0) return
        setIsSubmitting(true)
        try {
            const orgId = (transactions[0] as any)?.organization_id
            const totalBankAmount = Math.abs(selectedTx.monto)

            // 1. Update Bank Transaction
            const { error: txLinkErr } = await supabase
                .from('transacciones')
                .update({
                    movimiento_id: selectedMovementIds[0],
                    estado: 'conciliado',
                    monto_usado: totalBankAmount,
                    metadata: {
                        ...(selectedTx.metadata || {}),
                        linked_at: new Date().toISOString(),
                        link_method: 'batch_match',
                        all_movement_ids: selectedMovementIds,
                        original_bank_monto: selectedTx.monto
                    }
                })
                .eq('id', selectedTx.id)

            if (txLinkErr) throw txLinkErr

            // 2. Mark instruments as accredited
            await supabase
                .from('instrumentos_pago')
                .update({ estado: 'acreditado' })
                .in('movimiento_id', selectedMovementIds)

            // 3. Propagate conciliation state
            const { data: apps } = await supabase
                .from('aplicaciones_pago')
                .select('comprobante_id')
                .in('movimiento_id', selectedMovementIds)

            if (apps && apps.length > 0) {
                const invoiceIds = apps.map(a => a.comprobante_id)
                await supabase
                    .from('comprobantes')
                    .update({ estado: 'conciliado' })
                    .in('id', invoiceIds)
            }

            toast.success(`${selectedMovementIds.length} movimientos vinculados y conciliados exitosamente.`)
            setIsConciliating(false)
            setSelectedMovementIds([])
            if (onRefresh) onRefresh()
        } catch (error: any) {
            console.error('Error in conciliation:', error)
            toast.error('Error al realizar la conciliación: ' + error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const filtered = transactions
        .filter(t => (t.estado === 'pendiente' || t.estado === 'parcial') && !categorizedTxIds.includes(t.id))
        .filter(t =>
            t.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.monto.toString().includes(searchTerm)
        )

    const handleExport = () => {
        const dataToExport = filtered.map(t => ({
            Fecha: new Date(t.fecha).toLocaleDateString('es-AR'),
            Descripción: t.descripcion,
            Monto: t.monto,
            Estado: 'Pendiente',
            'CUIT Origen': t.cuit_origen || 'No Identificado',
            'CUIT Destino': t.cuit_destino || 'No Identificado'
        }))

        const ws = XLSX.utils.json_to_sheet(dataToExport)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Pendientes")
        XLSX.writeFile(wb, `BiFlow_Pendientes_Conciliacion_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    const handleQuickCategorize = async (category: string) => {
        if (!selectedTx) return

        setIsSubmitting(true)
        try {
            const currentOrgId = selectedTx.organization_id || orgId

            // 1. Ensure "Gastos Varios / Banco" entity exists
            let { data: entity } = await supabase
                .from('entidades')
                .select('id, cuit, razon_social')
                .eq('organization_id', currentOrgId)
                .eq('razon_social', 'Gastos Varios / Otros')
                .maybeSingle()

            if (!entity) {
                const { data: newEntity, error: entError } = await supabase
                    .from('entidades')
                    .insert({
                        organization_id: currentOrgId,
                        razon_social: 'Gastos Varios / Otros',
                        cuit: '00000000000',
                        categoria: 'proveedor'
                    })
                    .select()
                    .single()

                if (entError) throw entError
                if (!newEntity) throw new Error("No se pudo crear la entidad de Gastos Varios")
                entity = newEntity
            }

            if (!entity) throw new Error("Entidad de cobro/pago no disponible")

            // 2. Determine Clase de Documento (NDB/NCB) and Voucher Type
            const isIngreso = selectedTx.monto > 0
            const claseDoc = isIngreso ? 'NCB' : 'NDB'
            const voucherType = isIngreso ? 'ncb_bancaria' : 'ndb_bancaria'

            // 3. Prepare Metadata
            const totalMonto = Math.abs(selectedTx.monto)
            const parsedSplitAmount = parseFloat(splitAmount) || 0

            const metadata: any = {
                transaccion_id: selectedTx.id,
                categoria_principal: category,
                original_desc: selectedTx.descripcion,
                bank_desc: selectedTx.descripcion
            }

            if (isSplitting && parsedSplitAmount > 0) {
                metadata.desglose = [
                    {
                        concepto: category,
                        monto: totalMonto - parsedSplitAmount,
                        tipo: category.includes('Impuestos') || category.includes('Intereses') ? 'activo' : 'gasto'
                    },
                    {
                        concepto: splitConcept,
                        monto: parsedSplitAmount,
                        tipo: splitType
                    }
                ]
            }

            // 4. Create Comprobante (Voucher)
            const bankNoteNumber = `BN-${selectedTx.id.split('-')[0].toUpperCase()}-${new Date().getTime().toString().slice(-4)}`

            const { data: voucher, error: vError } = await supabase
                .from('comprobantes')
                .insert({
                    organization_id: currentOrgId,
                    entidad_id: entity.id,
                    tipo: voucherType,
                    nro_factura: selectedTx.referencia || bankNoteNumber,
                    cuit_socio: entity.cuit,
                    razon_social_socio: entity.razon_social,
                    fecha_emision: selectedTx.fecha,
                    fecha_vencimiento: selectedTx.fecha,
                    monto_total: totalMonto,
                    monto_pendiente: 0,
                    estado: 'conciliado',
                    condicion: 'contado',
                    concepto: category,
                    moneda: 'ARS',
                    metadata: {
                        ...metadata,
                        is_direct_bank_note: true,
                        bank_transaction_id: selectedTx.id,
                        categoria_principal: category
                    }
                })
                .select()
                .single()

            if (vError) throw vError
            if (!voucher) throw new Error("No se pudo generar el comprobante bancario")

            // 5. Update Bank Transaction
            const { data: txData, error: txError } = await supabase
                .from('transacciones')
                .update({
                    categoria: category,
                    comprobante_id: voucher.id,
                    movimiento_id: null,
                    estado: 'conciliado',
                    metadata: {
                        ...(selectedTx.metadata || {}),
                        reconciled_at: new Date().toISOString(),
                        link_method: 'direct_note',
                        generated_voucher_id: voucher.id,
                        category: category,
                        original_desc: selectedTx.descripcion
                    }
                })
                .eq('id', selectedTx.id)
                .select()
                .maybeSingle()

            if (txError) {
                console.error("Error linking transaction:", txError)
            }

            if (!txData) {
                console.warn("No transaction was updated in first attempt. Attempting second update.")
                await supabase.from('transacciones')
                    .update({
                        comprobante_id: voucher.id,
                        estado: 'conciliado',
                        categoria: category
                    })
                    .eq('id', selectedTx.id)
            }

            // Update UI
            setCategorizedTxIds(prev => [...prev, selectedTx.id])
            selectedTx.estado = 'conciliado'
            selectedTx.comprobante_id = voucher.id
            selectedTx.concepto = category

            toast.success(`${claseDoc} generada y registrada con éxito`)
            setIsCategorizing(false)
            setIsSplitting(false)
            setSelectedCategory(null)
            setSplitAmount('0')
            setSelectedTx(null)
            if (onRefresh) onRefresh()
        } catch (error: any) {
            console.error('Error in banking accounting:', error)
            toast.error('Error al generar nota: ' + (error.message || 'Desconocido'))
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedTxIds(new Set(filtered.map(t => t.id)))
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
        if (!confirm(`¿Seguro que desea eliminar ${selectedTxIds.size} transacciones bancarias? Esta acción borrará permanentemente los registros del sistema.`)) return

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
        <Card className="bg-gray-900 border-gray-800 animate-in fade-in duration-500">
            <CardHeader className="flex flex-row items-center justify-between border-b border-gray-800 px-6 py-4">
                <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        AUDITORÍA DE BANCOS <span className="text-[10px] bg-red-500 text-white px-1 rounded animate-pulse ml-2">v3.2 ACTIVE</span>
                    </CardTitle>
                    <p className="text-xs text-gray-400 mt-1">Movimientos bancarios pendientes de vinculación con comprobantes.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant={selectedTxIds.size > 0 ? "destructive" : "outline"}
                        size="sm"
                        className={`gap-2 duration-200 ${selectedTxIds.size > 0 ? 'shadow-lg animate-in zoom-in-95' : 'opacity-40 border-dashed text-gray-500 bg-transparent hover:bg-transparent hover:text-gray-500 border-gray-700'}`}
                        onClick={handleBulkDelete}
                        disabled={isDeletingBulk || selectedTxIds.size === 0}
                        title={selectedTxIds.size === 0 ? "Marca las casillas de las transacciones para activar este botón" : "Eliminar seleccionados"}
                    >
                        <Trash2 className="w-4 h-4" />
                        {isDeletingBulk ? 'Borrando...' : (selectedTxIds.size > 0 ? `Eliminar ${selectedTxIds.size}` : 'Selecciona para eliminar')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        className="border-gray-700 text-gray-300 hover:bg-gray-800 flex items-center gap-2"
                    >
                        <FileDown className="w-4 h-4" />
                        Exportar Excel
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center px-1">
                        <input
                            type="checkbox"
                            className="rounded border-gray-700 bg-gray-900/50 text-emerald-500 focus:ring-emerald-500/20 w-4 h-4 cursor-pointer"
                            checked={filtered.length > 0 && selectedTxIds.size === filtered.length}
                            onChange={handleSelectAll}
                            title="Seleccionar todas las visibles"
                        />
                    </div>
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar por descripción o monto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                        />
                    </div>
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {filtered.length > 0 ? (
                        filtered.map(tx => (
                            <div key={tx.id} className={`group flex items-center justify-between p-4 bg-gray-950 border rounded-xl transition-all ${tx.estado === 'conciliado' ? 'border-emerald-500/10 opacity-60 grayscale-[0.8] bg-gray-950/50' : 'border-gray-800 hover:border-gray-700 shadow-sm'} ${selectedTxIds.has(tx.id) ? 'bg-emerald-500/5 border-l-2 border-emerald-500' : ''}`}>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-700 bg-gray-900/50 text-emerald-500 focus:ring-emerald-500/20 w-4 h-4 cursor-pointer"
                                        checked={selectedTxIds.has(tx.id)}
                                        onChange={(e) => handleSelect(tx.id, e.target.checked)}
                                    />
                                    <div className={`p-2 rounded-lg ${tx.monto < 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                        {tx.monto < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-bold text-white truncate max-w-[320px]">{tx.descripcion}</p>
                                            {globalAiSuggestions.some(s => s.transId === tx.id) && (
                                                <Badge variant="outline" className="text-[9px] font-black h-4 bg-amber-500/10 text-amber-500 border-amber-500/20 px-1.5 leading-none animate-pulse">
                                                    ✨ IA MATCH
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-gray-500">{new Date(tx.fecha).toLocaleDateString('es-AR')}</span>
                                            <span className="text-[10px] text-gray-500">•</span>
                                            <span className="text-[10px] text-gray-500 uppercase">{tx.cuit_origen || 'CUIT no Identificado'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className={`text-sm font-black ${tx.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(tx.monto)}
                                        </p>
                                        {tx.estado === 'conciliado' ? (
                                            <Badge className="text-[10px] font-bold uppercase bg-emerald-500/20 !text-emerald-400 border-none px-2 mt-1">
                                                Conciliado
                                            </Badge>
                                        ) : tx.estado === 'parcial' ? (
                                            <Badge variant="outline" className="text-[10px] font-bold uppercase border-blue-500/50 !text-blue-400 bg-blue-500/10 px-2 mt-1 backdrop-blur-sm">
                                                Parcial ({new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Math.abs(tx.monto) - (tx.monto_usado || 0))} req.)
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px] font-bold uppercase border-amber-500/50 !text-amber-400 bg-amber-500/10 px-2 mt-1 backdrop-blur-sm">
                                                Pendiente
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="flex gap-2 min-w-[200px] justify-end">
                                        {(tx.estado === 'pendiente' || tx.estado === 'parcial') && (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 px-3 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 flex items-center gap-2 bg-emerald-500/5 group/btn"
                                                    onClick={() => {
                                                        setSelectedTx(tx)
                                                        setIsConciliating(true)
                                                        fetchInvoicesAndSuggestions(tx)
                                                    }}
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                                    <span className="text-[10px] font-bold uppercase">Conciliar</span>
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 px-3 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500 flex items-center gap-2 bg-blue-500/5"
                                                    onClick={() => {
                                                        setSelectedTx(tx)
                                                        setIsCategorizing(true)
                                                    }}
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                    <span className="text-[10px] font-bold uppercase">Nota Bancaria</span>
                                                </Button>
                                            </>
                                        )}
                                        {tx.estado === 'conciliado' && (
                                            <div className="h-9 flex items-center text-emerald-500/50">
                                                <CheckCircle2 className="w-4 h-4" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-12 text-center text-gray-600 border border-dashed border-gray-800 rounded-xl">
                            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                            No se encontraron transacciones en esta vista.
                        </div>
                    )}
                </div>
            </CardContent>

            {/* Categorization Dialog */}
            <Dialog open={isCategorizing} onOpenChange={(open) => {
                setIsCategorizing(open)
                if (!open) {
                    setIsSplitting(false)
                    setSelectedCategory(null)
                }
            }}>
                <DialogContent className="max-w-md bg-gray-950 border-gray-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-400" />
                            {selectedTx?.monto && selectedTx.monto > 0 ? 'Nota de Crédito Bancaria (NCB)' : 'Nota de Débito Bancaria (NDB)'}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 text-xs text-balance">
                            {selectedTx?.monto && selectedTx.monto > 0
                                ? 'Genera el comprobante de ingreso bancario y su cobro automáticamente.'
                                : 'Genera el comprobante de egreso bancario y su pago automáticamente.'}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedTx && (
                        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 my-2">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Monto del Banco</p>
                                    <p className="text-sm font-bold text-white mb-1 leading-tight">{selectedTx.descripcion}</p>
                                </div>
                                <p className={`text-base font-black tabular-nums ${selectedTx.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(selectedTx.monto)}
                                </p>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsSplitting(!isSplitting)}
                                className={`w-full justify-start text-[10px] h-7 font-bold uppercase tracking-wider ${isSplitting ? 'text-amber-400 bg-amber-400/10' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <PlusCircle className="w-3 h-3 mr-2" />
                                {isSplitting ? 'Cancelar Desglose' : 'Realizar Desglose (Split)'}
                            </Button>
                        </div>
                    )}

                    {isSplitting && (
                        <div className="space-y-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl animate-in zoom-in-95 duration-200">
                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Configuración de Desglose</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase">Concepto Secundario</label>
                                    <select
                                        value={splitConcept}
                                        onChange={(e) => setSplitConcept(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    >
                                        <option value="IVA Crédito Fiscal">IVA Crédito Fiscal</option>
                                        <option value="Anticipo Ganancias">Anticipo Ganancias</option>
                                        <option value="Percepción SIRCREB">Percepción SIRCREB</option>
                                        <option value="Retención IIBB">Retención IIBB</option>
                                        <option value="Gastos Administrativos">Gastos Administrativos</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase">Monto Secundario</label>
                                    <input
                                        type="number"
                                        value={splitAmount}
                                        onChange={(e) => setSplitAmount(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={splitType === 'activo'}
                                        onChange={() => setSplitType('activo')}
                                        className="w-3 h-3 accent-emerald-500"
                                    />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">A favor (Activo)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={splitType === 'gasto'}
                                        onChange={() => setSplitType('gasto')}
                                        className="w-3 h-3 accent-red-500"
                                    />
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">Gasto (Pérdida)</span>
                                </label>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 py-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1 mb-1">
                            {isSplitting ? 'Selecciona Concepto Principal' : 'Selecciona Concepto'}
                        </p>
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                disabled={isSubmitting}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left group disabled:opacity-50
                                    ${selectedCategory === cat
                                        ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                                        : 'border-gray-800 bg-gray-900/40 hover:border-blue-500/50 hover:bg-blue-500/5'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedCategory === cat ? 'bg-blue-500 border-blue-500' : 'border-gray-700 bg-gray-950 group-hover:border-blue-500'}`}>
                                        {selectedCategory === cat && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                                    </div>
                                    <span className={`text-sm font-medium ${selectedCategory === cat ? 'text-white' : 'text-gray-300'} group-hover:text-blue-400`}>
                                        {cat}
                                    </span>
                                </div>
                                <CheckCircle2 className={`w-4 h-4 text-blue-500 transition-opacity ${selectedCategory === cat ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
                            </button>
                        ))}
                    </div>

                    <DialogFooter className="flex justify-between items-center w-full mt-4">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsCategorizing(false)
                                setSelectedCategory(null)
                            }}
                            className="text-gray-400 hover:text-white"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => selectedCategory && handleQuickCategorize(selectedCategory)}
                            disabled={isSubmitting || !selectedCategory}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold min-w-[140px]"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                            )}
                            Confirmar Nota
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Conciliation Dialog */}
            <Dialog open={isConciliating} onOpenChange={setIsConciliating}>
                <DialogContent className="max-w-2xl bg-gray-950 border-gray-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Conciliación Bancaria</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Busca el Recibo u Orden de Pago que respalda este movimiento bancario.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedTx && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 my-2 flex justify-between items-center shadow-inner">
                            <div>
                                <p className="text-[10px] text-emerald-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1">
                                    <Tag className="w-3 h-3" /> Movimiento Bancario {selectedTx.estado === 'parcial' && ' (Saldo Remanente)'}
                                </p>
                                <p className="text-sm font-bold text-white leading-tight">{selectedTx.descripcion}</p>
                            </div>
                            <div className="text-right">
                                <p className={`text-lg font-black ${selectedTx.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Math.abs(selectedTx.monto) - (selectedTx.monto_usado || 0))}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="py-2 min-h-[100px] flex flex-col justify-center">
                        {loadingInvoices ? (
                            <div className="flex flex-col items-center justify-center py-8 text-emerald-500/50 italic animate-pulse">
                                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                <p className="text-xs font-bold uppercase tracking-widest">Buscando documentos de Tesorería...</p>
                            </div>
                        ) : suggestedMovements.length > 0 ? (
                            <div className="mb-6 animate-in slide-in-from-top-4 duration-500">
                                <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Movimientos Ya Registrados (Recibos/OP)
                                </p>
                                <div className="space-y-2">
                                    {suggestedMovements.map(mov => {
                                        const isSelected = selectedMovementIds.includes(mov.id)
                                        return (
                                            <button
                                                key={mov.id}
                                                onClick={() => {
                                                    const newSelected = isSelected
                                                        ? selectedMovementIds.filter(id => id !== mov.id)
                                                        : [...selectedMovementIds, mov.id]
                                                    setSelectedMovementIds(newSelected)
                                                }}
                                                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left group
                                                    ${isSelected ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                                                        : 'border-emerald-500/30 bg-gray-900/40 hover:border-emerald-500 hover:bg-emerald-500/5'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`flex items-center justify-center w-5 h-5 rounded-md border ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-emerald-500/50 bg-gray-900 group-hover:border-emerald-500'}`}>
                                                        {isSelected && <Check className="w-3.5 h-3.5 text-black" />}
                                                    </div>
                                                    <div>
                                                        <p className={`text-sm font-bold transition-colors ${isSelected ? 'text-white' : 'text-emerald-400 group-hover:text-emerald-300'}`}>
                                                            {mov.tipo?.toUpperCase()} N° {mov.nro_comprobante || 'S/N'} {mov.razonSocial ? ` - ${mov.razonSocial}` : ''}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500">
                                                            Referencia: {mov.observaciones || 'Sin observaciones'} • Fecha: {new Date(mov.fecha).toLocaleDateString()}
                                                        </p>
                                                        {mov.aplicaciones && mov.aplicaciones.length > 0 && (
                                                            <p className="text-[10px] text-emerald-600 font-bold mt-1">
                                                                Aplica a: {mov.aplicaciones.map((a: any) => a.comprobantes?.numero).filter(Boolean).join(', ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-sm font-black ${isSelected ? 'text-emerald-400' : 'text-white'}`}>
                                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(mov.monto)}
                                                    </p>
                                                    <span className={`text-[9px] font-black px-1.5 rounded uppercase mt-1 inline-block border ${isSelected ? 'bg-emerald-500 text-black border-emerald-500' : 'text-emerald-500/70 bg-emerald-500/5 border-emerald-500/20'}`}>
                                                        {isSelected ? 'Seleccionado' : 'Vincular Directo'}
                                                    </span>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="py-8 text-center text-gray-600 border border-dashed border-gray-800 rounded-xl">
                                <p className="text-xs font-medium italic">No se encontraron movimientos pendientes para este importe o entidad.</p>
                            </div>
                        )}
                    </div>

                    {/* Summary and Residual Assistant */}
                    {selectedTx && (
                        <div className="mt-4 p-4 bg-gray-900/60 border border-gray-800 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {(() => {
                                const noSelection = selectedMovementIds.length === 0

                                const selectedTotal = suggestedMovements
                                    .filter(m => selectedMovementIds.includes(m.id))
                                    .reduce((acc, curr) => acc + Number(curr.monto), 0)

                                const totalBankAmount = Math.abs(selectedTx.monto)
                                const previouslyUsed = Number(selectedTx.monto_usado || 0)
                                const availableAmount = totalBankAmount - previouslyUsed

                                const difference = availableAmount - selectedTotal
                                const shortfall = selectedTotal - availableAmount
                                const isGastoCase = difference > 0.05
                                const isMixedCase = shortfall > 0.05

                                if (noSelection) {
                                    return (
                                        <div className="flex items-center justify-between py-1">
                                            <div className="flex items-center gap-3 text-gray-400">
                                                <AlertCircle className="w-5 h-5 text-blue-500" />
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-white">Asistente de Conciliación listo</p>
                                                    <p className="text-[10px] text-gray-500 italic">Elija comprobantes para habilitar el cierre.</p>
                                                </div>
                                            </div>
                                            <div className="text-right border-l border-gray-800 pl-4">
                                                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">A Conciliar</p>
                                                <p className="text-sm font-black text-white">
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(availableAmount)}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                }

                                return (
                                    <>
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="space-y-1">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Resumen de Selección</p>
                                                <div className="flex items-center gap-4">
                                                    <div>
                                                        <p className="text-[10px] text-gray-400">Banco</p>
                                                        <p className="text-sm font-bold text-white">
                                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(availableAmount)}
                                                        </p>
                                                    </div>
                                                    <div className="text-gray-700">-</div>
                                                    <div>
                                                        <p className="text-[10px] text-gray-400">Seleccionado</p>
                                                        <p className={`text-sm font-bold ${isMixedCase ? 'text-amber-400' : 'text-blue-400'}`}>
                                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(selectedTotal)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {Math.abs(difference) > 0.05 && (
                                                <div className="text-right">
                                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${isGastoCase ? 'text-emerald-500' : 'text-red-400'}`}>
                                                        {isGastoCase ? 'Diferencia a categorizar' : 'Monto faltante'}
                                                    </p>
                                                    <p className={`text-sm font-black ${isGastoCase ? 'text-emerald-500' : 'text-red-400'}`}>
                                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Math.abs(difference))}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* CASE 1: Residual as expense/tax (Gasto Bancario) */}
                                        {isGastoCase && (
                                            <div className="pt-3 border-t border-gray-800 flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        onClick={() => setProcessResidualAsGasto(!processResidualAsGasto)}
                                                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${processResidualAsGasto ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600 bg-gray-950'}`}
                                                    >
                                                        {processResidualAsGasto && <Check className="w-3 h-3 text-black font-bold" />}
                                                    </div>
                                                    <span className="text-[10px] text-gray-300 font-bold uppercase cursor-pointer" onClick={() => setProcessResidualAsGasto(!processResidualAsGasto)}>
                                                        Liquidar diferencia como gasto bancario
                                                    </span>
                                                </div>

                                                {processResidualAsGasto && (
                                                    <select
                                                        value={residualCategory}
                                                        onChange={(e) => setResidualCategory(e.target.value)}
                                                        className="bg-gray-950 border border-gray-800 rounded h-7 px-2 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                    >
                                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                )}
                                            </div>
                                        )}

                                        {/* CASE 2: Mixed Payment (Efectivo/Cheque/Retencion) */}
                                        {isMixedCase && (
                                            <div className="pt-3 border-t border-gray-800 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            onClick={() => setSecondaryPaymentEnabled(!secondaryPaymentEnabled)}
                                                            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${secondaryPaymentEnabled ? 'bg-amber-500 border-amber-500' : 'border-gray-600 bg-gray-950'}`}
                                                        >
                                                            {secondaryPaymentEnabled && <Check className="w-3 h-3 text-black font-bold" />}
                                                        </div>
                                                        <span className="text-[10px] text-gray-300 font-bold uppercase cursor-pointer" onClick={() => setSecondaryPaymentEnabled(!secondaryPaymentEnabled)}>
                                                            Completar pago con otro medio (Efectivo/Cheque)
                                                        </span>
                                                    </div>

                                                    {secondaryPaymentEnabled && (
                                                        <div className="flex gap-2">
                                                            {['efectivo', 'cheque', 'retencion'].map(method => (
                                                                <Button
                                                                    key={method}
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => setSecondaryPaymentMethod(method as any)}
                                                                    className={`h-7 px-2 text-[10px] font-bold uppercase transition-all ${secondaryPaymentMethod === method ? 'bg-amber-500 text-black border-amber-500' : 'bg-gray-900 border-gray-800 p-0 text-gray-400'}`}
                                                                >
                                                                    {method === 'efectivo' && <DollarSign className="w-3 h-3 mr-1" />}
                                                                    {method === 'cheque' && <Pencil className="w-3 h-3 mr-1" />}
                                                                    {method === 'retencion' && <Tag className="w-3 h-3 mr-1" />}
                                                                    {method}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {secondaryPaymentEnabled && secondaryPaymentMethod === 'cheque' && (
                                                    <div className="grid grid-cols-3 gap-2 p-3 bg-gray-950 border border-gray-800 rounded-lg animate-in zoom-in-95 duration-200">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] text-gray-500 uppercase font-black">Banco Emisor</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Nombre del banco"
                                                                value={secondaryCheckData.banco}
                                                                onChange={(e) => setSecondaryCheckData(prev => ({ ...prev, banco: e.target.value }))}
                                                                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] text-gray-500 uppercase font-black">Número</label>
                                                            <input
                                                                type="text"
                                                                placeholder="00000000"
                                                                value={secondaryCheckData.numero}
                                                                onChange={(e) => setSecondaryCheckData(prev => ({ ...prev, numero: e.target.value }))}
                                                                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] text-gray-500 uppercase font-black">Vencimiento</label>
                                                            <input
                                                                type="date"
                                                                value={secondaryCheckData.vencimiento}
                                                                onChange={(e) => setSecondaryCheckData(prev => ({ ...prev, vencimiento: e.target.value }))}
                                                                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )
                            })()}
                        </div>
                    )}

                    <DialogFooter className="flex justify-between items-center w-full mt-4">
                        {/* Creation restricted to Treasury module to maintain concern separation */}
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => setIsConciliating(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleConciliate}
                                disabled={isSubmitting || selectedMovementIds.length === 0}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                )}
                                Conciliar Seleccionados
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </Card>
    )
}

function TrendingUp(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
        </svg>
    )
}

function TrendingDown(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
            <polyline points="16 17 22 17 22 11" />
        </svg>
    )
}
