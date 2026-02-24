'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    Plus,
    Trash2,
    CreditCard,
    Banknote,
    Calendar,
    Hash,
    Loader2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface PaymentWizardProps {
    isOpen: boolean
    onClose: () => void
    orgId: string
    entidadId: string
    razonSocial: string
    tipo: 'cobro' | 'pago'; // cobro = de cliente, pago = a proveedor
    onSuccess: () => void;
}

export function PaymentWizard({ isOpen, onClose, orgId, entidadId, razonSocial, tipo, onSuccess }: PaymentWizardProps) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [pendingInvoices, setPendingInvoices] = useState<any[]>([])
    const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
    const [instruments, setInstruments] = useState<any[]>([
        { id: '1', metodo: 'efectivo', monto: 0, fecha_disponibilidad: new Date().toISOString().split('T')[0] }
    ])

    useEffect(() => {
        if (step === 2 && instruments.length === 1 && instruments[0].monto === 0) {
            updateInstrument('1', { monto: totalSelected })
        }
    }, [step])

    useEffect(() => {
        if (isOpen && entidadId) {
            fetchPendingInvoices()
        }
    }, [isOpen, entidadId])

    async function fetchPendingInvoices() {
        const supabase = createClient()
        const targetType = tipo === 'cobro' ? 'factura_venta' : 'factura_compra'

        const { data } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('entidad_id', entidadId)
            .eq('tipo', targetType)
            .neq('estado', 'pagado')
            .order('fecha_vencimiento', { ascending: true })

        if (data) setPendingInvoices(data)
    }

    const totalSelected = pendingInvoices
        .filter(inv => selectedInvoices.includes(inv.id))
        .reduce((acc, curr) => acc + curr.monto_pendiente, 0)

    const totalInstruments = instruments.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0)
    const difference = totalSelected - totalInstruments
    const isPartialPayment = totalInstruments > 0 && totalInstruments < totalSelected - 0.01
    const isOverPayment = totalInstruments > totalSelected + 0.01

    const handleAddInstrument = () => {
        setInstruments([...instruments, {
            id: Date.now().toString(),
            metodo: 'cheque_terceros',
            monto: difference > 0 ? difference : 0,
            fecha_disponibilidad: new Date().toISOString().split('T')[0]
        }])
    }

    const handleRemoveInstrument = (id: string) => {
        setInstruments(instruments.filter(i => i.id !== id))
    }

    const updateInstrument = (id: string, updates: any) => {
        setInstruments(instruments.map(i => i.id === id ? { ...i, ...updates } : i))
    }

    const handleConfirm = async () => {
        if (loading) return
        setLoading(true)
        const supabase = createClient()

        try {
            console.log('[PaymentWizard] Iniciando registro:', { orgId, entidadId, tipo, totalInstruments })

            // 1. Create Treasury Movement
            const { data: mov, error: movErr } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: entidadId,
                    tipo: tipo,
                    monto_total: totalInstruments,
                    fecha: new Date().toISOString().split('T')[0],
                    observaciones: `Generado desde el asistente de ${tipo}`
                })
                .select()
                .single()

            if (movErr) {
                console.error('[PaymentWizard] Error al crear movimiento:', movErr)
                throw new Error(`Error al crear movimiento: ${movErr.message}`)
            }

            // 2. Create Instruments
            const instrumentsPayload = instruments
                .filter(i => i.monto > 0)
                .map(i => ({
                    organization_id: orgId,
                    movimiento_id: mov.id,
                    metodo: i.metodo,
                    monto: i.monto,
                    fecha_disponibilidad: i.fecha_disponibilidad,
                    banco: i.banco || null,
                    referencia: i.referencia || null
                }))

            if (instrumentsPayload.length > 0) {
                const { error: insErr } = await supabase.from('instrumentos_pago').insert(instrumentsPayload)
                if (insErr) {
                    console.error('[PaymentWizard] Error al crear instrumentos:', insErr)
                    throw new Error(`Error al crear instrumentos: ${insErr.message}`)
                }
            }

            // 3. Create Applications and update Invoices
            let remainingPayment = totalInstruments
            for (const invoiceId of selectedInvoices) {
                if (remainingPayment <= 0.01) break // Precision handling

                const inv = pendingInvoices.find(i => i.id === invoiceId)
                if (!inv) continue

                const amountToApply = Math.min(remainingPayment, inv.monto_pendiente)

                const { error: appErr } = await supabase.from('aplicaciones_pago').insert({
                    organization_id: orgId,
                    movimiento_id: mov.id,
                    comprobante_id: invoiceId,
                    monto_aplicado: amountToApply
                })
                if (appErr) throw appErr

                const newMontoPendiente = Math.max(0, inv.monto_pendiente - amountToApply)
                const { error: updErr } = await supabase.from('comprobantes')
                    .update({
                        monto_pendiente: newMontoPendiente,
                        estado: newMontoPendiente <= 0.01 ? 'pagado' : 'parcial'
                    })
                    .eq('id', invoiceId)
                if (updErr) throw updErr

                remainingPayment -= amountToApply
            }

            toast.success(`${tipo === 'cobro' ? 'Recibo' : 'Orden de Pago'} generado con éxito`)
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error('[PaymentWizard] Error fatal:', err)
            toast.error('Error al procesar: ' + (err.message || 'Error desconocido'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl bg-gray-950 border-gray-800 text-white min-h-[600px] flex flex-col p-0 overflow-hidden">
                <div className="p-6 border-b border-gray-800 bg-emerald-500/5">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                                    {tipo === 'cobro' ? 'Nuevo Recibo' : 'Nueva Orden de Pago'}
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                        Fase {step} de 2
                                    </Badge>
                                </DialogTitle>
                                <p className="text-sm text-gray-500 mt-1">{razonSocial}</p>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === 1 ? (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-lg font-bold">Seleccionar Comprobantes Pendientes</Label>
                                <span className="text-xs text-gray-500 uppercase font-bold tracking-widest">Saldo Total: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(pendingInvoices.reduce((a, b) => a + b.monto_pendiente, 0))}</span>
                            </div>

                            <ScrollArea className="max-h-[400px] pr-4">
                                <div className="space-y-3">
                                    {pendingInvoices.length === 0 ? (
                                        <div className="p-12 text-center border-2 border-dashed border-gray-800 rounded-2xl text-gray-500">
                                            No hay comprobantes pendientes para esta entidad.
                                        </div>
                                    ) : pendingInvoices.map(inv => (
                                        <div
                                            key={inv.id}
                                            onClick={() => {
                                                if (selectedInvoices.includes(inv.id)) {
                                                    setSelectedInvoices(prev => prev.filter(id => id !== inv.id))
                                                } else {
                                                    setSelectedInvoices(prev => [...prev, inv.id])
                                                }
                                            }}
                                            className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer ${selectedInvoices.includes(inv.id) ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-500/5' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="flex gap-4 items-center">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${selectedInvoices.includes(inv.id) ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-500'}`}>
                                                        {selectedInvoices.includes(inv.id) ? <CheckCircle2 className="w-5 h-5" /> : <div className="w-3 h-3 rounded-full border-2 border-gray-700" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white">{inv.numero || 'Sin Número'}</p>
                                                        <p className="text-xs text-gray-500">Vence: {new Date(inv.fecha_vencimiento).toLocaleDateString('es-AR')}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-mono font-bold text-emerald-400">
                                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_pendiente)}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Saldo Pendiente</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <Label className="text-lg font-bold">Carga de Instrumentos</Label>
                                    <div className="flex gap-4 text-xs font-bold uppercase tracking-wider">
                                        <span className="text-gray-400">Seleccionado: <span className="text-white">${new Intl.NumberFormat('es-AR').format(totalSelected)}</span></span>
                                        <span className={isPartialPayment ? 'text-amber-400' : isOverPayment ? 'text-red-400' : 'text-emerald-400'}>
                                            A Cubrir: ${new Intl.NumberFormat('es-AR').format(totalSelected - totalInstruments)}
                                        </span>
                                    </div>
                                </div>
                                <Button size="sm" onClick={handleAddInstrument} variant="outline" className="border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10">
                                    <Plus className="w-4 h-4 mr-2" /> Agregar Valor
                                </Button>
                            </div>

                            <ScrollArea className="max-h-[400px] pr-4">
                                <div className="space-y-4">
                                    {instruments.map((ins, idx) => (
                                        <div key={ins.id} className="p-5 bg-gray-900 border border-gray-800 rounded-2xl relative animate-in fade-in slide-in-from-left-4 duration-300">
                                            {instruments.length > 1 && (
                                                <button
                                                    onClick={() => handleRemoveInstrument(ins.id)}
                                                    className="absolute top-4 right-4 text-gray-600 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] uppercase text-gray-500 font-bold">Medio</Label>
                                                    <select
                                                        value={ins.metodo}
                                                        onChange={(e) => updateInstrument(ins.id, { metodo: e.target.value })}
                                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-xs focus:border-emerald-500/50 outline-none"
                                                    >
                                                        <option value="efectivo">Efectivo</option>
                                                        <option value="transferencia">Transferencia</option>
                                                        <option value="cheque_terceros">Cheque (Terceros)</option>
                                                        <option value="cheque_propio">Cheque (Propio)</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] uppercase text-gray-500 font-bold">Monto</Label>
                                                    <div className="relative">
                                                        <Banknote className="absolute left-3 top-2.5 w-3 h-3 text-gray-600" />
                                                        <Input
                                                            type="number"
                                                            value={ins.monto}
                                                            onChange={(e) => updateInstrument(ins.id, { monto: Number(e.target.value) })}
                                                            className="bg-gray-950 border-gray-800 pl-8 h-9 text-sm font-bold text-emerald-400"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] uppercase text-gray-500 font-bold">Disponibilidad</Label>
                                                    <div className="relative">
                                                        <Calendar className="absolute left-3 top-2.5 w-3 h-3 text-gray-600" />
                                                        <Input
                                                            type="date"
                                                            value={ins.fecha_disponibilidad}
                                                            onChange={(e) => updateInstrument(ins.id, { fecha_disponibilidad: e.target.value })}
                                                            className="bg-gray-950 border-gray-800 pl-8 h-9 text-xs"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] uppercase text-gray-500 font-bold">Banco / Nº Ref</Label>
                                                    <div className="relative">
                                                        <Hash className="absolute left-3 top-2.5 w-3 h-3 text-gray-600" />
                                                        <Input
                                                            placeholder="Varios / 00000000"
                                                            value={ins.referencia || ''}
                                                            onChange={(e) => updateInstrument(ins.id, { referencia: e.target.value })}
                                                            className="bg-gray-950 border-gray-800 pl-8 h-9 text-xs font-mono"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-800 bg-gray-900/50">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-widest">Resumen del {tipo === 'cobro' ? 'Cobro' : 'Pago'}</span>
                            <div className="flex gap-4">
                                <div>
                                    <span className="text-[10px] text-gray-400">Total Facturas:</span>
                                    <p className="text-lg font-bold text-white leading-none mt-1">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalSelected)}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[10px] text-gray-400">Total Valores:</span>
                                    <p className={`text-lg font-bold leading-none mt-1 ${isPartialPayment ? 'text-amber-400' : isOverPayment ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalInstruments)}
                                    </p>
                                </div>
                                {isPartialPayment && (
                                    <div className="border-l border-gray-700 pl-4 animate-in fade-in slide-in-from-left-2">
                                        <span className="text-[10px] text-amber-500 font-bold uppercase">Saldo Remanente:</span>
                                        <p className="text-lg font-bold text-amber-400 leading-none mt-1">
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(difference)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Button variant="ghost" onClick={onClose} disabled={loading} className="text-gray-500 hover:text-white">
                                Cancelar
                            </Button>
                            {step === 2 && (
                                <Button variant="outline" onClick={() => setStep(1)} disabled={loading} className="border-gray-800 text-gray-400">
                                    <ChevronLeft className="w-4 h-4 mr-2" /> Atrás
                                </Button>
                            )}
                            {step === 1 ? (
                                <Button
                                    onClick={() => setStep(2)}
                                    disabled={selectedInvoices.length === 0}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 shadow-xl shadow-emerald-500/20"
                                >
                                    Siguiente <ChevronRight className="w-4 h-4 ml-2" />
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleConfirm}
                                    disabled={totalInstruments === 0 || loading || isOverPayment}
                                    className={`${isPartialPayment ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'} text-white font-bold px-8 shadow-xl transition-all`}
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                    Finalizar {tipo === 'cobro' ? 'Recibo' : 'Orden de Pago'} {isPartialPayment ? '(Parcial)' : ''}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
