'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    CheckCircle2,
    Plus,
    Trash2,
    Calendar,
    Hash,
    Loader2,
    Search,
    ChevronRight,
    ChevronLeft,
    Wallet,
    Landmark,
    FileText,
    AlertCircle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface TreasuryManualEntryProps {
    isOpen: boolean
    onClose: () => void
    orgId: string
    tipo: 'cobro' | 'pago'
    onSuccess: () => void
}

interface Instrument {
    id: string
    metodo: 'efectivo' | 'transferencia' | 'cheque_terceros' | 'cheque_propio'
    monto: number
    banco: string
    detalle_referencia: string
    fecha_disponibilidad: string
}

export function TreasuryManualEntry({ isOpen, onClose, orgId, tipo, onSuccess }: TreasuryManualEntryProps) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [socios, setSocios] = useState<any[]>([])
    const [searchingSocio, setSearchingSocio] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedSocio, setSelectedSocio] = useState<any>(null)

    const [pendingInvoices, setPendingInvoices] = useState<any[]>([])
    const [selectedInvoices, setSelectedInvoices] = useState<Record<string, number>>({}) // id -> monto a aplicar

    const [instruments, setInstruments] = useState<Instrument[]>([
        {
            id: '1',
            metodo: 'efectivo',
            monto: 0,
            banco: '',
            detalle_referencia: '',
            fecha_disponibilidad: new Date().toISOString().split('T')[0]
        }
    ])

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setStep(1)
            setSelectedSocio(null)
            setSearchQuery('')
            setSocios([]) // Clear previous results
            setSelectedInvoices({})
            setInstruments([{
                id: '1',
                metodo: 'efectivo',
                monto: 0,
                banco: '',
                detalle_referencia: '',
                fecha_disponibilidad: new Date().toISOString().split('T')[0]
            }])
            fetchInitialSocios()
        }
    }, [isOpen])

    async function fetchInitialSocios() {
        const supabase = createClient()
        const targetCat = tipo === 'cobro' ? 'cliente' : 'proveedor'
        setSearchingSocio(true)
        const { data } = await supabase
            .from('entidades')
            .select('*')
            .eq('organization_id', orgId)
            .in('categoria', [targetCat, 'ambos'])
            .order('razon_social', { ascending: true })
            .limit(10)

        if (data) setSocios(data)
        setSearchingSocio(false)
    }

    // Load invoices when socio is selected
    useEffect(() => {
        if (selectedSocio) {
            fetchInvoices()
        }
    }, [selectedSocio])

    async function fetchInvoices() {
        const supabase = createClient()
        const targetTypes = tipo === 'cobro'
            ? ['factura_venta', 'nota_debito_venta', 'nota_credito_venta']
            : ['factura_compra', 'nota_debito_compra', 'nota_credito_compra']

        // Handle variations in legacy data if needed, but primarily use these
        const { data } = await supabase
            .from('comprobantes')
            .select('*')
            .eq('organization_id', orgId)
            .eq('entidad_id', selectedSocio.id)
            .neq('estado', 'pagado')
            .order('fecha_vencimiento', { ascending: true })

        if (data) setPendingInvoices(data)
    }

    const totalSelected = Object.values(selectedInvoices).reduce((acc, curr) => acc + curr, 0)
    const totalInstruments = instruments.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0)
    const difference = totalSelected - totalInstruments

    const handleAddInstrument = () => {
        setInstruments([...instruments, {
            id: Date.now().toString(),
            metodo: 'cheque_terceros',
            monto: difference > 0 ? Number(difference.toFixed(2)) : 0,
            banco: '',
            detalle_referencia: '',
            fecha_disponibilidad: new Date().toISOString().split('T')[0]
        }])
    }

    const removeInstrument = (id: string) => {
        if (instruments.length > 1) {
            setInstruments(instruments.filter(i => i.id !== id))
        }
    }

    const updateInstrument = (id: string, updates: Partial<Instrument>) => {
        setInstruments(instruments.map(i => i.id === id ? { ...i, ...updates } : i))
    }

    const toggleInvoice = (inv: any) => {
        const newSelected = { ...selectedInvoices }
        if (newSelected[inv.id]) {
            delete newSelected[inv.id]
        } else {
            newSelected[inv.id] = inv.monto_pendiente
        }
        setSelectedInvoices(newSelected)
    }

    const handleSave = async () => {
        if (Math.abs(difference) > 0.01) {
            toast.error('El total de medios de pago debe coincidir con el total de facturas.')
            return
        }

        setLoading(true)
        const supabase = createClient()

        try {
            // 1. Create Treasury Movement
            const { data: mov, error: movErr } = await supabase
                .from('movimientos_tesoreria')
                .insert({
                    organization_id: orgId,
                    entidad_id: selectedSocio.id,
                    tipo: tipo,
                    fecha: new Date().toISOString().split('T')[0],
                    monto_total: totalInstruments,
                    categoria: `Pago/Cobro manual - ${selectedSocio.razon_social}`,
                    observaciones: Object.keys(selectedInvoices).length > 0
                        ? `Aplica a ${Object.keys(selectedInvoices).length} comprobantes`
                        : 'Pago a cuenta'
                })
                .select()
                .single()

            if (movErr) throw movErr

            // 2. Insert Instruments
            const instrumentsToInsert = instruments.map(ins => ({
                organization_id: orgId,
                movimiento_id: mov.id,
                metodo: ins.metodo,
                monto: ins.monto,
                banco: ins.banco || null,
                referencia: ins.detalle_referencia || null,
                fecha_disponibilidad: ins.fecha_disponibilidad,
                estado: ins.metodo === 'efectivo' ? 'conciliado' : 'pendiente'
            }))

            const { error: insErr } = await supabase
                .from('instrumentos_pago')
                .insert(instrumentsToInsert)

            if (insErr) throw insErr

            // 3. Insert Applications and Update Comprobantes
            for (const [invId, montoApli] of Object.entries(selectedInvoices)) {
                // Application
                await supabase.from('aplicaciones_pago').insert({
                    movimiento_id: mov.id,
                    comprobante_id: invId,
                    monto_aplicado: montoApli
                })

                // Update Comprobante
                const inv = pendingInvoices.find(p => p.id === invId)
                if (inv) {
                    const newPendiente = Math.max(0, inv.monto_pendiente - montoApli)
                    const newEstado = newPendiente <= 0.05 ? 'pagado' : 'parcial'

                    await supabase.from('comprobantes')
                        .update({
                            monto_pendiente: newPendiente,
                            estado: newEstado
                        })
                        .eq('id', invId)
                }
            }

            toast.success(`${tipo === 'cobro' ? 'Recibo' : 'Orden de Pago'} registrado correctamente`)
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error('Error saving treasury entry:', err)
            toast.error(`Error: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-[850px] p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-gray-800">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Wallet className="w-5 h-5 text-emerald-400" />
                        {tipo === 'cobro' ? 'Nuevo Recibo de Cobro' : 'Nueva Orden de Pago'}
                    </DialogTitle>
                </DialogHeader>

                <div className="p-0 overflow-hidden">
                    <div className="flex bg-gray-900/50 border-b border-gray-800">
                        <div className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${step === 1 ? 'border-emerald-500 text-white' : 'border-transparent text-gray-500'}`}>
                            1. Socio y Deuda
                        </div>
                        <div className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors ${step === 2 ? 'border-emerald-500 text-white' : 'border-transparent text-gray-500'}`}>
                            2. Medios de Pago
                        </div>
                    </div>

                    <ScrollArea className="h-[450px]">
                        <div className="p-6">
                            {step === 1 ? (
                                <div className="space-y-6">
                                    {/* Socio Selection */}
                                    <div className="space-y-3">
                                        <Label className="text-xs font-bold uppercase text-gray-500">Seleccionar {tipo === 'cobro' ? 'Cliente' : 'Proveedor'}</Label>
                                        {!selectedSocio ? (
                                            <div className="relative">
                                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                                                <Input
                                                    placeholder="Buscar por nombre o CUIT..."
                                                    className="bg-gray-900 border-gray-800 pl-9"
                                                    value={searchQuery}
                                                    onChange={async (e) => {
                                                        const term = e.target.value
                                                        setSearchQuery(term)

                                                        if (term.length < 2) {
                                                            if (term.length === 0) fetchInitialSocios()
                                                            else setSocios([])
                                                            return
                                                        }

                                                        const supabase = createClient()
                                                        const targetCat = tipo === 'cobro' ? 'cliente' : 'proveedor'
                                                        setSearchingSocio(true)
                                                        const { data } = await supabase
                                                            .from('entidades')
                                                            .select('*')
                                                            .eq('organization_id', orgId)
                                                            .in('categoria', [targetCat, 'ambos'])
                                                            .or(`razon_social.ilike.%${term}%,cuit.ilike.%${term}%`)
                                                            .limit(10)
                                                        if (data) setSocios(data)
                                                        setSearchingSocio(false)
                                                    }}
                                                    onFocus={() => {
                                                        if (searchQuery.length === 0 && socios.length === 0) {
                                                            fetchInitialSocios()
                                                        }
                                                    }}
                                                />
                                                {socios.length > 0 && !selectedSocio && (
                                                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-emerald-500/30 rounded-lg shadow-2xl z-50 overflow-hidden max-h-[250px] overflow-y-auto">
                                                        <div className="p-2.5 bg-gray-950 border-b border-gray-800 text-[9px] uppercase font-bold text-gray-500 flex justify-between items-center sticky top-0 z-10">
                                                            <span>{searchQuery.length >= 2 ? 'Resultados de búsqueda' : 'Seleccione una entidad'}</span>
                                                            <span className="text-emerald-500">{socios.length} hallados</span>
                                                        </div>
                                                        {socios.map(s => (
                                                            <div
                                                                key={s.id}
                                                                className="p-3 hover:bg-emerald-500/10 cursor-pointer flex justify-between items-center border-b border-gray-800 last:border-0 transition-colors"
                                                                onClick={() => {
                                                                    setSelectedSocio(s)
                                                                    setSocios([])
                                                                    setSearchQuery('')
                                                                }}
                                                            >
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-sm text-white">{s.razon_social}</span>
                                                                    <span className="text-[10px] text-gray-500 font-mono">{s.cuit}</span>
                                                                </div>
                                                                <ChevronRight className="w-4 h-4 text-gray-700" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                                        <FileText className="w-5 h-5 text-emerald-400" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white">{selectedSocio.razon_social}</p>
                                                        <p className="text-xs text-gray-500">CUIT: {selectedSocio.cuit}</p>
                                                    </div>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={() => setSelectedSocio(null)} className="text-[10px] font-bold uppercase text-red-400 hover:text-red-300">
                                                    Cambiar
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Invoices List */}
                                    {selectedSocio && (
                                        <div className="space-y-4 pt-2">
                                            <div className="flex justify-between items-end">
                                                <div className="space-y-1">
                                                    <Label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Facturas Pendientes</Label>
                                                    <p className="text-[11px] text-gray-400 italic">Seleccione los comprobantes a cancelar</p>
                                                </div>
                                                <Badge variant="outline" className="bg-emerald-500/5 text-emerald-400 border-emerald-500/20 px-3 py-1 text-xs font-bold font-mono">
                                                    {pendingInvoices.length} HALLADAS
                                                </Badge>
                                            </div>

                                            {pendingInvoices.length === 0 ? (
                                                <div className="p-8 text-center border-2 border-dashed border-gray-800 rounded-xl">
                                                    <p className="text-gray-500 text-sm">No hay comprobantes pendientes para este socio.</p>
                                                </div>
                                            ) : (
                                                <div className="grid gap-2">
                                                    {pendingInvoices.map(inv => (
                                                        <div
                                                            key={inv.id}
                                                            className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${selectedInvoices[inv.id] ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}
                                                            onClick={() => toggleInvoice(inv)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedInvoices[inv.id] ? 'bg-emerald-500 border-emerald-500' : 'border-gray-700'}`}>
                                                                    {selectedInvoices[inv.id] && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-white uppercase">{inv.tipo.replace('_', ' ')} {inv.numero}</p>
                                                                    <p className="text-[10px] text-gray-500">Vence: {new Date(inv.fecha_vencimiento).toLocaleDateString('es-AR')}</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xs font-bold font-mono text-white">
                                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_pendiente)}
                                                                </p>
                                                                <p className="text-[10px] text-gray-500 uppercase font-bold">Saldo</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                    <div className="p-5 bg-gray-900/50 border border-gray-800 rounded-xl mb-6 flex justify-between items-center bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent">
                                        <div className="space-y-1">
                                            <p className="text-xs uppercase font-bold text-gray-500 tracking-wider">Resumen de Imputación</p>
                                            <p className="text-lg font-bold text-white tracking-tight">{selectedSocio?.razon_social}</p>
                                        </div>
                                        <div className="text-right space-y-1">
                                            <p className="text-xs uppercase font-bold text-gray-400 tracking-wider">Total a Cubrir</p>
                                            <p className="text-3xl font-black text-emerald-400 font-mono tracking-tighter">
                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalSelected)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs font-bold uppercase text-gray-500 tracking-wider">Detalle de Pagos / Recibidos</Label>
                                            <div className="flex items-center gap-2">
                                                {difference !== 0 && (
                                                    <span className={`text-[10px] font-bold flex items-center gap-1 ${Math.abs(difference) < 0.01 ? 'text-emerald-500' : 'text-orange-400'}`}>
                                                        <AlertCircle className="w-3 h-3" />
                                                        Diferencia: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(difference)}
                                                    </span>
                                                )}
                                                <Button
                                                    onClick={handleAddInstrument}
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 text-[10px] font-bold border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10"
                                                >
                                                    <Plus className="w-3.5 h-3.5 mr-1" /> AGREGAR VALOR
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {instruments.map((ins, index) => (
                                                <div key={ins.id} className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-4">
                                                    <div className="flex justify-between items-center gap-4">
                                                        <div className="grid grid-cols-[1.6fr_1fr] gap-4 flex-1">
                                                            <div className="space-y-1.5">
                                                                <Label className="text-xs uppercase text-gray-500 font-bold">Medio</Label>
                                                                <div className="flex gap-1 pb-1">
                                                                    {['efectivo', 'transferencia', 'cheque_terceros', 'cheque_propio'].map(m => (
                                                                        <button
                                                                            key={m}
                                                                            type="button"
                                                                            onClick={() => updateInstrument(ins.id, { metodo: m as any })}
                                                                            className={`px-2 py-1 rounded text-[8px] font-bold uppercase whitespace-nowrap border transition-all ${ins.metodo === m ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'}`}
                                                                        >
                                                                            {m.replace('_', ' ')}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <Label className="text-xs uppercase text-gray-500 font-bold">Monto</Label>
                                                                <div className="relative">
                                                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 font-bold">$</div>
                                                                    <Input
                                                                        type="number"
                                                                        value={ins.monto || ''}
                                                                        onChange={(e) => updateInstrument(ins.id, { monto: parseFloat(e.target.value) || 0 })}
                                                                        className="bg-gray-950 border-gray-800 h-11 text-sm font-mono pl-6 text-right font-bold text-white focus:ring-emerald-500/50"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            disabled={instruments.length === 1}
                                                            onClick={() => removeInstrument(ins.id)}
                                                            className="h-8 w-8 text-gray-600 hover:text-red-400"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>

                                                    {(ins.metodo.includes('cheque') || ins.metodo === 'transferencia') && (
                                                        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-800/50">
                                                            <div className="space-y-1">
                                                                <Label className="text-xs uppercase text-gray-500 font-bold">Banco</Label>
                                                                <div className="relative">
                                                                    <Landmark className="absolute left-2 top-3.5 w-4 h-4 text-gray-600" />
                                                                    <Input
                                                                        placeholder="Ej: Galicia"
                                                                        value={ins.banco}
                                                                        onChange={(e) => updateInstrument(ins.id, { banco: e.target.value })}
                                                                        className="bg-gray-950 border-gray-800 h-11 text-xs pl-8"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-xs uppercase text-gray-500 font-bold">Nro / Ref</Label>
                                                                <div className="relative">
                                                                    <Hash className="absolute left-2 top-3.5 w-4 h-4 text-gray-600" />
                                                                    <Input
                                                                        placeholder="00012345"
                                                                        value={ins.detalle_referencia}
                                                                        onChange={(e) => updateInstrument(ins.id, { detalle_referencia: e.target.value })}
                                                                        className="bg-gray-950 border-gray-800 h-11 text-xs pl-8 font-mono"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-xs uppercase text-gray-500 font-bold">Vencimiento</Label>
                                                                <div className="relative">
                                                                    <Calendar className="absolute left-2 top-3.5 w-4 h-4 text-gray-600" />
                                                                    <Input
                                                                        type="date"
                                                                        value={ins.fecha_disponibilidad}
                                                                        onChange={(e) => updateInstrument(ins.id, { fecha_disponibilidad: e.target.value })}
                                                                        className="bg-gray-950 border-gray-800 h-11 text-xs pl-8"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>

                <DialogFooter className="p-6 bg-gray-900/50 border-t border-gray-800 flex justify-between items-center w-full">
                    <div className="flex-1">
                        {step === 2 && (
                            <div className="flex items-center gap-2">
                                <Badge className={`bg-white/5 border-none font-mono ${Math.abs(difference) < 0.01 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                    MEDIOS: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalInstruments)}
                                </Badge>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {step === 1 ? (
                            <>
                                <Button variant="ghost" onClick={onClose} disabled={loading} className="text-gray-500 hover:text-white">
                                    Cancelar
                                </Button>
                                <Button
                                    disabled={!selectedSocio || totalSelected <= 0}
                                    onClick={() => setStep(2)}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2"
                                >
                                    Siguiente <ChevronRight className="w-4 h-4" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={() => setStep(1)} disabled={loading} className="text-gray-500 hover:text-white">
                                    <ChevronLeft className="w-4 h-4 mr-1" /> Volver
                                </Button>
                                <Button
                                    onClick={handleSave}
                                    disabled={loading || Math.abs(difference) > 0.02}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 shadow-lg shadow-emerald-500/20"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                    Registrar {tipo === 'cobro' ? 'Recibo' : 'Orden De Pago'}
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
