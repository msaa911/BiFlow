'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, Plus, Edit2, Trash2, FileDown, Upload, Bell, CheckCircle2, TrendingUp, TrendingDown, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { TreasuryEngine } from '@/lib/treasury-engine'
import { InvoiceFormModal } from './invoice-form-modal'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRef } from 'react'
import { downloadInvoiceTemplate, parseInvoiceExcel } from '@/lib/excel-utils'
import { InvoiceImportPreviewModal } from './invoice-import-preview-modal'
import { PaymentWizard } from './payment-wizard'

interface InvoicePanelProps {
    orgId: string
    invoices: any[]
    loading: boolean
    defaultView?: 'AR' | 'AP'
    onRefresh: () => void
    hideViewSelector?: boolean
}

export function InvoicePanel({ orgId, invoices, loading, defaultView = 'AR', onRefresh, hideViewSelector = false }: InvoicePanelProps) {
    const [view, setView] = useState<'AR' | 'AP'>(defaultView)
    const [searchTerm, setSearchTerm] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isPaymentWizardOpen, setIsPaymentWizardOpen] = useState(false)
    const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false)
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
    const [importData, setImportData] = useState<any[]>([])
    const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false)
    const [pendingTransactions, setPendingTransactions] = useState<any[]>([])
    const [loadingTransactions, setLoadingTransactions] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isDeletingBulk, setIsDeletingBulk] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(100)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    const fetchPendingTransactions = async (inv: any) => {
        setLoadingTransactions(true)
        try {
            // Buscamos transacciones pendientes que coincidan en monto o sean del mismo signo
            const { data, error } = await supabase
                .from('transacciones')
                .select('*')
                .eq('organization_id', orgId)
                .eq('estado', 'pendiente')
                .order('fecha', { ascending: false })

            if (error) throw error
            setPendingTransactions(data || [])
        } catch (error) {
            console.error('Error fetching transactions:', error)
            toast.error('Error al cargar transacciones bancarias')
        } finally {
            setLoadingTransactions(false)
        }
    }

    const handleConciliateReverse = async (txId: string) => {
        if (!selectedInvoice) return

        try {
            // 1. Fetch transaction to get details
            const { data: tx, error: txFetchError } = await supabase
                .from('transacciones')
                .select('*')
                .eq('id', txId)
                .single()

            if (txFetchError) throw txFetchError

            const isCobro = tx.monto > 0
            const amount = Math.abs(tx.monto)

            // 2. Create Movimiento Tesoreria (Header)
            const { data: movimiento, error: movError } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: selectedInvoice.entidad_id,
                    tipo: isCobro ? 'cobro' : 'pago',
                    fecha: tx.fecha,
                    monto_total: amount,
                    observaciones: `IMPUTACIÓN MANUAL (Desde Comprobante): ${tx.descripcion}`,
                    metadata: { transaccion_id: txId, manual: true }
                })
                .select()
                .single()

            if (movError) throw movError

            // 3. Create Instrument (The bank movement)
            const { error: insError } = await supabase
                .from('instrumentos_pago')
                .insert({
                    movimiento_id: movimiento.id,
                    metodo: 'transferencia',
                    monto: amount,
                    fecha_disponibilidad: tx.fecha,
                    detalle_referencia: tx.descripcion,
                    estado: 'acreditado'
                })

            if (insError) throw insError

            // 4. Create Application (Link Invoice to OP)
            const amountToApply = Math.min(Number(selectedInvoice.monto_pendiente), amount)
            const { error: appError } = await supabase
                .from('aplicaciones_pago')
                .insert({
                    movimiento_id: movimiento.id,
                    comprobante_id: selectedInvoice.id,
                    monto_aplicado: amountToApply
                })

            if (appError) throw appError

            // 5. Update Invoice (comprobante)
            const newPendiente = Number(selectedInvoice.monto_pendiente) - amountToApply
            const { error: invError } = await supabase
                .from('comprobantes')
                .update({
                    monto_pendiente: Math.max(0, newPendiente),
                    estado: newPendiente <= 0.05 ? 'pagado' : 'parcial',
                    metadata: {
                        ...(selectedInvoice.metadata || {}),
                        reconciled_at: new Date().toISOString(),
                        transaccion_id: txId
                    }
                })
                .eq('id', selectedInvoice.id)

            if (invError) throw invError

            // 6. Update Bank Transaction (Pivot Architecture)
            const { error: txUpdError } = await supabase
                .from('transacciones')
                .update({
                    movimiento_id: movimiento.id,
                    estado: 'conciliado',
                    metadata: {
                        ...(tx.metadata || {}),
                        reconciled_at: new Date().toISOString(),
                        link_method: 'invoice_reverse_match',
                        linked_invoice_id: selectedInvoice.id
                    }
                })
                .eq('id', txId)

            if (txUpdError) throw txUpdError

            toast.success('Factura imputada con éxito y circuito administrativo registrado')
            setIsReconcileModalOpen(false)
            onRefresh()
        } catch (error: any) {
            console.error('Error in reverse imputation:', error)
            toast.error('Error al realizar la imputación: ' + error.message)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que desea eliminar este comprobante?')) return
        const { error } = await supabase.from('comprobantes').delete().eq('id', id)
        if (error) {
            toast.error('Error al eliminar: ' + error.message)
        } else {
            toast.success('Comprobante eliminado')
            onRefresh()
        }
    }

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredInvoices.map(i => i.id)))
        } else {
            setSelectedIds(new Set())
        }
    }

    const handleSelect = (id: string, checked: boolean) => {
        const newSet = new Set(selectedIds)
        if (checked) newSet.add(id)
        else newSet.delete(id)
        setSelectedIds(newSet)
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`¿Seguro que desea eliminar ${selectedIds.size} comprobantes? Esta acción no se puede deshacer.`)) return

        setIsDeletingBulk(true)
        try {
            const idsToDelete = Array.from(selectedIds)
            const { error } = await supabase.from('comprobantes').delete().in('id', idsToDelete)

            if (error) throw error

            toast.success(`${selectedIds.size} comprobantes eliminados con éxito`)
            setSelectedIds(new Set())
            onRefresh()
        } catch (error: any) {
            console.error('Error deleting bulk:', error)
            toast.error('Error al eliminar en lote: ' + error.message)
        } finally {
            setIsDeletingBulk(false)
        }
    }

    const filteredInvoices = invoices.filter(inv => {
        let typeMatch = false
        if (view === 'AR') {
            // Documentos de Ingreso (Ventas, etc.)
            if (['factura_venta', 'ingreso_vario', 'ncb_bancaria'].includes(inv.tipo)) typeMatch = true
            // Notas de crédito/débito de ingresos
            else if (['nota_credito', 'nota_debito'].includes(inv.tipo)) {
                const vinculado = inv.vinculado_id ? invoices.find(i => i.id === inv.vinculado_id) : null
                typeMatch = vinculado ? ['factura_venta', 'ingreso_vario', 'ncb_bancaria'].includes(vinculado.tipo) : (!inv.tipo.includes('compra') && !inv.tipo.includes('egreso'))
            }
        } else {
            // Documentos de Egreso (Compras, etc.)
            if (['factura_compra', 'egreso_vario', 'ndb_bancaria'].includes(inv.tipo)) typeMatch = true
            // Notas de crédito/débito de egresos
            else if (['nota_credito', 'nota_debito'].includes(inv.tipo)) {
                const vinculado = inv.vinculado_id ? invoices.find(i => i.id === inv.vinculado_id) : null
                typeMatch = vinculado ? ['factura_compra', 'egreso_vario', 'ndb_bancaria'].includes(vinculado.tipo) : (!inv.tipo.includes('venta') && !inv.tipo.includes('ingreso'))
            }
        }

        const searchMatch = (inv.razon_social_entidad || inv.razon_social_socio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.nro_factura || inv.numero || inv.nro_comprobante || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.cuit_entidad || inv.cuit_socio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.concepto || '').toLowerCase().includes(searchTerm.toLowerCase())

        return typeMatch && searchMatch
    })

    const nettingOps = TreasuryEngine.detectNettingOpportunities(invoices)

    // Paginación
    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage)
    const paginatedInvoices = filteredInvoices.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )

    return (
        <Card className="bg-gray-900 border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                {!hideViewSelector && (
                    <div className="flex bg-gray-800 p-1 rounded-lg">
                        <button
                            onClick={() => setView('AR')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'AR' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Ingresos (Ventas)
                        </button>
                        <button
                            onClick={() => setView('AP')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'AP' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Egresos (Compras)
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <Button
                        variant={selectedIds.size > 0 ? "destructive" : "outline"}
                        size="sm"
                        className={`gap-2 h-9 duration-200 ${selectedIds.size > 0 ? 'shadow-lg animate-in zoom-in-95' : 'opacity-40 border-dashed text-gray-500 bg-transparent hover:bg-transparent hover:text-gray-500 border-gray-700'}`}
                        onClick={handleBulkDelete}
                        disabled={isDeletingBulk || selectedIds.size === 0}
                        title={selectedIds.size === 0 ? "Marca las casillas de la tabla para activar este botón" : "Eliminar seleccionados"}
                    >
                        <Trash2 className="w-4 h-4" />
                        {isDeletingBulk ? 'Borrando...' : (selectedIds.size > 0 ? `Eliminar ${selectedIds.size}` : 'Selecciona para eliminar')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                        onClick={() => downloadInvoiceTemplate(view === 'AR' ? 'factura_venta' : 'factura_compra')}
                    >
                        <FileDown className="w-4 h-4 mr-2" />
                        Plantilla
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        Importar
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".xlsx,.csv"
                        onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const loadingToast = toast.loading('Analizando comprobantes...')
                            try {
                                const { data: parsed, errors } = await parseInvoiceExcel(file)
                                if (errors.length > 0) throw new Error(errors[0])
                                const { data: entities } = await supabase.from('entidades').select('id, razon_social, cuit').eq('organization_id', orgId)
                                const enriched = parsed.map(inv => {
                                    const match = entities?.find(e => e.cuit === (inv.cuit_entidad || inv.cuit_socio) || e.razon_social.toLowerCase() === (inv.razon_social_entidad || inv.razon_social_socio || '').toLowerCase())
                                    return {
                                        ...inv,
                                        entidad_id: match?.id,
                                        razon_social_entidad: match?.razon_social || inv.razon_social_entidad || inv.razon_social_socio,
                                        cuit_entidad: match?.cuit || inv.cuit_entidad || inv.cuit_socio,
                                        isValid: inv.isValid && !!match,
                                        errors: !match ? [...(inv.errors || []), 'Entidad no registrada'] : inv.errors
                                    }
                                })
                                setImportData(enriched)
                                setIsImportPreviewOpen(true)
                            } catch (err: any) {
                                toast.error('Error: ' + err.message)
                            } finally {
                                toast.dismiss(loadingToast)
                                e.target.value = ''
                            }
                        }}
                    />
                    <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        onClick={() => {
                            setSelectedInvoice(null)
                            setIsModalOpen(true)
                        }}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nuevo {view === 'AR' ? 'Ingreso' : 'Egreso'}
                    </Button>
                </div>
            </div>

            <div className="p-4 bg-gray-900 flex items-center justify-between border-b border-gray-800">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                        placeholder="Buscar por cliente, CUIT o factura..."
                        className="pl-10 bg-gray-950 border-gray-800 text-sm h-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-emerald-500/20 hover:scrollbar-thumb-emerald-500/40 scrollbar-track-transparent">
                <table className="w-full text-left text-xs border-separate border-spacing-0">
                    <thead className="bg-gray-800 text-[10px] font-bold text-gray-400 sticky top-0 z-10">
                        <tr>
                            <th className="px-6 py-4 w-12 text-center sticky top-0 z-20 bg-gray-800">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-700 bg-gray-900/50 text-emerald-500 focus:ring-emerald-500/20 w-4 h-4 cursor-pointer"
                                    checked={filteredInvoices.length > 0 && selectedIds.size === filteredInvoices.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800">Fecha (Emisión)</th>
                            <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800">CUIT / Entidad</th>
                            <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800">Concepto / Condición</th>
                            <th className="px-6 py-4 text-right sticky top-0 z-20 bg-gray-800">Monto Total</th>
                            <th className="px-6 py-4 text-right sticky top-0 z-20 bg-gray-800">Saldo Pendiente</th>
                            <th className="px-6 py-4 text-center sticky top-0 z-20 bg-gray-800">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading ? (
                            <tr><td colSpan={7} className="px-6 py-24 text-center text-gray-500">Cargando comprobantes...</td></tr>
                        ) : paginatedInvoices.length === 0 ? (
                            <tr><td colSpan={7} className="px-6 py-24 text-center text-gray-500 text-xs">No hay comprobantes registrados.</td></tr>
                        ) : paginatedInvoices.map(inv => (
                            <tr key={inv.id} className={`hover:bg-gray-800/30 transition-all border-b border-gray-800/50 ${selectedIds.has(inv.id) ? 'bg-emerald-500/5' : ''}`}>
                                <td className="px-6 py-4 text-center align-middle">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-700 bg-gray-900/50 text-emerald-500 focus:ring-emerald-500/20 w-4 h-4 cursor-pointer"
                                        checked={selectedIds.has(inv.id)}
                                        onChange={(e) => handleSelect(inv.id, e.target.checked)}
                                    />
                                </td>
                                <td className="px-6 py-3">
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold text-xs">{new Date(inv.fecha_emision).toLocaleDateString('es-AR')}</span>
                                        <span className="text-[9px] text-gray-500 uppercase font-medium">Vence: {new Date(inv.fecha_vencimiento).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <div className="flex flex-col">
                                        <span className="text-white font-semibold text-xs leading-tight">{inv.razon_social_entidad || inv.razon_social_socio}</span>
                                        <span className="text-[10px] text-gray-400 font-mono mt-0.5">{inv.cuit_entidad || inv.cuit_socio}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className={`truncate max-w-[200px] text-xs font-bold ${inv.concepto ? 'text-white' : 'text-red-400 italic'}`} title={inv.concepto || 'Sin concepto'}>
                                                {inv.concepto || 'Sin concepto'}
                                            </span>
                                            {inv.tipo === 'nota_credito' && <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-[8px] px-1 h-3.5">NC</Badge>}
                                            {inv.tipo === 'nota_debito' && <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-[8px] px-1 h-3.5">ND</Badge>}
                                        </div>
                                        <span className="text-[10px] text-gray-500 font-mono leading-none">
                                            {inv.nro_factura || inv.numero || inv.nro_comprobante || 'S/N'}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-right font-medium text-gray-400 text-xs">
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_total)}
                                </td>
                                <td className={`px-6 py-4 text-right font-bold`}>
                                    {inv.monto_pendiente > 0 ? (
                                        <div className="flex flex-col items-end">
                                            <span className="text-amber-400 font-bold">
                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_pendiente)}
                                            </span>
                                            <span className="text-[9px] text-gray-500 font-medium uppercase mt-0.5">Pendiente</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-end">
                                            {inv.estado === 'conciliado' || inv.metadata?.reconciled_v2 || inv.metadata?.last_auto_reconciled ? (
                                                <div className="flex items-center justify-end gap-1.5 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg">
                                                    <div className="flex -space-x-1">
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                                                    </div>
                                                    <span className="text-blue-400 text-[10px] font-black tracking-tight">
                                                        {view === 'AR' ? 'COBRADO E IMPUTADO' : 'PAGADO E IMPUTADO'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                    <span className="text-emerald-400 text-[10px] font-black tracking-tight">
                                                        {/* Map 'pagado' to 'COBRADO' for AR view */}
                                                        {view === 'AR' ? 'COBRADO' : 'PAGADO'}
                                                    </span>
                                                </div>
                                            )}
                                            <span className="text-[9px] text-gray-500 font-medium mt-1 truncate max-w-[150px]" title={inv.metadata?.desc_transaccion || 'Saldo cancelado administrativamente'}>
                                                {inv.estado === 'conciliado' ? 'Confirmado por banco' : 'Pendiente cruce bancario (PAGADO)'}
                                            </span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center gap-2">
                                        <Button
                                            size="sm"
                                            className={`h-8 font-bold text-white text-sm ${view === 'AR' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
                                            disabled={inv.monto_pendiente <= 0}
                                            onClick={() => {
                                                setSelectedInvoice(inv)
                                                setIsPaymentWizardOpen(true)
                                            }}
                                        >
                                            {view === 'AR' ? 'Cobrar' : 'Pagar'}
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/20 text-sm"
                                            disabled={inv.monto_pendiente <= 0}
                                            onClick={() => {
                                                setSelectedInvoice(inv)
                                                setIsReconcileModalOpen(true)
                                                fetchPendingTransactions(inv)
                                            }}
                                        >
                                            Imputar
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-gray-500 hover:text-white"
                                            onClick={() => {
                                                setSelectedInvoice(inv)
                                                setIsModalOpen(true)
                                            }}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-gray-500 hover:text-red-400"
                                            onClick={() => handleDelete(inv.id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
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
                        Mostrando <span className="text-gray-300">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-gray-300">{Math.min(currentPage * itemsPerPage, filteredInvoices.length)}</span> de <span className="text-gray-300">{filteredInvoices.length}</span> registros
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
                            <ArrowRight className="w-4 h-4 rotate-180" />
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
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </div>

            {nettingOps.length > 0 && (
                <div className="p-4 bg-emerald-600/5 border-t border-gray-800 flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-full">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-emerald-200/60 leading-relaxed">
                            <strong className="text-emerald-400">Netting Inteligente Detectado:</strong> Tenemos un cruce de saldos para <span className="text-white font-semibold">{nettingOps[0].entidad_nombre || nettingOps[0].entidad_id}</span>.
                            A cobrar: <span className="text-emerald-400">${new Intl.NumberFormat('es-AR').format(nettingOps[0].pendingAR)}</span> |
                            A pagar: <span className="text-red-400">${new Intl.NumberFormat('es-AR').format(nettingOps[0].pendingAP)}</span>.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
                    >
                        Compensar Ahora
                        <ArrowRight className="w-3 h-3 ml-2" />
                    </Button>
                </div>
            )}

            <InvoiceFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                orgId={orgId}
                invoice={selectedInvoice}
                type={view === 'AR' ? 'factura_venta' : 'factura_compra'}
                onSuccess={onRefresh}
            />

            <InvoiceImportPreviewModal
                isOpen={isImportPreviewOpen}
                onClose={() => setIsImportPreviewOpen(false)}
                data={importData}
                orgId={orgId}
                type={view === 'AR' ? 'factura_venta' : 'factura_compra'}
                onConfirm={async (validData) => {
                    const loadingToast = toast.loading('Guardando comprobantes...')
                    try {
                        const safeDate = (val: any) => {
                            if (!val) return new Date().toISOString().split('T')[0]
                            if (typeof val === 'number') {
                                return new Date(Math.round((val - 25569) * 864e5)).toISOString().split('T')[0]
                            }
                            return String(val)
                        }

                        const tipoLabel = view === 'AR' ? 'ingresos' : 'egresos'

                        // Send everything to server-side endpoint (service role handles all DB ops)
                        const res = await fetch('/api/invoice-import', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                tipoLabel,
                                comprobantes: validData.map(inv => ({
                                    entidad_id: inv.entidad_id,
                                    tipo: inv.tipo_documento === 'factura' ? (view === 'AR' ? 'factura_venta' : 'factura_compra') : inv.tipo_documento,
                                    fecha_emision: safeDate(inv.fecha_emision),
                                    fecha_vencimiento: safeDate(inv.fecha_vencimiento || inv.fecha_emision),
                                    nro_factura: inv.nro_factura,
                                    monto_total: inv.monto_total,
                                    monto_pendiente: inv.condicion === 'contado' ? 0 : inv.monto_total,
                                    estado: inv.condicion === 'contado' ? 'pagado' : 'pendiente',
                                    condicion: inv.condicion,
                                    moneda: inv.moneda || 'ARS',
                                    razon_social_socio: inv.razon_social_entidad,
                                    cuit_socio: inv.cuit_entidad,
                                    concepto: inv.concepto
                                }))
                            })
                        })

                        if (!res.ok) {
                            const err = await res.json()
                            throw new Error(err.error || 'Error al importar')
                        }

                        const result = await res.json()
                        toast.success(`${result.count} comprobantes importados`)
                        onRefresh()
                    } catch (err: any) {
                        toast.error('Error al importar: ' + err.message)
                        throw err
                    } finally {
                        toast.dismiss(loadingToast)
                    }
                }}
                onRowUpdate={(updatedRow) => {
                    setImportData(prev => prev.map(row => row.rowNum === updatedRow.rowNum ? updatedRow : row))
                }}
                onSuccess={() => {
                    setIsImportPreviewOpen(false)
                    onRefresh()
                }}
            />

            <PaymentWizard
                isOpen={isPaymentWizardOpen}
                onClose={() => setIsPaymentWizardOpen(false)}
                orgId={orgId}
                entidadId={selectedInvoice?.entidad_id}
                razonSocial={selectedInvoice?.razon_social_entidad || selectedInvoice?.razon_social_socio}
                tipo={view === 'AR' ? 'cobro' : 'pago'}
                onSuccess={onRefresh}
            />

            <Dialog open={isReconcileModalOpen} onOpenChange={setIsReconcileModalOpen}>
                <DialogContent className="max-w-2xl bg-gray-950 border-gray-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Imputar con Banco</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Selecciona el movimiento bancario que cancela este comprobante.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedInvoice && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 my-2 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-emerald-500 uppercase font-black tracking-widest mb-1">Comprobante BiFlow</p>
                                <p className="text-sm font-bold text-white leading-tight">{selectedInvoice.razon_social_entidad || selectedInvoice.razon_social_socio}</p>
                                <p className="text-[10px] text-gray-500">{selectedInvoice.tipo} • {selectedInvoice.numero}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-black text-white">
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(selectedInvoice.monto_total)}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="py-4">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Movimientos Bancarios Pendientes</p>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {loadingTransactions ? (
                                <div className="py-12 text-center text-gray-500">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Buscando transacciones...
                                </div>
                            ) : pendingTransactions.length > 0 ? (
                                pendingTransactions.map(tx => {
                                    const diff = Math.abs(selectedInvoice?.monto_total || 0) === Math.abs(tx.monto)
                                    return (
                                        <button
                                            key={tx.id}
                                            onClick={() => handleConciliateReverse(tx.id)}
                                            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left group ${diff ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`p-2 rounded-lg ${tx.monto < 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                    {tx.monto < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors truncate max-w-[300px]">{tx.descripcion}</p>
                                                    <p className="text-[10px] text-gray-500">{new Date(tx.fecha).toLocaleDateString('es-AR')}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-sm font-black ${tx.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(tx.monto)}
                                                </p>
                                                {diff && <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 rounded uppercase">Monto Exacto</span>}
                                            </div>
                                        </button>
                                    )
                                })
                            ) : (
                                <div className="py-12 text-center text-gray-600 border border-dashed border-gray-800 rounded-xl">
                                    No hay movimientos bancarios pendientes.
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setIsReconcileModalOpen(false)}
                            className="text-gray-400 hover:text-white"
                        >
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
