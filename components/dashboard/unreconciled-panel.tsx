'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, AlertTriangle, CheckCircle2, Search, ExternalLink, Tag, FileDown, Loader2, X, PlusCircle, Check, FileText, DollarSign, Pencil, Trash2, Sparkles, HelpCircle } from 'lucide-react'
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
    cuenta_id?: string
    metadata?: any
}

interface UnreconciledPanelProps {
    orgId: string
    transactions: Transaction[]
    onRefresh?: () => void
    categorizedTxIds?: string[]
    setCategorizedTxIds?: React.Dispatch<React.SetStateAction<string[]>>
}

export function UnreconciledPanel({ 
    orgId, 
    transactions, 
    onRefresh,
    categorizedTxIds: externalCategorizedTxIds,
    setCategorizedTxIds: externalSetCategorizedTxIds
}: UnreconciledPanelProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [isCategorizing, setIsCategorizing] = useState(false)
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [internalCategorizedTxIds, internalSetCategorizedTxIds] = useState<string[]>([])
    
    // Support both internal and external state
    const categorizedTxIds = externalCategorizedTxIds || internalCategorizedTxIds
    const setCategorizedTxIds = externalSetCategorizedTxIds || internalSetCategorizedTxIds
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
    const [suggestedInvoices, setSuggestedInvoices] = useState<any[]>([])
    const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([])
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
    const [loadingInvoices, setLoadingInvoices] = useState(false)

    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(25)
    const [residualCategory, setResidualCategory] = useState('Gastos Bancarios')
    const [processResidualAsGasto, setProcessResidualAsGasto] = useState(false)

    const filtered = transactions
        .filter(t => (t.estado === 'pendiente' || t.estado === 'parcial') && !categorizedTxIds.includes(t.id))
        .filter(t =>
            t.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.monto.toString().includes(searchTerm)
        )

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
            const cuitToFilter = txToMatch.cuit_origen || txToMatch.cuit_destino

            // 2. Fetch Treasury Movements (Recibos/OPs) candidates
            const { data: linkedTxData } = await supabase.from('transacciones').select('movimiento_id').not('movimiento_id', 'is', null)
            const linkedMovIds = linkedTxData?.map(t => t.movimiento_id).filter(Boolean) || []

            let movQuery = supabase
                .from('movimientos_tesoreria')
                .select('*, entidades!inner(razon_social, cuit), aplicaciones_pago(comprobantes(nro_factura, tipo, id)), instrumentos_pago(*)')
                .eq('organization_id', orgId)
                .eq('tipo', txToMatch.monto > 0 ? 'cobro' : 'pago')
                .not('id', 'in', `(${linkedMovIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)

            if (cuitToFilter) {
                movQuery = movQuery.eq('entidades.cuit', cuitToFilter)
            }

            const { data: movements, error: movsError } = await movQuery

            if (!movsError && movements) {
                const uniqueMovs = movements.map(mov => {
                    const instrumentsTotal = mov.instrumentos_pago?.reduce((acc: number, curr: any) => acc + Number(curr.monto), 0) || 0
                    
                    return {
                        id: mov.id,
                        fecha: mov.fecha,
                        monto: instrumentsTotal || Number(mov.monto), // Use movement total if no instruments
                        observaciones: mov.observaciones,
                        nro_comprobante: mov.nro_comprobante,
                        entidad: mov.entidad_id,
                        razonSocial: (mov.entidades as any)?.razon_social,
                        tipo: mov.tipo,
                        aplicaciones: mov.aplicaciones_pago || [],
                        instrumentos: mov.instrumentos_pago || [],
                        isMissingInstruments: (mov.instrumentos_pago?.length || 0) === 0,
                        isMissingInvoices: (mov.aplicaciones_pago?.length || 0) === 0
                    }
                })

                // 4. Transform Map to Array and SORT by relevance to the transaction
                const suggestedArray = Array.from(uniqueMovs.values())
                
                // Sort logic: 
                // 1. Same amount (rounded)
                // 2. Proximity in days (abs difference)
                // 3. Absolute amount difference
                const sortedMovs = suggestedArray.sort((a, b) => {
                    const diffA = Math.abs(ROUND_TO_0(a.monto) - txAmount)
                    const diffB = Math.abs(ROUND_TO_0(b.monto) - txAmount)
                    
                    if (diffA !== diffB) return diffA - diffB
                    
                    const dateDiffA = Math.abs(new Date(a.fecha).getTime() - new Date(txToMatch.fecha).getTime())
                    const dateDiffB = Math.abs(new Date(b.fecha).getTime() - new Date(txToMatch.fecha).getTime())
                    
                    return dateDiffA - dateDiffB
                })

                setSuggestedMovements(sortedMovs)
            } else {
                setSuggestedMovements([])
            }

            // 5. Fetch Pending Invoices (Comprobantes)
            // If tx.monto > 0 (Inflow) -> Look for factura_venta
            // If tx.monto < 0 (Outflow) -> Look for factura_compra
            const invType = txToMatch.monto > 0 ? 'factura_venta' : 'factura_compra'
            let invQuery = supabase
                .from('comprobantes')
                .select('*')
                .eq('organization_id', orgId)
                .eq('tipo', invType)
                .gt('monto_pendiente', 0)

            if (cuitToFilter) {
                invQuery = invQuery.eq('cuit_socio', cuitToFilter)
            }

            const { data: pendingInvoices, error: invError } = await invQuery.order('fecha_vencimiento', { ascending: true })

            if (!invError && pendingInvoices) {
                // Sort invoices by proximity to transaction amount and date
                const sortedInvoices = pendingInvoices.sort((a, b) => {
                    const diffA = Math.abs(Number(a.monto_pendiente) - txAmount)
                    const diffB = Math.abs(Number(b.monto_pendiente) - txAmount)
                    if (diffA !== diffB) return diffA - diffB
                    
                    const dateDiffA = Math.abs(new Date(a.fecha_emision).getTime() - new Date(txToMatch.fecha).getTime())
                    const dateDiffB = Math.abs(new Date(b.fecha_emision).getTime() - new Date(txToMatch.fecha).getTime())
                    return dateDiffA - dateDiffB
                })
                setSuggestedInvoices(sortedInvoices)
            } else {
                setSuggestedInvoices([])
            }
        } catch (error) {
            console.error('Error fetching suggested movements/invoices:', error)
            toast.error('Error al cargar datos para conciliación')
        } finally {
            setLoadingInvoices(false)
        }
    }


    const handleConciliate = async () => {
        if (!selectedTx || (selectedMovementIds.length === 0 && selectedInvoiceIds.length === 0)) return
        setIsSubmitting(true)
        try {
            const currentOrgId = selectedTx.organization_id || orgId
            const totalBankAmount = Math.abs(selectedTx.monto)
            const previouslyUsed = Number(selectedTx.monto_usado || 0)
            const availableAmount = totalBankAmount - previouslyUsed

            const selectedTotalMovements = suggestedMovements
                .filter(m => selectedMovementIds.includes(m.id))
                .reduce((acc, curr) => acc + Number(curr.monto), 0)

            // If using Fast Track (invoice), the "selected total" is the full bank amount (or what we're about to generate)
            const selectedTotal = selectedInvoiceIds.length > 0 
                ? availableAmount 
                : selectedTotalMovements

            const difference = availableAmount - selectedTotal
            const shortfall = selectedTotal - availableAmount

            let finalMovementId = selectedMovementIds[0]

            // 0. If an invoice was selected (Fast Track), generate the Receipt/OP first
            if (selectedInvoiceIds.length > 0) {
                const targetInvoice = suggestedInvoices.find(inv => inv.id === selectedInvoiceIds[0])
                if (!targetInvoice) throw new Error("Factura seleccionada no encontrada")

                const movementType = selectedTx.monto > 0 ? 'cobro' : 'pago'
                const movementNumber = `${movementType === 'cobro' ? 'REC' : 'OP'}-AUTO-${selectedTx.id.split('-')[0].toUpperCase()}`

                // 0.1 Create Treasury Movement
                const { data: newMov, error: movErr } = await supabase
                    .from('movimientos_tesoreria')
                    .insert({
                        organization_id: currentOrgId,
                        entidad_id: targetInvoice.entidad_id,
                        tipo: movementType,
                        fecha: selectedTx.fecha,
                        monto: Math.abs(selectedTx.monto),
                        estado: 'acreditado',
                        nro_comprobante: movementNumber,
                        moneda: 'ARS',
                        descripcion: `Generado automáticamente desde Factura ${targetInvoice.numero} por conciliación bancaria`
                    })
                    .select()
                    .single()

                if (movErr) throw movErr
                finalMovementId = newMov.id

                // 0.2 Create Application
                const { error: appErr } = await supabase
                    .from('aplicaciones_pago')
                    .insert({
                        organization_id: currentOrgId,
                        comprobante_id: targetInvoice.id,
                        movimiento_id: newMov.id,
                        monto: Math.abs(selectedTx.monto),
                        fecha: selectedTx.fecha
                    })

                if (appErr) throw appErr

                // 0.3 Update Invoice status if fully paid? 
                // (Already handled by standard SQL triggers/logic usually, but let's be explicit if needed)
            }

            // 0.4 Handle Missing Instruments in treasury (Auto-create them)
            const movementsToRepair = suggestedMovements.filter(m => 
                selectedMovementIds.includes(m.id) && m.isMissingInstruments
            )

            for (const movToRepair of movementsToRepair) {
                const { error: insRepErr } = await supabase.from('instrumentos_pago').insert({
                    organization_id: currentOrgId,
                    movimiento_id: movToRepair.id,
                    metodo: 'transferencia',
                    monto: movToRepair.monto,
                    estado: 'acreditado',
                    detalle_referencia: selectedTx.referencia || 'VINC_BANCO_AUTO',
                    fecha_disponibilidad: selectedTx.fecha
                })
                if (insRepErr) console.warn("Could not auto-create missing instrument:", insRepErr)
            }

            // 1. Process Residual as Gasto/Ingreso if enabled
            if (processResidualAsGasto && difference > 0.05) {
                // Determine entity for bank notes
                let { data: bankEntity } = await supabase
                    .from('entidades')
                    .select('id, cuit, razon_social')
                    .eq('organization_id', currentOrgId)
                    .eq('razon_social', 'Gastos Varios / Otros')
                    .maybeSingle()

                if (!bankEntity) {
                    const { data: newEnt } = await supabase.from('entidades').insert({
                        organization_id: currentOrgId,
                        razon_social: 'Gastos Varios / Otros',
                        cuit: '00000000000',
                        categoria: 'proveedor'
                    }).select().single()
                    bankEntity = newEnt
                }

                if (bankEntity) {
                    const noteType = selectedTx.monto > 0 ? 'ncb_bancaria' : 'ndb_bancaria'
                    const bankNoteNumber = `BN-RESID-${selectedTx.id.split('-')[0].toUpperCase()}`

                    await supabase.from('comprobantes').insert({
                        organization_id: currentOrgId,
                        entidad_id: bankEntity.id,
                        tipo: noteType,
                        nro_factura: bankNoteNumber,
                        cuit_socio: bankEntity.cuit,
                        razon_social_entidad: bankEntity.razon_social,
                        fecha_emision: selectedTx.fecha,
                        fecha_vencimiento: selectedTx.fecha,
                        monto_total: Math.abs(difference),
                        monto_pendiente: 0,
                        estado: 'conciliado',
                        concepto: residualCategory,
                        metadata: {
                            bank_transaction_id: selectedTx.id,
                            is_residual_note: true,
                            cuenta_id: selectedTx.cuenta_id
                        }
                    })
                }
            }

            // 2. Process Mixed Payment (Secondary Instrument) if enabled
            if (secondaryPaymentEnabled && shortfall > 0.05) {
                // Create reaching instrument for the shortfall
                await supabase.from('instrumentos_pago').insert({
                    organization_id: currentOrgId,
                    movimiento_id: selectedMovementIds[0],
                    metodo: secondaryPaymentMethod,
                    monto: shortfall,
                    estado: secondaryPaymentMethod === 'efectivo' ? 'acreditado' : 'pendiente',
                    banco: secondaryCheckData.banco || null,
                    detalle_referencia: secondaryCheckData.numero || 'PAGO_MIXTO_SEC',
                    fecha_disponibilidad: secondaryCheckData.vencimiento || new Date().toISOString().split('T')[0]
                })
            }

            // 3. Update Bank Transaction
            const isFullyUsed = Math.abs(difference) <= 0.05 || processResidualAsGasto
            const { error: txLinkErr } = await supabase
                .from('transacciones')
                .update({
                    movimiento_id: finalMovementId,
                    estado: isFullyUsed ? 'conciliado' : 'parcial',
                    monto_usado: isFullyUsed ? totalBankAmount : (previouslyUsed + selectedTotal),
                    metadata: {
                        ...(selectedTx.metadata || {}),
                        linked_at: new Date().toISOString(),
                        link_method: selectedInvoiceIds.length > 0 ? 'invoice_fast_track_v1' : 'batch_match_with_assistant',
                        all_movement_ids: selectedInvoiceIds.length > 0 ? [finalMovementId] : selectedMovementIds,
                        residual_processed: processResidualAsGasto,
                        mixed_payment: secondaryPaymentEnabled
                    }
                })
                .eq('id', selectedTx.id)

            if (txLinkErr) throw txLinkErr

            // 4. Mark instruments as accredited
            await supabase
                .from('instrumentos_pago')
                .update({ estado: 'acreditado' })
                .in('movimiento_id', selectedInvoiceIds.length > 0 ? [finalMovementId] : selectedMovementIds)

            // 5. Propagate conciliation state (standard logic)
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

            toast.success(`Conciliación completada exitosamente.`)
            
            // Locally hide for immediate feedback
            setCategorizedTxIds(prev => [...prev, selectedTx.id])

            // Delay refresh to allow DB propagation
            setTimeout(() => {
                console.log("Executing post-conciliation refresh...")
                if (onRefresh) onRefresh()
            }, 1200)

            setIsConciliating(false)
            setProcessResidualAsGasto(false)
            setSecondaryPaymentEnabled(false)
            setSelectedMovementIds([])
        } catch (error: any) {
            console.error('Error in conciliation:', error)
            toast.error('Error al realizar la conciliación: ' + error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const totalPages = Math.ceil(filtered.length / itemsPerPage)
    const paginatedUnreconciled = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

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

            // 1. Ensure "Gastos Varios / Otros" entity exists
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

            // 4. Check if voucher already exists to avoid duplicates
            let voucher;
            const { data: existingVoucher } = await supabase
                .from('comprobantes')
                .select('id')
                .or(`metadata->>bank_transaction_id.eq.${selectedTx.id},metadata->>transaccion_id.eq.${selectedTx.id}`)
                .maybeSingle()

            if (existingVoucher) {
                voucher = existingVoucher
                console.log("Voucher already exists, linking existing one:", voucher.id)
            } else {
                // Create Comprobante (Voucher)
                const bankNoteNumber = `BN-${selectedTx.id.split('-')[0].toUpperCase()}-${new Date().getTime().toString().slice(-4)}`

                const { data: newVoucher, error: vError } = await supabase
                    .from('comprobantes')
                    .insert({
                        organization_id: currentOrgId,
                        entidad_id: entity.id,
                        tipo: voucherType,
                        nro_factura: selectedTx.referencia || bankNoteNumber,
                        cuit_socio: entity.cuit,
                        razon_social_entidad: entity.razon_social,
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
                            cuenta_id: selectedTx.cuenta_id,
                            categoria_principal: category
                        }
                    })
                    .select()
                    .single()

                if (vError) throw vError
                if (!newVoucher) throw new Error("No se pudo generar el comprobante bancario")
                voucher = newVoucher
            }

            // 5. Update Bank Transaction (Ensure it's reconciled)
            // Fetch latest tx just in case to avoid lost updates
            const { data: latestTx, error: latestTxErr } = await supabase
                .from('transacciones')
                .select('metadata, estado, organization_id')
                .eq('id', selectedTx.id)
                .single()

            if (latestTxErr) {
                console.error("Error fetching latest transaction state:", latestTxErr);
            }
            console.log("Latest transaction state from DB:", { latestTx, error: latestTxErr });

            const currentMetadata = latestTx?.metadata || {}
            console.log("Attempting to update transaction:", { id: selectedTx.id, currentMetadata, category });

            const { data: { user } } = await supabase.auth.getUser();
            const { count: memberCount, error: memberErr } = await supabase
                .from('organization_members')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', latestTx?.organization_id || orgId)
                .eq('user_id', user?.id || '');

            console.log("Current session context:", { 
                userId: user?.id, 
                orgId, 
                latestTxOrg: latestTx?.organization_id,
                isMember: memberCount && memberCount > 0,
                memberErr
            });

            const { data: rpcResult, error: updateError } = await supabase.rpc('categorize_tx_v1', {
                p_tx_id: selectedTx.id,
                p_voucher_id: voucher.id,
                p_monto_usado: Math.abs(selectedTx.monto),
                p_metadata: {
                    ...(currentMetadata || {}),
                    categoria_transaccion: category,
                    bank_note_id: voucher.id,
                    reconciled_at: new Date().toISOString(),
                    link_method: 'direct_note_v4_rpc',
                    generated_voucher_id: voucher.id,
                    category: category,
                    original_desc: selectedTx.descripcion
                },
                p_organization_id: currentOrgId
            })

            const count = (rpcResult as any)?.success ? 1 : 0
            const rpcErrorMsg = (rpcResult as any)?.error || updateError?.message

            console.log("Atomic update executed for tx:", selectedTx.id, "Error:", updateError, "Count:", count);

            if (updateError || count === 0) {
                console.error("Critical error updating transaction (RPC):", updateError || rpcErrorMsg || "No matched rows");
                throw new Error(`Error BD (RPC): ${updateError?.message || rpcErrorMsg || ("No se pudo actualizar (Matched: " + count + "). Membresía: " + (memberCount && memberCount > 0 ? 'OK' : 'NO'))}`);
            }

            console.log("Transaction successfully marked as reconciled:", selectedTx.id)

            // Update local state for immediate feedback
            setCategorizedTxIds(prev => [...prev, selectedTx.id])
            
            // Success!
            toast.success(`${claseDoc} generada y registrada con éxito`)
            setIsSplitting(false)
            setSelectedCategory(null)
            setSplitAmount('0')
            setSelectedTx(null)
            
            // Immediately mark as locally reconciled to hide from list
            setCategorizedTxIds(prev => [...prev, selectedTx.id])
            
            // Allow more time for DB propagation before refreshing
            setTimeout(() => {
                console.log("Executing post-categorization refresh...")
                if (onRefresh) onRefresh()
            }, 1200)

            setIsCategorizing(false)
            setSelectedCategory(null)

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

    const ROUND_TO_0 = (val: number | string) => Math.round(Math.abs(Number(val)))

    return (
        <Card className="bg-gray-900 border-gray-800 animate-in fade-in duration-500">
            <CardHeader className="flex flex-row items-center justify-between border-b border-gray-800 px-6 py-4">
                <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        AUDITORÍA DE BANCOS <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded font-bold ml-2">ACTIVO</span>
                    </CardTitle>
                    <p className="text-xs text-gray-400 mt-1">Movimientos bancarios pendientes de conciliación.</p>
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
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-xs font-bold text-white group-hover:text-emerald-400 leading-tight">{tx.descripcion}</p>
                                            {(globalAiSuggestions.some(s => s.transId === tx.id) || tx.metadata?.suggestions?.length > 0) && (
                                                <Badge variant="outline" className="text-[9px] font-black h-4 bg-amber-500/10 text-amber-500 border-amber-500/20 px-1.5 leading-none animate-pulse">
                                                    ✨ IA SUGGEST
                                                </Badge>
                                            )}
                                        </div>
                                        {tx.metadata?.suggestions?.length > 0 && (
                                            <div className="mt-1.5 flex items-center gap-1.5 bg-amber-500/5 border border-amber-500/10 rounded-lg p-2 animate-in fade-in slide-in-from-left-2">
                                                <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                                                <p className="text-[10px] text-amber-200/80 font-medium italic">
                                                    {tx.metadata.suggestions[0].label}: <span className="text-white font-bold">{tx.metadata.suggestions[0].entidad}</span>
                                                    {tx.metadata.suggestions[0].diff !== undefined && (
                                                        <span className="ml-1 text-amber-400">
                                                            (Dif: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(tx.metadata.suggestions[0].diff)})
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[11px] font-mono text-gray-400 font-medium">{new Date(tx.fecha).toLocaleDateString('es-AR')}</span>
                                            {(tx.referencia || tx.metadata?.referencia) && (
                                                <span className="text-[12px] bg-amber-400 text-black px-2.5 py-1 rounded font-black shadow-[0_2px_10px_rgba(251,191,36,0.3)] flex items-center gap-1.5 border-b-2 border-amber-600">
                                                    <Tag className="w-3 h-3" />
                                                    REF: {tx.referencia || tx.metadata?.referencia}
                                                </span>
                                            )}
                                            <span className="text-[10px] text-gray-600 font-mono tracking-tighter uppercase ml-2">ID: {tx.id.split('-')[0]}</span>
                                            {tx.metadata?.diagnostic_message && (
                                                <div className="ml-1 inline-block" title={tx.metadata.diagnostic_message}>
                                                    <HelpCircle className="w-3 h-3 text-emerald-500/50 cursor-help hover:text-emerald-400" />
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right whitespace-nowrap">
                                        <p className={`text-xs font-black ${tx.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(tx.monto)}
                                        </p>
                                        {/* Badges de estado eliminados por redundancia */}
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
                <DialogContent className="max-w-lg bg-gray-950 border-gray-800 flex flex-col max-h-[90vh]">
                    <DialogHeader className="shrink-0">
                        <DialogTitle className="text-white flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            Conciliación Bancaria
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 text-xs">
                            Vincule el movimiento del banco con documentos de tesorería (Recibos/OP).
                        </DialogDescription>
                    </DialogHeader>

                    {selectedTx && (
                        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 my-2 shrink-0 flex justify-between items-center shadow-inner">
                            <div className="flex flex-col gap-1 w-full">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                        <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        <h4 className="font-black text-xs text-white truncate uppercase tracking-tighter">
                                            {selectedTx.descripcion}
                                        </h4>
                                    </div>
                                    <div className="text-[14px] font-black text-emerald-400 shrink-0">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Math.abs(selectedTx.monto))}
                                    </div>
                                </div>

                                {/* Referencia Bancaria (Pura o Extraída) */}
                                {(() => {
                                    const rawRef = selectedTx.referencia || selectedTx.metadata?.referencia;
                                    const descRef = selectedTx.descripcion?.match(/\b(CH|TRF|REF|ID|OP)?[\s.-]*(\d{4,12})\b/i)?.[0];
                                    const finalRef = rawRef || descRef;

                                    if (!finalRef) return null;

                                    return (
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">REFERENCIA IDENTIFICADA:</span>
                                            <span className="bg-amber-400 text-black px-2 py-0.5 rounded text-[11px] font-mono font-black border border-amber-500/50 shadow-sm animate-pulse">
                                                {finalRef.toUpperCase()}
                                            </span>
                                        </div>
                                    )
                                })()}
                                
                                <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/5">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-gray-500 font-medium">BFE:</span>
                                        <span className="text-[10px] text-gray-400 font-mono">{new Date(selectedTx.fecha).toLocaleDateString()}</span>
                                        {selectedTx.cuit_origen && (
                                            <Badge variant="outline" className="text-[9px] border-emerald-500/20 bg-emerald-500/5 text-emerald-500 px-1 py-0">
                                                CUIT: {selectedTx.cuit_origen}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                        {loadingInvoices ? (
                            <div className="flex flex-col items-center justify-center py-12 text-emerald-500/50 italic animate-pulse">
                                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Buscando documentos...</p>
                            </div>
                        ) : (suggestedMovements.length > 0 || suggestedInvoices.length > 0) ? (
                            <div className="flex flex-col h-full overflow-hidden">
                                {suggestedMovements.length > 0 && (
                                    <div className="shrink-0 mb-4">
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-2 shrink-0">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> sugerencias de tesorería
                                        </p>
                                        <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar max-h-[250px]">
                                            {suggestedMovements.map((mov) => {
                                                const isSelected = selectedMovementIds.includes(mov.id)
                                                const txAmount = Math.abs(selectedTx?.monto || 0)
                                                
                                                const diffAmount = Math.abs(ROUND_TO_0(mov.monto) - txAmount)
                                                const diffDays = Math.abs(new Date(mov.fecha).getTime() - new Date(selectedTx?.fecha || '').getTime()) / (1000 * 60 * 60 * 24)
                                                
                                                let probabilityLabel = "Lejana"
                                                let probabilityClass = "bg-red-500/10 text-red-500 border-red-500/20"
                                                
                                                if (diffAmount < 0.05 && diffDays <= 10) {
                                                    probabilityLabel = "Exacta"
                                                    probabilityClass = "bg-emerald-500 text-black border-emerald-500"
                                                } else if (diffAmount < 0.05 || (diffAmount < txAmount * 0.05 && diffDays <= 15)) {
                                                    probabilityLabel = "Probable"
                                                    probabilityClass = "bg-amber-500/20 text-amber-500 border-amber-500/30"
                                                }

                                                return (
                                                    <button
                                                        key={mov.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            const newSelected = isSelected
                                                                ? selectedMovementIds.filter(id => id !== mov.id)
                                                                : [...selectedMovementIds, mov.id]
                                                            setSelectedMovementIds(newSelected)
                                                            if (!isSelected) setSelectedInvoiceIds([])
                                                        }}
                                                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 group text-left ${isSelected ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-gray-950/40 border-gray-800 hover:border-gray-700 hover:bg-gray-900/40'}`}
                                                    >
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-700 group-hover:border-gray-500'}`}>
                                                                {isSelected && <Check className="w-3.5 h-3.5 text-black font-black" />}
                                                            </div>
                                                            <div className="flex-1 overflow-hidden">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${probabilityClass}`}>
                                                                        {probabilityLabel}
                                                                    </span>
                                                                    <span className={`text-[12px] font-bold uppercase tracking-tight truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                                                        {mov.razonSocial || 'Entidad no ident.'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                                    <Badge variant="outline" className={`text-[9px] font-bold ${isSelected ? 'bg-white/10 text-white border-white/20' : 'bg-gray-800 text-gray-400 border-gray-700'} px-1.5 py-0`}>
                                                                        {mov.nro_comprobante || 'S/N'}
                                                                    </Badge>
                                                                    {(() => {
                                                                        // Prefer instrument reference, but if it looks like an invoice and observations has another number, show both
                                                                        const instRef = mov.instrumentos?.[0]?.detalle_referencia;
                                                                        const obs = mov.observaciones || '';
                                                                        const obsRef = obs.match(/\b(CH|TRF|REF|ID|OP)?[\s.-]*(\d{4,12})\b/i)?.[0];
                                                                        
                                                                        if (!instRef && !obsRef) return null;

                                                                        const showRef = instRef || obsRef;

                                                                        return (
                                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${isSelected ? 'bg-amber-400 text-black border-amber-500' : 'bg-amber-400/10 text-amber-500 border-amber-500/20'}`}>
                                                                                REF: {showRef}
                                                                            </span>
                                                                        )
                                                                    })()}
                                                                    {mov.isMissingInstruments && (
                                                                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 uppercase">
                                                                            Sin Comprobante de Pago
                                                                        </span>
                                                                    )}
                                                                    {mov.isMissingInvoices && (
                                                                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 uppercase">
                                                                            Sin Factura
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right ml-4">
                                                            <p className={`text-sm font-black ${isSelected ? 'text-emerald-400' : 'text-white'}`}>
                                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(mov.monto)}
                                                            </p>
                                                            <p className="text-[9px] text-gray-500 font-mono">{new Date(mov.fecha).toLocaleDateString('es-AR')}</p>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {suggestedInvoices.length > 0 && (
                                    <div className="flex-1 min-h-0 flex flex-col">
                                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-2 shrink-0">
                                            <FileText className="w-3.5 h-3.5" /> facturas pendientes (generar recibo/op)
                                        </p>
                                        <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                                            {suggestedInvoices.map((inv) => {
                                                const isSelected = selectedInvoiceIds.includes(inv.id)
                                                const txAmount = Math.abs(selectedTx?.monto || 0)
                                                const diffAmount = Math.abs(Number(inv.monto_pendiente) - txAmount)
                                                
                                                let probabilityLabel = "Lejana"
                                                let probabilityClass = "bg-red-500/10 text-red-500 border-red-500/20"
                                                if (diffAmount < 1) {
                                                    probabilityLabel = "Exacta"
                                                    probabilityClass = "bg-amber-500 text-black border-amber-500"
                                                } else if (diffAmount < txAmount * 0.05) {
                                                    probabilityLabel = "Cercana"
                                                    probabilityClass = "bg-amber-500/20 text-amber-500 border-amber-500/30"
                                                }

                                                return (
                                                    <button
                                                        key={inv.id}
                                                        onClick={() => {
                                                            const newSelected = isSelected ? [] : [inv.id]
                                                            setSelectedInvoiceIds(newSelected)
                                                            if (newSelected.length > 0) setSelectedMovementIds([])
                                                        }}
                                                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 group text-left ${isSelected ? 'bg-amber-500/10 border-amber-500/50' : 'bg-gray-950/40 border-gray-800 hover:border-gray-700 hover:bg-gray-900/40'}`}
                                                    >
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-700 group-hover:border-gray-500'}`}>
                                                                {isSelected && <Check className="w-3.5 h-3.5 text-black font-black" />}
                                                            </div>
                                                            <div className="flex-1 overflow-hidden">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${probabilityClass}`}>
                                                                        {probabilityLabel}
                                                                    </span>
                                                                    <span className={`text-[12px] font-bold uppercase tracking-tight truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                                                        {inv.razon_social_socio || 'Socio no ident.'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <Badge variant="outline" className="text-[9px] font-bold bg-gray-800 text-gray-400 border-gray-700 px-1.5 py-0">
                                                                        {inv.numero || 'Factura S/N'}
                                                                    </Badge>
                                                                    <span className="text-[9px] text-gray-500 font-mono">{new Date(inv.fecha_emision).toLocaleDateString('es-AR')}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right ml-4">
                                                            <p className={`text-sm font-black ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_pendiente)}
                                                            </p>
                                                            <p className="text-[9px] text-gray-400">Saldo Pendiente</p>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border border-dashed border-gray-800 rounded-xl m-2 bg-gray-900/20">
                                <div className="bg-amber-500/10 p-3 rounded-full mb-4">
                                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                                </div>
                                <p className="text-sm font-bold text-white mb-1">
                                    {selectedTx?.monto && selectedTx.monto > 0 
                                        ? "No encontramos recibos emitidos para este importe"
                                        : "No encontramos orden de pago emitida para este importe"
                                    }
                                </p>
                                <p className="text-[10px] text-gray-500 max-w-[280px]">
                                    Por favor, regularice la situación emitiendo el documento correspondiente en Tesorería o verifique los datos del extracto.
                                </p>
                                
                                <div className="mt-6 flex flex-col gap-2 w-full px-8">
                                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-wider">Solo si corresponde:</p>
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => {
                                            setIsConciliating(false);
                                            setIsCategorizing(true);
                                        }}
                                        className="border-gray-800 hover:bg-gray-800 text-gray-400 text-[10px] h-8"
                                    >
                                        Generar Nota Bancaria (Solo Impuestos/Banco/Sueldos)
                                    </Button>
                                </div>
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
                                disabled={isSubmitting || (selectedMovementIds.length === 0 && selectedInvoiceIds.length === 0)}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                )}
                                {selectedInvoiceIds.length > 0 
                                    ? (selectedTx?.monto && selectedTx.monto > 0 ? "Generar Recibo y Conciliar" : "Generar OP y Conciliar")
                                    : "Conciliar Seleccionados"
                                }
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
