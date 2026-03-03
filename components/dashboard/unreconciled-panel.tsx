'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Search, ExternalLink, Tag, FileDown, Loader2, X, PlusCircle, Check } from 'lucide-react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

interface Transaction {
    id: string
    fecha: string
    descripcion: string
    referencia?: string
    monto: number
    estado: string
    cuit_origen?: string
    cuit_destino?: string
    monto_usado?: number
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
    const [showAll, setShowAll] = useState(false)
    const supabase = createClient()

    const categories = [
        "Gastos Bancarios",
        "Impuestos y Tasas",
        "Intereses Pagados",
        "Intereses Ganados",
        "Comisiones Bancarias",
        "Servicios Públicos",
        "Retiro de Socios",
        "Sueldos y Jornales",
        "Mantenimiento",
        "Honorarios Profesionales",
        "Otros Gastos Operativos",
        "Otros"
    ]

    const [isConciliating, setIsConciliating] = useState(false)
    const [availableInvoices, setAvailableInvoices] = useState<any[]>([])
    const [loadingInvoices, setLoadingInvoices] = useState(false)
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
    const [aiSuggestions, setAiSuggestions] = useState<any[]>([])

    // Quick Load States
    const [isQuickLoading, setIsQuickLoading] = useState(false)
    const [entities, setEntities] = useState<any[]>([])
    const [loadingEntities, setLoadingEntities] = useState(false)
    const [searchEntity, setSearchEntity] = useState('')
    const [selectedEntityId, setSelectedEntityId] = useState('')
    const [invoiceNumber, setInvoiceNumber] = useState('')

    // Split States
    const [isSplitting, setIsSplitting] = useState(false)
    const [splitConcept, setSplitConcept] = useState('IVA Crédito Fiscal')
    const [splitAmount, setSplitAmount] = useState('0')
    const [splitType, setSplitType] = useState<'activo' | 'gasto'>('activo')

    const fetchEntities = async () => {
        setLoadingEntities(true)
        try {
            const { data, error } = await supabase
                .from('entidades')
                .select('*')
                .eq('organization_id', (transactions[0] as any)?.organization_id)
                .order('razon_social', { ascending: true })

            if (error) throw error
            setEntities(data || [])
        } catch (error) {
            console.error('Error fetching entities:', error)
        } finally {
            setLoadingEntities(false)
        }
    }

    const fetchInvoicesAndSuggestions = async (txToMatch: Transaction) => {
        setLoadingInvoices(true)
        setSelectedInvoiceIds([])
        setAiSuggestions([])
        try {
            // Filter by type: positive amount -> sales (venta), negative -> purchases (compra)
            const typeFilter = txToMatch.monto > 0 ? 'factura_venta' : 'factura_compra'

            const { data, error } = await supabase
                .from('comprobantes')
                .select('*')
                .eq('organization_id', (transactions[0] as any)?.organization_id)
                .in('estado', ['pendiente', 'parcial'])
                .eq('tipo', typeFilter)
                .order('fecha_vencimiento', { ascending: true })

            if (error) throw error
            setAvailableInvoices(data || [])

            // Fetch AI Suggestions
            try {
                const res = await fetch('/api/reconcile/suggestions')
                if (res.ok) {
                    const suggData = await res.json()
                    // Filter suggestions for THIS specific transaction
                    const txSuggestions = (suggData.suggestions || []).filter((s: any) => s.transId === txToMatch.id)
                    // Extract the invoice IDs suggested
                    const suggestedIds = txSuggestions.flatMap((s: any) => s.invoiceIds || [])
                    setAiSuggestions(suggestedIds)
                }
            } catch (sgErr) {
                console.warn('Error fetching suggestions:', sgErr)
            }
        } catch (error) {
            console.error('Error fetching invoices:', error)
            toast.error('Error al cargar comprobantes pendientes')
        } finally {
            setLoadingInvoices(false)
        }
    }

    const handleQuickCreate = async () => {
        if (!selectedTx || !selectedEntityId || !invoiceNumber) {
            toast.error('Completa los datos requeridos')
            return
        }

        setIsSubmitting(true)
        try {
            const orgId = (transactions[0] as any)?.organization_id
            const isPago = selectedTx.monto < 0
            const tipoComprobante = isPago ? 'factura_compra' : 'factura_venta'
            const tipoTesoreria = isPago ? 'pago' : 'cobro'

            // 1. Create Comprobante
            const { data: comprobante, error: compError } = await supabase
                .from('comprobantes')
                .insert({
                    organization_id: orgId,
                    tipo: tipoComprobante,
                    numero: invoiceNumber,
                    cuit_socio: entities.find(e => e.id === selectedEntityId)?.cuit || '',
                    razon_social_socio: entities.find(e => e.id === selectedEntityId)?.razon_social || '',
                    fecha_emision: selectedTx.fecha,
                    fecha_vencimiento: selectedTx.fecha,
                    monto_total: Math.abs(selectedTx.monto),
                    monto_pendiente: 0,
                    estado: 'pagado'
                })
                .select()
                .single()

            if (compError) throw compError

            // 2. Create Movimiento Tesoreria (OP/Recibo)
            const { data: movimiento, error: movError } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: selectedEntityId,
                    tipo: tipoTesoreria,
                    fecha: selectedTx.fecha,
                    monto_total: Math.abs(selectedTx.monto),
                    observaciones: `CONCILIACIÓN MANUAL Pendientes: ${selectedTx.descripcion}`
                })
                .select()
                .single()

            if (movError) throw movError

            // 3. Create Application (Link Invoice to OP)
            const { error: appError } = await supabase
                .from('aplicaciones_pago')
                .insert({
                    movimiento_id: movimiento.id,
                    comprobante_id: comprobante.id,
                    monto_aplicado: Math.abs(selectedTx.monto)
                })

            if (appError) throw appError

            // 4. Create Instrument (The bank movement itself)
            const { error: insError } = await supabase
                .from('instrumentos_pago')
                .insert({
                    movimiento_id: movimiento.id,
                    metodo: 'transferencia',
                    monto: Math.abs(selectedTx.monto),
                    fecha_disponibilidad: selectedTx.fecha,
                    referencia: selectedTx.descripcion,
                    estado: 'acreditado'
                })

            if (insError) throw insError

            // 5. Update Bank Transaction
            const { error: txError } = await supabase
                .from('transacciones')
                .update({
                    comprobante_id: comprobante.id,
                    movimiento_id: movimiento.id,
                    estado: 'conciliado'
                })
                .eq('id', selectedTx.id)

            if (txError) throw txError

            toast.success(`${isPago ? 'Orden de Pago' : 'Recibo'} y Factura creados y conciliados`)
            setIsQuickLoading(false)
            setIsConciliating(false)
            setInvoiceNumber('')
            setSelectedEntityId('')
            if (onRefresh) onRefresh()
        } catch (error) {
            console.error('Error in quick create:', error)
            toast.error('Error al realizar la carga rápida')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleConciliate = async () => {
        if (!selectedTx || selectedInvoiceIds.length === 0) return
        setIsSubmitting(true)
        try {
            const orgId = (transactions[0] as any)?.organization_id
            const isCobro = selectedTx.monto > 0

            // Available to apply (total minus amount already used in previous partial reconciliations)
            const totalBankAmount = Math.abs(selectedTx.monto)
            const previouslyUsed = Number(selectedTx.monto_usado || 0)
            const availableAmount = totalBankAmount - previouslyUsed

            if (availableAmount <= 0) {
                throw new Error("La transacción ya ha sido utilizada en su totalidad.")
            }

            // 1. Fetch selected invoices to get their current balances
            const { data: invoices, error: invFetchError } = await supabase
                .from('comprobantes')
                .select('*')
                .in('id', selectedInvoiceIds)

            if (invFetchError) throw invFetchError
            if (!invoices || invoices.length === 0) throw new Error("No se encontraron las facturas seleccionadas.")

            // Verify they belong to the same entity
            const entityCuit = invoices[0].cuit_socio
            const allSameEntity = invoices.every(i => i.cuit_socio === entityCuit)
            if (!allSameEntity) {
                throw new Error("No puedes conciliar facturas de múltiples entidades en un solo movimiento.")
            }

            // Get Entity ID (Mandatory for Movimiento)
            const { data: entity } = await supabase
                .from('entidades')
                .select('id')
                .eq('organization_id', orgId)
                .eq('cuit', entityCuit)
                .single();

            if (!entity) throw new Error(`Entidad no encontrada para CUIT ${entityCuit}`)

            // Calculate total applied in this operation
            let remainingBankToApply = availableAmount
            let totalAppliedInOperation = 0

            // We do a pre-calculation to know how much we are applying
            const invoicesToApply = invoices.map(inv => {
                const amountToApply = Math.min(Number(inv.monto_pendiente), remainingBankToApply)
                remainingBankToApply -= amountToApply
                totalAppliedInOperation += amountToApply
                return { ...inv, amountToApply }
            }).filter(i => i.amountToApply > 0)

            if (totalAppliedInOperation <= 0) {
                throw new Error("No hay monto pendiente a cubrir en las facturas seleccionadas.")
            }

            // 2. Create Movimiento Tesoreria (Header)
            const { data: movimiento, error: movError } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: entity.id,
                    tipo: isCobro ? 'cobro' : 'pago',
                    fecha: selectedTx.fecha,
                    monto_total: totalAppliedInOperation,
                    observaciones: `CONCILIACIÓN MANUAL Pendientes: ${selectedTx.descripcion}`,
                    metadata: { transaccion_id: selectedTx.id, manual: true, partial: invoicesToApply.length > 1 }
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
                    monto: totalAppliedInOperation,
                    fecha_disponibilidad: selectedTx.fecha,
                    referencia: selectedTx.descripcion,
                    estado: 'acreditado'
                })

            if (insError) throw insError

            // Apply to each invoice
            for (const invoice of invoicesToApply) {
                // 4. Create Application (Link Invoice to OP)
                const { error: appError } = await supabase
                    .from('aplicaciones_pago')
                    .insert({
                        movimiento_id: movimiento.id,
                        comprobante_id: invoice.id,
                        monto_aplicado: invoice.amountToApply
                    })

                if (appError) throw appError

                // 5. Update Invoice (comprobante)
                const newPendiente = Number(invoice.monto_pendiente) - invoice.amountToApply
                const { error: invError } = await supabase
                    .from('comprobantes')
                    .update({
                        monto_pendiente: Math.max(0, newPendiente),
                        estado: newPendiente <= 0.05 ? 'pagado' : 'parcial',
                        metadata: {
                            ...(invoice.metadata || {}),
                            reconciled_at: new Date().toISOString(),
                            transaccion_id: selectedTx.id
                        }
                    })
                    .eq('id', invoice.id)

                if (invError) throw invError
            }

            // 6. Update Bank Transaction
            const newMontoUsado = previouslyUsed + totalAppliedInOperation
            const isFullyUsed = newMontoUsado >= totalBankAmount - 0.05

            const { error: txError } = await supabase
                .from('transacciones')
                .update({
                    movimiento_id: movimiento.id,
                    estado: isFullyUsed ? 'conciliado' : 'parcial',
                    monto_usado: newMontoUsado
                })
                .eq('id', selectedTx.id)

            if (txError) throw txError

            toast.success('Conciliación manual exitosa (Circuito Completo registrado)')
            setIsConciliating(false)
            setSelectedTx(null)
            setSelectedInvoiceIds([])
            if (onRefresh) onRefresh()
        } catch (error: any) {
            console.error('Error in conciliation:', error)
            toast.error('Error al realizar la conciliación: ' + error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const filtered = transactions
        .filter(t => showAll || (t.estado === 'pendiente' || t.estado === 'parcial'))
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
            // 1. Ensure "Gastos Varios / Banco" entity exists
            let { data: entity } = await supabase
                .from('entidades')
                .select('id, cuit, razon_social')
                .eq('organization_id', orgId)
                .eq('razon_social', 'Gastos Varios / Otros')
                .single()

            if (!entity) {
                const { data: newEntity, error: entError } = await supabase
                    .from('entidades')
                    .insert({
                        organization_id: orgId,
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

            // 3. Prepare Metadata with Splits (if applicable)
            const totalMonto = Math.abs(selectedTx.monto)
            const parsedSplitAmount = parseFloat(splitAmount) || 0

            const metadata: any = {
                transaccion_id: selectedTx.id,
                categoria_principal: category
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

            // 4. Create Comprobante (Voucher) - The supporting document
            const { data: voucher, error: vError } = await supabase
                .from('comprobantes')
                .insert({
                    organization_id: orgId,
                    tipo: voucherType,
                    numero: selectedTx.referencia || `BANK-${selectedTx.id.slice(0, 8)}`,
                    cuit_socio: entity.cuit,
                    razon_social_socio: entity.razon_social,
                    fecha_emision: selectedTx.fecha,
                    fecha_vencimiento: selectedTx.fecha,
                    monto_total: totalMonto,
                    monto_pendiente: 0,
                    estado: 'pagado',
                    moneda: 'ARS',
                    metadata: metadata // Store split info in voucher too
                })
                .select()
                .single()

            if (vError) throw vError

            // 5. Create Movimiento Tesoreria (NDB/NCB) - The financial event
            const { data: movimiento, error: movError } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: entity.id,
                    tipo: isIngreso ? 'cobro' : 'pago',
                    clase_documento: claseDoc,
                    numero: voucher.numero, // Sync with voucher number
                    categoria: category,
                    fecha: selectedTx.fecha,
                    monto_total: totalMonto,
                    observaciones: isSplitting
                        ? `[${claseDoc}] VOUCHER: ${voucher.numero} | DESGLOSE: ${category} / ${splitConcept}`
                        : `[${claseDoc}] VOUCHER: ${voucher.numero} | CATEGORIZACIÓN: ${category}`,
                    metadata: metadata
                })
                .select()
                .single()

            if (movError) throw movError

            // 6. Link Movement to Voucher (Aplicacion)
            const { error: appError } = await supabase
                .from('aplicaciones_pago')
                .insert({
                    movimiento_id: movimiento.id,
                    comprobante_id: voucher.id,
                    monto_aplicado: totalMonto
                })

            if (appError) throw appError

            // 7. Create Instrument (The bank payment)
            const { error: insError } = await supabase
                .from('instrumentos_pago')
                .insert({
                    movimiento_id: movimiento.id,
                    metodo: 'transferencia',
                    monto: totalMonto,
                    fecha_disponibilidad: selectedTx.fecha,
                    referencia: selectedTx.descripcion,
                    estado: 'acreditado'
                })

            if (insError) throw insError

            // 8. Update Bank Transaction
            const { error: txError } = await supabase
                .from('transacciones')
                .update({
                    categoria: category,
                    movimiento_id: movimiento.id,
                    estado: 'conciliado'
                })
                .eq('id', selectedTx.id)

            if (txError) throw txError

            toast.success(`${claseDoc} generada y registrada en bancos`)
            setIsCategorizing(false)
            setIsSplitting(false)
            setSplitAmount('0')
            setSelectedTx(null)
            if (onRefresh) onRefresh()
        } catch (error) {
            console.error('Error categorizing:', error)
            toast.error('Error al generar la nota bancaria')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Card className="bg-gray-900 border-gray-800 animate-in fade-in duration-500">
            <CardHeader className="flex flex-row items-center justify-between border-b border-gray-800 px-6 py-4">
                <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        Pendientes de Conciliación ({transactions.length})
                    </CardTitle>
                    <p className="text-xs text-gray-400 mt-1">Movimientos bancarios pendientes de vinculación con comprobantes.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAll(!showAll)}
                        className={`font-bold text-[10px] uppercase transition-all ${showAll ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-gray-800/50 text-gray-200 border-gray-700 hover:bg-gray-700'}`}
                    >
                        {showAll ? 'Viendo Todo' : 'Ver Solo Pendientes'}
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
                            <div key={tx.id} className={`group flex items-center justify-between p-4 bg-gray-950 border rounded-xl transition-all ${tx.estado === 'conciliado' ? 'border-emerald-500/10 opacity-60 grayscale-[0.8] bg-gray-950/50' : 'border-gray-800 hover:border-gray-700 shadow-sm'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${tx.monto < 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                        {tx.monto < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-white truncate max-w-[350px]">{tx.descripcion}</p>
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
                                                    <Tag className="w-3.5 h-3.5" />
                                                    <span className="text-[10px] font-bold uppercase">Categorizar</span>
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
                if (!open) setIsSplitting(false)
            }}>
                <DialogContent className="max-w-md bg-gray-950 border-gray-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Tag className="w-5 h-5 text-blue-400" />
                            Generar Nota Bancaria (NDB/NCB)
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 text-xs">
                            Selecciona el concepto principal para registrar el movimiento directo en el banco.
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
                                onClick={() => handleQuickCategorize(cat)}
                                disabled={isSubmitting}
                                className="flex items-center justify-between p-3 rounded-xl border border-gray-800 bg-gray-900/40 text-left hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group disabled:opacity-50"
                            >
                                <span className={`text-sm font-medium ${isSplitting ? 'text-white' : 'text-gray-300'} group-hover:text-blue-400`}>{cat}</span>
                                <CheckCircle2 className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setIsCategorizing(false)}
                            className="text-gray-400 hover:text-white"
                        >
                            Cancelar
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
                            Busca el comprobante (Factura/Recibo) que respalda este movimiento.
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

                    <div className="py-2">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                Comprobantes Sugeridos {aiSuggestions.length > 0 && <span className="ml-2 text-amber-500">✨ IA Sugiere {aiSuggestions.length} match(es)</span>}
                            </p>
                            {selectedInvoiceIds.length > 0 && (
                                <p className="text-xs text-blue-400 font-bold uppercase mr-2">
                                    {selectedInvoiceIds.length} seleccionado(s)
                                </p>
                            )}
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {loadingInvoices ? (
                                <div className="py-12 text-center text-gray-500">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Buscando coincidencias...
                                </div>
                            ) : availableInvoices.length > 0 ? (
                                availableInvoices.map(inv => {
                                    const requiredAmount = Math.abs(selectedTx?.monto || 0) - (selectedTx?.monto_usado || 0)
                                    const isExactMatch = requiredAmount === Math.abs(inv.monto_pendiente)
                                    const isSuggested = aiSuggestions.includes(inv.id)
                                    const isSelected = selectedInvoiceIds.includes(inv.id)

                                    return (
                                        <button
                                            key={inv.id}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setSelectedInvoiceIds(prev => prev.filter(id => id !== inv.id))
                                                } else {
                                                    setSelectedInvoiceIds(prev => [...prev, inv.id])
                                                }
                                            }}
                                            disabled={isSubmitting}
                                            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left group
                                                ${isSelected ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                                                    : isSuggested ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
                                                        : isExactMatch ? 'border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10'
                                                            : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-800/60'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`flex items-center justify-center w-5 h-5 rounded-md border ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600 bg-gray-900 group-hover:border-gray-500'}`}>
                                                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                                </div>
                                                <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-500/20 text-blue-400' : isSuggested ? 'bg-amber-500/20 text-amber-500' : 'bg-gray-800 text-gray-500'}`}>
                                                    <FileDown className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-bold transition-colors ${isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                                                        {inv.razon_social_socio} {isSuggested && <span className="ml-2 text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Sugerencia IA</span>}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500">
                                                        {inv.tipo} • {inv.numero} • Vence: {new Date(inv.fecha_vencimiento).toLocaleDateString()}
                                                        {inv.estado === 'parcial' && <span className="ml-2 text-blue-400 bg-blue-500/10 px-1 rounded">Pago Parcial</span>}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-sm font-black ${isSelected ? 'text-blue-400' : 'text-white'}`}>
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_pendiente)}
                                                </p>
                                                {isExactMatch && !isSuggested && <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 rounded uppercase mt-1 inline-block">Monto Exacto</span>}
                                            </div>
                                        </button>
                                    )
                                })
                            ) : (
                                <div className="py-12 text-center text-gray-600 border border-dashed border-gray-800 rounded-xl">
                                    No hay comprobantes pendientes que coincidan con este flujo.
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="flex justify-between items-center w-full mt-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsConciliating(false)
                                setIsQuickLoading(true)
                                fetchEntities()
                            }}
                            className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                        >
                            <PlusCircle className="w-4 h-4 mr-2" />
                            Documentar Nuevo
                        </Button>
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
                                disabled={isSubmitting || selectedInvoiceIds.length === 0}
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

            {/* Quick Load Dialog */}
            <Dialog open={isQuickLoading} onOpenChange={setIsQuickLoading}>
                <DialogContent className="max-w-xl bg-gray-950 border-gray-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <PlusCircle className="w-5 h-5 text-emerald-500" />
                            Carga Rápida de Comprobante
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Crea la factura y su {selectedTx?.monto ? (selectedTx.monto < 0 ? 'Orden de Pago' : 'Recibo') : 'documento'} en un solo paso.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedTx && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 my-2 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-1">Monto a Documentar</p>
                                <p className="text-sm font-bold text-white truncate max-w-[300px]">{selectedTx.descripcion}</p>
                            </div>
                            <p className={`text-xl font-black ${selectedTx.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(selectedTx.monto)}
                            </p>
                        </div>
                    )}

                    <div className="space-y-4 py-4">
                        {/* Step 1: Select Entity */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">
                                {selectedTx?.monto && selectedTx.monto < 0 ? 'Proveedor' : 'Cliente'}
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre o CUIT..."
                                    value={searchEntity}
                                    onChange={(e) => setSearchEntity(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                {loadingEntities ? (
                                    <div className="py-8 text-center text-gray-600">
                                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                                        Cargando agenda...
                                    </div>
                                ) : entities.filter(e =>
                                    e.razon_social.toLowerCase().includes(searchEntity.toLowerCase()) ||
                                    e.cuit.includes(searchEntity)
                                ).slice(0, 10).map(entity => (
                                    <button
                                        key={entity.id}
                                        onClick={() => setSelectedEntityId(entity.id)}
                                        className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${selectedEntityId === entity.id
                                            ? 'border-emerald-500 bg-emerald-500/10'
                                            : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                                            }`}
                                    >
                                        <div>
                                            <p className="text-sm font-bold text-white">{entity.razon_social}</p>
                                            <p className="text-[10px] text-gray-500">{entity.cuit}</p>
                                        </div>
                                        {selectedEntityId === entity.id && <Check className="w-4 h-4 text-emerald-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Step 2: Invoice Number */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Número de Factura</label>
                            <input
                                type="text"
                                placeholder="Ej: 0001-00001234"
                                value={invoiceNumber}
                                onChange={(e) => setInvoiceNumber(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setIsQuickLoading(false)}
                            className="text-gray-400"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleQuickCreate}
                            disabled={isSubmitting || !selectedEntityId || !invoiceNumber}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                            )}
                            Confirmar Documentación
                        </Button>
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
