'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Search, ExternalLink, Tag, FileDown, Loader2, X, PlusCircle, Check, FileText, DollarSign, Pencil } from 'lucide-react'
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
    categoria?: string
    movimiento_id?: string
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
    const [globalAiSuggestions, setGlobalAiSuggestions] = useState<any[]>([])
    const [suggestedMovements, setSuggestedMovements] = useState<any[]>([])
    const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([])
    const [isFiltered, setIsFiltered] = useState(false)
    const [showAllInvoices, setShowAllInvoices] = useState(false)
    const [allFetchedInvoices, setAllFetchedInvoices] = useState<any[]>([])
    const [processResidualAsGasto, setProcessResidualAsGasto] = useState(false)
    const [residualCategory, setResidualCategory] = useState('Gastos Bancarios')

    // Mixed Payment States
    const [secondaryPaymentEnabled, setSecondaryPaymentEnabled] = useState(false)
    const [secondaryPaymentMethod, setSecondaryPaymentMethod] = useState<'efectivo' | 'cheque' | 'retencion'>('efectivo')
    const [secondaryCheckData, setSecondaryCheckData] = useState({ numero: '', banco: '', vencimiento: '' })

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

    useState(() => {
        fetchGlobalSuggestions()
    })

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
        setIsFiltered(false)
        try {
            const orgId = (transactions[0] as any)?.organization_id
            const typeFilter = txToMatch.monto > 0 ? 'factura_venta' : 'factura_compra'
            const txAmount = Math.abs(txToMatch.monto)
            const desc = txToMatch.descripcion.toUpperCase()

            // 1. Fetch Invoices
            const { data: invoices, error: invError } = await supabase
                .from('comprobantes')
                .select('*')
                .eq('organization_id', orgId)
                .in('estado', ['pendiente', 'parcial'])
                .in('tipo', txToMatch.monto > 0 ? ['factura_venta', 'nota_debito', 'ingreso_vario'] : ['factura_compra', 'nota_credito', 'egreso_vario'])
                .order('fecha_vencimiento', { ascending: true })

            if (invError) throw invError

            let activeInvoices = invoices || []
            setAllFetchedInvoices(activeInvoices)

            // Extract meaningful words from description (e.g., "CONSTRUCTORA DEL SUR")
            const skipWords = ['ACREDITACION', 'TRANSFERENCIA', 'REF', 'TRF-', 'PAGO', 'COBRO', 'ESTO', 'TEST-']
            const words = desc.split(/\s+/).filter(w => w.length > 3 && !skipWords.some(s => w.includes(s)))

            if (!showAllInvoices && activeInvoices.length > 0 && words.length > 0) {
                // Try to see if any invoice belongs to an entity mentioned in the description
                const filtered = activeInvoices.filter(inv => {
                    const razonSocial = (inv.razon_social_socio || '').toUpperCase()
                    return words.some(word => razonSocial.includes(word))
                })

                // If we found specific matches, we ONLY show those to avoid clutter
                if (filtered.length > 0) {
                    activeInvoices = filtered
                    setIsFiltered(true)
                }
            }

            setAvailableInvoices(activeInvoices)

            // 2. Fetch Orphan Movements (Recibos/OPs already created but unlinked)
            const { data: linkedTx } = await supabase.from('transacciones').select('movimiento_id').not('movimiento_id', 'is', null)
            const linkedIds = new Set(linkedTx?.map(t => t.movimiento_id) || [])

            const { data: instruments, error: insError } = await supabase
                .from('instrumentos_pago')
                .select('*, movimientos_tesoreria(*, entidades(razon_social))')
                .lte('monto', txAmount * 1.2) // Increased tolerance to 20% for manual suggestions

            if (!insError && instruments) {
                let unlinkedMovs = instruments
                    .filter(ins => !linkedIds.has(ins.movimiento_id))
                    .filter(ins => {
                        const isIngreso = txToMatch.monto > 0
                        return isIngreso ? ins.movimientos_tesoreria?.tipo === 'cobro' : ins.movimientos_tesoreria?.tipo === 'pago'
                    })

                // Deep Match movements by name keywords or exact amount
                if (words.length > 0) {
                    const filteredMovs = unlinkedMovs.filter(ins => {
                        const obs = (ins.movimientos_tesoreria?.observaciones || '').toUpperCase()
                        const razonSocial = (ins.movimientos_tesoreria?.entidades?.razon_social || '').toUpperCase()
                        const isExactAmount = Math.abs(Number(ins.monto) - txAmount) < 0.05

                        return words.some(word => obs.includes(word) || razonSocial.includes(word)) || isExactAmount
                    })
                    if (filteredMovs.length > 0) unlinkedMovs = filteredMovs
                }

                setSuggestedMovements(unlinkedMovs.map(ins => ({
                    id: ins.movimiento_id,
                    fecha: ins.movimientos_tesoreria?.fecha,
                    monto: ins.monto,
                    observaciones: ins.movimientos_tesoreria?.observaciones,
                    numero: ins.movimientos_tesoreria?.numero,
                    entidad: ins.movimientos_tesoreria?.entidad_id,
                    razonSocial: ins.movimientos_tesoreria?.entidades?.razon_social,
                    tipo: ins.movimientos_tesoreria?.tipo
                })))
            }

            // 3. Fetch AI Suggestions
            try {
                const res = await fetch('/api/reconcile/suggestions')
                if (res.ok) {
                    const suggData = await res.json()
                    const txSuggestions = (suggData.suggestions || []).filter((s: any) => s.transId === txToMatch.id)
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
                .eq('organization_id', orgId)

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
        if (!selectedTx || (selectedInvoiceIds.length === 0 && selectedMovementIds.length === 0)) return
        setIsSubmitting(true)
        try {
            const orgId = (transactions[0] as any)?.organization_id
            const isCobro = selectedTx.monto > 0

            const totalBankAmount = Math.abs(selectedTx.monto)
            const previouslyUsed = Number(selectedTx.monto_usado || 0)
            const availableAmount = totalBankAmount - previouslyUsed

            // CASE 1: Direct link to existing Movements (Recibos/OPs) - Batch Support
            if (selectedMovementIds.length > 0) {
                // If there are multiple, we assume they all belong to this transaction
                // We link each movement_id to the transaction in separate updates or a single one if it's many-to-one
                // Note: Currently transaction table has movement_id (1-to-1).
                // If the user selects multiple, it's a "Batch" (Lote).
                // Contablemente, si es un lote, vinculamos el primero y registramos los otros en el metadata,
                // o creamos un movimiento contenedor si fuera necesario. 
                // Pero lo más limpio para el usuario es vincular el 'movimiento_id' principal.

                // TODO: Support many-to-one mapping in DB if required. For now, we link the first 
                // and mark the others as linked in metadata.
                const { error: txLinkErr } = await supabase
                    .from('transacciones')
                    .update({
                        movimiento_id: selectedMovementIds[0], // Primary link
                        estado: 'conciliado',
                        monto_usado: totalBankAmount, // Total match
                        metadata: {
                            ...((selectedTx as any).metadata || {}),
                            linked_at: new Date().toISOString(),
                            link_method: 'batch_match',
                            all_movement_ids: selectedMovementIds
                        }
                    })
                    .eq('id', selectedTx.id)

                if (txLinkErr) throw txLinkErr

                // Also update other movements to be "conciliados" if they have that flag
                // (Logic depends on business rules, for now linking the TX is enough)

                toast.success(`${selectedMovementIds.length} movimientos vinculados con el banco.`)
                setIsConciliating(false)
                setSelectedMovementIds([])
                setSelectedInvoiceIds([])
                if (onRefresh) onRefresh()
                return
            }

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
            let totalToPayInInvoices = invoices.reduce((acc, inv) => acc + Number(inv.monto_pendiente), 0)
            let totalAppliedFromBank = Math.min(availableAmount, totalToPayInInvoices)

            // 2. Create Movimiento Tesoreria (Header)
            // Total should be the SUM of all instruments (Bank + Secondary)
            const shortfall = totalToPayInInvoices - availableAmount
            const secondaryAmount = secondaryPaymentEnabled && shortfall > 0.05 ? shortfall : 0
            const totalMovementMonto = totalAppliedFromBank + secondaryAmount

            const { data: movimiento, error: movError } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: entity.id,
                    tipo: isCobro ? 'cobro' : 'pago',
                    fecha: selectedTx.fecha,
                    monto_total: totalMovementMonto,
                    observaciones: `CONCILIACIÓN MANUAL MIXTA: ${selectedTx.descripcion}${secondaryPaymentEnabled ? ' (+ ' + secondaryPaymentMethod.toUpperCase() + ')' : ''}`,
                    metadata: {
                        transaccion_id: selectedTx.id,
                        manual: true,
                        mixed: secondaryPaymentEnabled,
                        secondary_method: secondaryPaymentEnabled ? secondaryPaymentMethod : null
                    }
                })
                .select()
                .single()

            if (movError) throw movError

            // 3. Create Instrument 1 (The bank movement)
            const { error: insError } = await supabase
                .from('instrumentos_pago')
                .insert({
                    movimiento_id: movimiento.id,
                    metodo: 'transferencia',
                    monto: totalAppliedFromBank,
                    fecha_disponibilidad: selectedTx.fecha,
                    referencia: selectedTx.descripcion,
                    estado: 'acreditado'
                })

            if (insError) throw insError

            // 3.1. Create Instrument 2 (Secondary Method if enabled)
            if (secondaryPaymentEnabled && secondaryAmount > 0) {
                const { error: secInsError } = await supabase
                    .from('instrumentos_pago')
                    .insert({
                        movimiento_id: movimiento.id,
                        metodo: secondaryPaymentMethod,
                        monto: secondaryAmount,
                        fecha_disponibilidad: selectedTx.fecha,
                        banco: secondaryPaymentMethod === 'cheque' ? secondaryCheckData.banco : null,
                        referencia: secondaryPaymentMethod === 'cheque' ? `CH-${secondaryCheckData.numero}` : 'PAGO MIXTO',
                        estado: (secondaryPaymentMethod === 'efectivo' || secondaryPaymentMethod === 'retencion') ? 'acreditado' : 'pendiente'
                    })
                if (secInsError) throw secInsError
            }

            // Apply to each invoice
            let remainingToApply = totalMovementMonto
            for (const invoice of invoices) {
                const amountToApply = Math.min(Number(invoice.monto_pendiente), remainingToApply)
                if (amountToApply <= 0) continue

                // 4. Create Application (Link Invoice to OP)
                const { error: appError } = await supabase
                    .from('aplicaciones_pago')
                    .insert({
                        movimiento_id: movimiento.id,
                        comprobante_id: invoice.id,
                        monto_aplicado: amountToApply
                    })

                if (appError) throw appError

                // 5. Update Invoice (comprobante)
                const newPendiente = Number(invoice.monto_pendiente) - amountToApply
                const { error: invError } = await supabase
                    .from('comprobantes')
                    .update({
                        monto_pendiente: Math.max(0, newPendiente),
                        estado: newPendiente <= 0.05 ? 'pagado' : 'parcial',
                        metadata: {
                            ...(invoice.metadata || {}),
                            reconciled_at: new Date().toISOString(),
                            transaccion_id: selectedTx.id,
                            is_mixed: secondaryPaymentEnabled
                        }
                    })
                    .eq('id', invoice.id)

                if (invError) throw invError
                remainingToApply -= amountToApply
            }

            // 6. Handle Residual (If requested and NOT already using a secondary payment)
            const finalShortfall = totalToPayInInvoices - availableAmount
            if (!secondaryPaymentEnabled && processResidualAsGasto && finalShortfall < -0.05) {
                const residualAmount = Math.abs(finalShortfall)
                const isIngreso = selectedTx.monto > 0
                const claseDoc = isIngreso ? 'NCB' : 'NDB'
                const voucherType = isIngreso ? 'ncb_bancaria' : 'ndb_bancaria'

                // 6.1. Ensure "Gastos Varios / Banco" entity exists
                let { data: expEntity } = await supabase
                    .from('entidades')
                    .select('id, cuit, razon_social')
                    .eq('organization_id', orgId)
                    .eq('razon_social', 'Gastos Varios / Otros')
                    .maybeSingle()

                if (!expEntity) {
                    const { data: newEntity } = await supabase
                        .from('entidades')
                        .insert({
                            organization_id: orgId,
                            razon_social: 'Gastos Varios / Otros',
                            cuit: '00000000000',
                            categoria: 'proveedor'
                        })
                        .select()
                        .single()
                    expEntity = newEntity
                }

                if (expEntity) {
                    // 6.2 Create NDB/NCB for the residual
                    const { data: resMov } = await supabase
                        .from('movimientos_tesoreria')
                        .insert({
                            organization_id: orgId,
                            entidad_id: expEntity.id,
                            tipo: isIngreso ? 'cobro' : 'pago',
                            clase_documento: claseDoc,
                            categoria: residualCategory,
                            fecha: selectedTx.fecha,
                            monto_total: residualAmount,
                            observaciones: `[${claseDoc}] AJUSTE RESIDUAL CONCILIACIÓN: ${selectedTx.descripcion}`,
                            metadata: { transaccion_id: selectedTx.id, is_residual: true }
                        })
                        .select()
                        .single()

                    if (resMov) {
                        const { data: resVoucher } = await supabase
                            .from('comprobantes')
                            .insert({
                                organization_id: orgId,
                                entidad_id: expEntity.id,
                                tipo: voucherType,
                                numero: resMov.numero,
                                cuit_socio: expEntity.cuit,
                                razon_social_socio: expEntity.razon_social,
                                fecha_emision: selectedTx.fecha,
                                fecha_vencimiento: selectedTx.fecha,
                                monto_total: residualAmount,
                                monto_pendiente: 0,
                                estado: 'pagado'
                            })
                            .select()
                            .single()

                        if (resVoucher) {
                            await supabase.from('aplicaciones_pago').insert({
                                movimiento_id: resMov.id,
                                comprobante_id: resVoucher.id,
                                monto_aplicado: residualAmount
                            })

                            await supabase.from('instrumentos_pago').insert({
                                movimiento_id: resMov.id,
                                metodo: 'transferencia',
                                monto: residualAmount,
                                fecha_disponibilidad: selectedTx.fecha,
                                referencia: `AJUSTE: ${selectedTx.descripcion}`,
                                estado: 'acreditado'
                            })
                        }
                    }
                    totalAppliedFromBank += residualAmount
                }
            }

            // 7. Update Bank Transaction
            const newMontoUsado = previouslyUsed + totalAppliedFromBank
            const isFullyUsed = newMontoUsado >= totalBankAmount - 0.05

            const { error: txError } = await supabase
                .from('transacciones')
                .update({
                    movimiento_id: movimiento.id,
                    estado: isFullyUsed ? 'conciliado' : 'parcial',
                    monto_usado: newMontoUsado
                })
                .eq('id', selectedTx.id)
                .eq('organization_id', orgId)

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

            // 4. Create Movimiento Tesoreria (NDB/NCB) - The financial event
            // We create this FIRST to get the automatic correlative numbering (NDB-XXXXXX)
            const { data: movimiento, error: movError } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: entity.id,
                    tipo: isIngreso ? 'cobro' : 'pago',
                    clase_documento: claseDoc,
                    numero: selectedTx.referencia || null, // Will trigger get_next_treasury_number if null
                    categoria: category,
                    fecha: selectedTx.fecha,
                    monto_total: totalMonto,
                    moneda: 'ARS',
                    observaciones: isSplitting
                        ? `[${claseDoc}] TRANSACCIÓN: ${selectedTx.descripcion} | DESGLOSE: ${category} / ${splitConcept}`
                        : `[${claseDoc}] TRANSACCIÓN: ${selectedTx.descripcion} | CATEGORIZACIÓN: ${category}`,
                    metadata: metadata
                })
                .select()
                .single()

            if (movError) throw movError

            // 5. Create Comprobante (Voucher) - The supporting document
            // We inherit the number generated by the movement
            const { data: voucher, error: vError } = await supabase
                .from('comprobantes')
                .insert({
                    organization_id: orgId,
                    entidad_id: entity.id, // Linked to entity
                    tipo: voucherType,
                    numero: movimiento.numero, // INHERIT number from movement
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
                .eq('organization_id', orgId)

            if (txError) throw txError

            // Update local state to reflect conciliation immediately in UI
            setCategorizedTxIds(prev => [...prev, selectedTx.id])
            selectedTx.estado = 'conciliado'
            selectedTx.movimiento_id = movimiento.id
            selectedTx.categoria = category

            toast.success(`${claseDoc} generada y registrada en bancos`)
            setIsCategorizing(false)
            setIsSplitting(false)
            setSplitAmount('0')
            setSelectedTx(null)
            if (onRefresh) onRefresh()
        } catch (error: any) {
            console.error('Error in direct banking accounting:', error)
            toast.error('Error al generar la nota bancaria: ' + (error.message || 'Error desconocido'))
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
                    </CardTitle>
                    <p className="text-xs text-gray-400 mt-1">Movimientos bancarios pendientes de vinculación con comprobantes.</p>
                </div>
                <div className="flex items-center gap-3">
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
                if (!open) setIsSplitting(false)
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
                        {suggestedMovements.length > 0 && (
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
                                                    if (newSelected.length > 0) setSelectedInvoiceIds([])
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
                                                            {mov.tipo?.toUpperCase()} N° {mov.numero || 'S/N'} {mov.razonSocial ? ` - ${mov.razonSocial}` : ''}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500">
                                                            Referencia: {mov.observaciones || 'Sin observaciones'} • Fecha: {new Date(mov.fecha).toLocaleDateString()}
                                                        </p>
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
                                <div className="mt-4 flex items-center gap-2">
                                    <div className="h-px flex-1 bg-gray-800"></div>
                                    <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">O elegir comprobantes sueltos</span>
                                    <div className="h-px flex-1 bg-gray-800"></div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    Comprobantes Sugeridos {aiSuggestions.length > 0 && <span className="ml-2 text-amber-500">✨ IA Sugiere {aiSuggestions.length} match(es)</span>}
                                </p>
                                {isFiltered && (
                                    <Badge variant="outline" className="text-[9px] font-black h-4 bg-blue-500/10 text-blue-400 border-blue-500/20 px-1.5 leading-none">
                                        DETECCIÓN INTELIGENTE
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                {isFiltered && (
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-[10px] text-gray-500 hover:text-blue-400 font-bold uppercase tracking-tighter"
                                        onClick={() => {
                                            setAvailableInvoices(allFetchedInvoices)
                                            setIsFiltered(false)
                                        }}
                                    >
                                        Ver todos ({allFetchedInvoices.length})
                                    </Button>
                                )}
                                {selectedInvoiceIds.length > 0 && (
                                    <p className="text-xs text-blue-400 font-bold uppercase">
                                        {selectedInvoiceIds.length} seleccionado(s)
                                    </p>
                                )}
                            </div>
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

                    {/* Summary and Residual Assistant */}
                    {selectedTx && (
                        <div className="mt-4 p-4 bg-gray-900/60 border border-gray-800 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {(() => {
                                const noSelection = selectedInvoiceIds.length === 0 && selectedMovementIds.length === 0

                                const selectedInvoiceTotal = availableInvoices
                                    .filter(i => selectedInvoiceIds.includes(i.id))
                                    .reduce((acc, curr) => acc + Number(curr.monto_pendiente), 0)

                                const selectedMovementTotal = suggestedMovements
                                    .filter(m => selectedMovementIds.includes(m.id))
                                    .reduce((acc, curr) => acc + Number(curr.monto), 0)

                                const selectedTotal = selectedInvoiceTotal + selectedMovementTotal

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
                                disabled={isSubmitting || (selectedInvoiceIds.length === 0 && selectedMovementIds.length === 0)}
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
