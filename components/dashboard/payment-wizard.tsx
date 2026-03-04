'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
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
    Banknote,
    Calendar,
    Hash,
    Loader2,
    Briefcase,
    AlertTriangle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Check {
    id: string
    referencia: string
    banco: string
    monto: number
    fecha_disponibilidad: string
    cant_endosos: number
    tipo_cheque: 'comun' | 'cpd'
}

interface PaymentWizardProps {
    isOpen: boolean
    onClose: () => void
    orgId: string
    entidadId: string
    razonSocial: string
    tipo: 'cobro' | 'pago'
    onSuccess: () => void
}

export function PaymentWizard({ isOpen, onClose, orgId, entidadId, razonSocial, tipo, onSuccess }: PaymentWizardProps) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [pendingInvoices, setPendingInvoices] = useState<any[]>([])
    const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
    const [instruments, setInstruments] = useState<any[]>([
        { id: '1', metodo: 'efectivo', monto: 0, fecha_disponibilidad: new Date().toISOString().split('T')[0] }
    ])
    const [numero, setNumero] = useState('')

    useEffect(() => {
        if (step === 2 && instruments.length === 1 && instruments[0].monto === 0) {
            updateInstrument('1', { monto: totalSelected })
        }
    }, [step])

    const [availableChecks, setAvailableChecks] = useState<Check[]>([])
    const [isSelectingCheck, setIsSelectingCheck] = useState(false)

    useEffect(() => {
        if (isOpen && entidadId) {
            fetchPendingInvoices()
            if (tipo === 'pago') fetchAvailableChecks()
        }
    }, [isOpen, entidadId])

    async function fetchAvailableChecks() {
        const supabase = createClient()
        const { data } = await supabase
            .from('instrumentos_pago')
            .select('id, detalle_referencia, banco, monto, fecha_disponibilidad, cant_endosos, tipo_cheque')
            .eq('metodo', 'cheque_terceros')
            .eq('estado', 'pendiente')

        if (data) setAvailableChecks(data)
    }

    async function fetchPendingInvoices() {
        const supabase = createClient()
        const targetTypes = tipo === 'cobro'
            ? ['factura_venta', 'nota_credito', 'nota_debito']
            : ['factura_compra', 'nota_credito', 'nota_debito']

        const { data } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', orgId)
            .eq('entidad_id', entidadId)
            .in('tipo', targetTypes)
            .neq('estado', 'pagado')
            .order('fecha_vencimiento', { ascending: true })

        if (data) setPendingInvoices(data)
    }

    const totalSelected = pendingInvoices
        .filter(inv => selectedInvoices.includes(inv.id))
        .reduce((acc, curr) => {
            if (curr.tipo === 'nota_credito') return acc - curr.monto_pendiente
            return acc + curr.monto_pendiente
        }, 0)

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
            const { data: mov, error: movErr } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: entidadId,
                    tipo: tipo,
                    nro_comprobante: numero || null,
                    monto_total: totalInstruments,
                    fecha: new Date().toISOString().split('T')[0],
                    observaciones: `Generado desde el asistente de ${tipo}`
                })
                .select()
                .single()

            if (movErr) throw new Error(`Error al crear movimiento: ${movErr.message}`)

            const instrumentsPayload = instruments
                .filter(i => i.monto > 0)
                .map(i => ({
                    organization_id: orgId,
                    movimiento_id: mov.id,
                    metodo: i.metodo === 'endoso' ? 'cheque_terceros' : i.metodo,
                    monto: i.monto,
                    fecha_disponibilidad: i.fecha_disponibilidad,
                    banco: i.banco || null,
                    detalle_referencia: i.referencia || null,
                    vinculo_instrumento_id: i.vinculo_instrumento_id || null,
                    cant_endosos: i.metodo === 'endoso' ? (i.cant_endosos || 0) + 1 : 0,
                    tipo_cheque: i.tipo_cheque || 'cpd'
                }))

            if (instrumentsPayload.length > 0) {
                const { error: insErr } = await supabase.from('instrumentos_pago').insert(instrumentsPayload)
                if (insErr) throw new Error(`Error al crear instrumentos: ${insErr.message}`)

                const endosados = instruments.filter(i => i.metodo === 'endoso' && i.vinculo_instrumento_id)
                if (endosados.length > 0) {
                    for (const endoso of endosados) {
                        await supabase.from('instrumentos_pago')
                            .update({
                                estado: 'endosado',
                                cant_endosos: (endoso.cant_endosos || 0) + 1
                            })
                            .eq('id', endoso.vinculo_instrumento_id)
                    }
                }
            }

            const selectedComprobantes = selectedInvoices.map(id => pendingInvoices.find(i => i.id === id)).filter(Boolean)
            const facturas = selectedComprobantes.filter(inv => inv.tipo !== 'nota_credito')
            const notasCredito = selectedComprobantes.filter(inv => inv.tipo === 'nota_credito')

            for (const nc of notasCredito) {
                await supabase.from('aplicaciones_pago').insert({
                    movimiento_id: mov.id,
                    comprobante_id: nc.id,
                    monto_aplicado: nc.monto_pendiente
                })
                await supabase.from('comprobantes')
                    .update({ monto_pendiente: 0, estado: 'pagado' })
                    .eq('id', nc.id)
            }

            let remainingPayment = totalInstruments
            for (const inv of facturas) {
                if (remainingPayment <= 0.01) break
                const amountToApply = Math.min(remainingPayment, inv.monto_pendiente)
                await supabase.from('aplicaciones_pago').insert({
                    movimiento_id: mov.id,
                    comprobante_id: inv.id,
                    monto_aplicado: amountToApply
                })
                const newMontoPendiente = Math.max(0, inv.monto_pendiente - amountToApply)
                await supabase.from('comprobantes')
                    .update({
                        monto_pendiente: newMontoPendiente,
                        estado: newMontoPendiente <= 0.01 ? 'pagado' : 'parcial'
                    })
                    .eq('id', inv.id)
                remainingPayment -= amountToApply
            }

            toast.success(`${tipo === 'cobro' ? 'Recibo' : 'Orden de Pago'} ${mov.numero || ''} generado con éxito`)
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error('[PaymentWizard] Error:', err)
            toast.error('Error al procesar: ' + (err.message || 'Error desconocido'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl bg-gray-950 border-gray-800 text-white min-h-[600px] flex flex-col p-0 overflow-hidden">
                <div className="p-6 border-b border-gray-800 bg-emerald-500/5">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                {tipo === 'cobro' ? 'Nuevo Recibo' : 'Nueva Orden de Pago'}
                                <Badge className="bg-emerald-600 text-white font-bold border-none px-3 py-1">
                                    Fase {step} de 2
                                </Badge>
                            </DialogTitle>
                            <div className="flex items-center gap-4 mt-2">
                                <p className="text-sm text-gray-500 font-medium">{razonSocial}</p>
                                <div className="h-4 w-px bg-gray-800" />
                                <div className="flex items-center gap-2">
                                    <Label className="text-[10px] uppercase text-gray-400 font-bold whitespace-nowrap">Nro (Opcional)</Label>
                                    <Input
                                        placeholder={tipo === 'cobro' ? 'Ej: R-001' : 'Ej: OP-001'}
                                        value={numero}
                                        onChange={(e) => setNumero(e.target.value)}
                                        className="h-8 w-36 bg-gray-950 border-gray-800 text-xs font-mono py-1 focus:ring-emerald-500/20 focus:border-emerald-500/50"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === 1 ? (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-lg font-bold">Seleccionar Comprobantes Pendientes</Label>
                            </div>
                            <ScrollArea className="max-h-[400px] pr-4">
                                <div className="space-y-3">
                                    {pendingInvoices.length === 0 ? (
                                        <div className="p-12 text-center border-2 border-dashed border-gray-800 rounded-2xl text-gray-500">
                                            No hay comprobantes pendientes.
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            {pendingInvoices.map(inv => (
                                                <div
                                                    key={inv.id}
                                                    onClick={() => {
                                                        if (selectedInvoices.includes(inv.id)) {
                                                            setSelectedInvoices(prev => prev.filter(id => id !== inv.id))
                                                        } else {
                                                            setSelectedInvoices(prev => [...prev, inv.id])
                                                        }
                                                    }}
                                                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${selectedInvoices.includes(inv.id) ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-gray-900 border-gray-800'}`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex gap-4 items-center">
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedInvoices.includes(inv.id) ? 'bg-emerald-500' : 'bg-gray-800'}`}>
                                                                {selectedInvoices.includes(inv.id) && <CheckCircle2 className="w-5 h-5 text-white" />}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold">{inv.numero || 'S/N'}</p>
                                                                <p className="text-xs text-gray-500">{new Date(inv.fecha_vencimiento).toLocaleDateString()}</p>
                                                            </div>
                                                        </div>
                                                        <p className="font-mono font-bold text-emerald-400">
                                                            ${new Intl.NumberFormat('es-AR').format(inv.monto_pendiente)}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <Label className="text-lg font-bold">Carga de Instrumentos</Label>
                                <Button size="sm" onClick={handleAddInstrument} variant="outline" className="text-emerald-400">
                                    <Plus className="w-4 h-4 mr-2" /> Agregar Valor
                                </Button>
                            </div>

                            <ScrollArea className="max-h-[400px] pr-4">
                                <div className="space-y-4">
                                    {instruments.map((ins) => (
                                        <div key={ins.id} className="p-5 bg-gray-900 border border-gray-800 rounded-2xl relative">
                                            {instruments.length > 1 && (
                                                <button onClick={() => handleRemoveInstrument(ins.id)} className="absolute top-4 right-4 text-gray-600 hover:text-red-500">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] uppercase text-gray-500 font-bold">Medio</Label>
                                                    <select
                                                        value={ins.metodo}
                                                        onChange={(e) => updateInstrument(ins.id, { metodo: e.target.value, vinculo_instrumento_id: null })}
                                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-xs text-white"
                                                    >
                                                        <option value="efectivo">Efectivo</option>
                                                        <option value="transferencia">Transferencia</option>
                                                        <option value="cheque_terceros">Cheque (Terceros)</option>
                                                        <option value="cheque_propio">Cheque (Propio)</option>
                                                        {tipo === 'pago' && <option value="endoso">Endoso de Terceros</option>}
                                                    </select>
                                                </div>

                                                {ins.metodo === 'endoso' ? (
                                                    <div className="col-span-3 flex items-end gap-2">
                                                        <Button
                                                            variant="outline"
                                                            className={`w-full border-dashed h-9 text-xs ${ins.limitExceeded ? 'border-red-500 bg-red-500/10' : 'border-gray-700'}`}
                                                            onClick={() => setIsSelectingCheck(true)}
                                                        >
                                                            {ins.vinculo_instrumento_id ? `Cheque ${ins.referencia} (${ins.cant_endosos} endosos)` : 'Seleccionar cheque de cartera...'}
                                                        </Button>
                                                        {ins.limitExceeded && (
                                                            <div className="flex items-center gap-1 text-red-400 text-[10px] animate-pulse">
                                                                <AlertTriangle className="w-3 h-3" /> LÍMITE BCRA
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="space-y-2">
                                                            <Label className="text-[10px] uppercase text-gray-500 font-bold">Monto</Label>
                                                            <Input
                                                                type="number"
                                                                value={ins.monto}
                                                                onChange={(e) => updateInstrument(ins.id, { monto: Number(e.target.value) })}
                                                                className="bg-gray-950 border-gray-800 text-emerald-400 h-9"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-[10px] uppercase text-gray-500 font-bold">Vencimiento</Label>
                                                            <Input
                                                                type="date"
                                                                value={ins.fecha_disponibilidad}
                                                                onChange={(e) => updateInstrument(ins.id, { fecha_disponibilidad: e.target.value })}
                                                                className="bg-gray-950 border-gray-800 h-9 text-xs"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-[10px] uppercase text-gray-500 font-bold">Ref / Tipo</Label>
                                                            <div className="flex gap-1">
                                                                <Input
                                                                    placeholder="Nro"
                                                                    value={ins.referencia || ''}
                                                                    onChange={(e) => updateInstrument(ins.id, { referencia: e.target.value })}
                                                                    className="bg-gray-950 border-gray-800 h-9 text-xs w-2/3"
                                                                />
                                                                <select
                                                                    value={ins.tipo_cheque || 'cpd'}
                                                                    onChange={(e) => updateInstrument(ins.id, { tipo_cheque: e.target.value })}
                                                                    className="bg-gray-950 border border-gray-800 rounded-lg text-[9px] w-1/3 text-white"
                                                                >
                                                                    <option value="cpd">CPD</option>
                                                                    <option value="comun">Común</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>

                            {isSelectingCheck && (
                                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                                    <div className="bg-gray-950 border border-gray-800 w-full max-w-lg rounded-2xl p-6">
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                            <Briefcase className="w-5 h-5 text-emerald-400" /> Seleccionar Cheque a Endosar
                                        </h3>
                                        <ScrollArea className="h-64 pr-4">
                                            <div className="space-y-2">
                                                {availableChecks.length === 0 ? (
                                                    <p className="text-center py-8 text-gray-500 text-sm italic">No hay cheques en cartera.</p>
                                                ) : availableChecks.map(c => {
                                                    const limit = c.tipo_cheque === 'comun' ? 1 : 2;
                                                    const isLimitReached = c.cant_endosos >= limit;

                                                    return (
                                                        <div
                                                            key={c.id}
                                                            onClick={() => {
                                                                const targetIns = instruments.find(i => i.metodo === 'endoso' && !i.vinculo_instrumento_id) || instruments.find(i => i.metodo === 'endoso');
                                                                if (targetIns) {
                                                                    updateInstrument(targetIns.id, {
                                                                        vinculo_instrumento_id: c.id,
                                                                        monto: c.monto,
                                                                        referencia: c.referencia,
                                                                        banco: c.banco,
                                                                        fecha_disponibilidad: c.fecha_disponibilidad,
                                                                        cant_endosos: c.cant_endosos,
                                                                        tipo_cheque: c.tipo_cheque,
                                                                        limitExceeded: isLimitReached
                                                                    });
                                                                }
                                                                setIsSelectingCheck(false);
                                                            }}
                                                            className={`p-3 border rounded-xl cursor-pointer transition-all flex justify-between items-center ${isLimitReached ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/50' : 'bg-gray-900 border-gray-800 hover:border-emerald-500/50'}`}
                                                        >
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <p className="font-bold text-xs">{c.referencia} - {c.banco}</p>
                                                                    <Badge variant="outline" className="text-[8px] py-0 h-3">{c.tipo_cheque || 'cpd'}</Badge>
                                                                </div>
                                                                <p className={`text-[10px] ${isLimitReached ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                                                                    Endosos: {c.cant_endosos || 0} / {limit} {isLimitReached && '(LÍMITE ALCANZADO)'}
                                                                </p>
                                                            </div>
                                                            <p className="font-mono font-bold text-emerald-400">${new Intl.NumberFormat('es-AR').format(c.monto)}</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </ScrollArea>
                                        <div className="mt-6 flex justify-end">
                                            <Button variant="ghost" onClick={() => setIsSelectingCheck(false)}>Cerrar</Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Total Valores</span>
                        <p className="text-lg font-bold text-emerald-400">
                            ${new Intl.NumberFormat('es-AR').format(totalInstruments)}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button variant="ghost" onClick={onClose} disabled={loading} className="text-gray-500 hover:text-white">Cancelar</Button>
                        {step === 2 && <Button variant="outline" onClick={() => setStep(1)} disabled={loading} className="border-gray-800 text-gray-400"><ChevronLeft className="w-4 h-4 mr-2" /> Atrás</Button>}
                        {step === 1 ? (
                            <Button onClick={() => setStep(2)} disabled={selectedInvoices.length === 0} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">Siguiente <ChevronRight className="w-4 h-4 ml-2" /></Button>
                        ) : (
                            <Button
                                onClick={handleConfirm}
                                disabled={totalInstruments === 0 || loading || isOverPayment || instruments.some(i => i.limitExceeded)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 shadow-lg shadow-emerald-900/20"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />} Finalizar y Confirmar
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
