'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Calendar, Landmark, Hash, Search } from 'lucide-react'

interface InvoiceFormModalProps {
    isOpen: boolean
    onClose: () => void
    orgId: string
    type: 'factura_venta' | 'factura_compra'
    invoice?: any // If editing
    onSuccess: () => void
}

export function InvoiceFormModal({ isOpen, onClose, orgId, type, invoice, onSuccess }: InvoiceFormModalProps) {
    const [loading, setLoading] = useState(false)
    const [socios, setSocios] = useState<any[]>([])
    const [searchingSocio, setSearchingSocio] = useState(false)
    const [formData, setFormData] = useState({
        socio_id: '',
        numero: '',
        monto_total: 0,
        fecha_emision: new Date().toISOString().split('T')[0],
        fecha_vencimiento: new Date().toISOString().split('T')[0],
        banco: '',
        numero_cheque: '',
        condicion: 'cuenta_corriente',
        metodo_pago: '',
        concepto: ''
    })

    useEffect(() => {
        async function fetchInitialSocios() {
            setSearchingSocio(true)
            const supabase = createClient()

            // Filtrado estricto por categoría
            const targetCat = type === 'factura_venta' ? 'cliente' : 'proveedor'

            const { data } = await supabase
                .from('entidades')
                .select('id, razon_social, cuit, categoria')
                .eq('organization_id', orgId)
                .in('categoria', [targetCat, 'ambos']) // Filtrado PROACTIVO
                .order('razon_social')
                .limit(20)

            if (data) {
                let finalSocios = [...data]
                // Si el socio de la factura no está en los 20 primeros, lo buscamos específicamente
                if (invoice?.entidad_id && !data.find(s => s.id === invoice.entidad_id)) {
                    const { data: specificSocio } = await supabase
                        .from('entidades')
                        .select('id, razon_social, cuit, categoria')
                        .eq('id', invoice.entidad_id)
                        .single()
                    if (specificSocio) finalSocios = [specificSocio, ...finalSocios]
                }
                setSocios(finalSocios)
            }
            setSearchingSocio(false)
        }

        if (isOpen) {
            fetchInitialSocios()
        }

        if (invoice) {
            setFormData({
                socio_id: invoice.entidad_id || '',
                numero: invoice.numero || '',
                monto_total: Number(invoice.monto_total) || 0,
                fecha_emision: invoice.fecha_emision || new Date().toISOString().split('T')[0],
                fecha_vencimiento: invoice.fecha_vencimiento || new Date().toISOString().split('T')[0],
                banco: invoice.banco || '',
                numero_cheque: invoice.numero_cheque || '',
                condicion: invoice.condicion || 'cuenta_corriente',
                metodo_pago: invoice.metodo_pago || '',
                concepto: invoice.concepto || ''
            })
        } else {
            // Reset for new invoice
            setFormData({
                socio_id: '',
                numero: '',
                monto_total: 0,
                fecha_emision: new Date().toISOString().split('T')[0],
                fecha_vencimiento: new Date().toISOString().split('T')[0],
                banco: '',
                numero_cheque: '',
                condicion: 'cuenta_corriente',
                metodo_pago: '',
                concepto: ''
            })
        }
    }, [invoice, isOpen, orgId])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        console.log('[Submit] Iniciando registro de comprobante...', { formData, type })
        setLoading(true)

        if (!formData.socio_id) {
            toast.error(`Debe seleccionar un ${type === 'factura_venta' ? 'Cliente' : 'Proveedor'}`)
            setLoading(false)
            return
        }

        const supabase = createClient()
        try {
            // Obtener datos frescos del socio para evitar depender del estado local volátil 'socios'
            const { data: selectedSocio, error: socioError } = await supabase
                .from('entidades')
                .select('id, razon_social, cuit, categoria')
                .eq('id', formData.socio_id)
                .single()

            if (socioError || !selectedSocio) {
                console.error('[Submit] Error al obtener socio:', socioError)
                toast.error('No se pudo validar el socio seleccionado.')
                setLoading(false)
                return
            }

            // Lógica de Categoría Dual Dinámica
            const isVenta = type === 'factura_venta'
            const currentCat = selectedSocio.categoria
            let newCat = currentCat

            if (isVenta && currentCat === 'proveedor') newCat = 'ambos'
            if (!isVenta && currentCat === 'cliente') newCat = 'ambos'

            if (newCat !== currentCat) {
                console.log(`[Categoría] Actualizando socio ${selectedSocio.razon_social} a: ${newCat}`)
                await supabase
                    .from('entidades')
                    .update({ categoria: newCat })
                    .eq('id', selectedSocio.id)
            }

            console.log('[Submit] Enviando datos a Supabase...', {
                entidad_id: formData.socio_id,
                tipo: type,
                monto: formData.monto_total
            })

            const { error } = await supabase
                .from('comprobantes')
                .upsert({
                    id: invoice?.id,
                    organization_id: orgId,
                    entidad_id: formData.socio_id,
                    cuit_socio: selectedSocio.cuit,
                    razon_social_socio: selectedSocio.razon_social,
                    tipo: type,
                    numero: formData.numero,
                    monto_total: formData.monto_total,
                    monto_pendiente: (invoice?.estado === 'pagado' || formData.condicion === 'contado') ? 0 : formData.monto_total,
                    fecha_emision: formData.fecha_emision,
                    fecha_vencimiento: formData.fecha_vencimiento,
                    estado: formData.condicion === 'contado' ? 'pagado' : (invoice?.estado || 'pendiente'),
                    banco: formData.banco,
                    numero_cheque: formData.numero_cheque,
                    condicion: formData.condicion,
                    metodo_pago: formData.metodo_pago,
                    concepto: formData.concepto
                })

            if (error) {
                console.error('[Submit] Error de Supabase:', error)
                throw error
            }

            toast.success(invoice ? 'Comprobante actualizado' : 'Comprobante registrado con éxito')
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error('Error saving invoice:', err)
            toast.error('Error al guardar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-[500px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <div className="p-6 pb-2">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">
                            {invoice ? 'Editar Comprobante' : `Nuevo ${type === 'factura_venta' ? 'Ingreso' : 'Egreso'}`}
                        </DialogTitle>
                    </DialogHeader>
                </div>

                <div className="max-h-[70vh] overflow-y-auto pr-4 custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4 focus:outline-none">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-xs uppercase text-gray-500 font-bold">
                                        {type === 'factura_venta' ? 'Cliente' : 'Proveedor'}
                                    </Label>
                                    {formData.socio_id && (
                                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                            Vinculado
                                        </Badge>
                                    )}
                                </div>
                                <div className="space-y-2 relative">
                                    <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 focus-within:border-emerald-500/50 transition-colors">
                                        <Search className="w-4 h-4 text-gray-500" />
                                        <Input
                                            placeholder={`Buscar ${type === 'factura_venta' ? 'cliente' : 'proveedor'}...`}
                                            className="bg-transparent border-none focus-visible:ring-0 h-11 px-0"
                                            onChange={async (e) => {
                                                const term = e.target.value
                                                const supabase = createClient()
                                                const targetCat = type === 'factura_venta' ? 'cliente' : 'proveedor'

                                                setSearchingSocio(true)
                                                const { data } = await supabase
                                                    .from('entidades')
                                                    .select('id, razon_social, cuit, categoria')
                                                    .eq('organization_id', orgId)
                                                    .in('categoria', [targetCat, 'ambos'])
                                                    .or(`razon_social.ilike.%${term}%,cuit.ilike.%${term}%`)
                                                    .limit(10)

                                                if (data) setSocios(data)
                                                setSearchingSocio(false)
                                            }}
                                        />
                                    </div>

                                    {/* Lista de resultados */}
                                    <div className="mt-1 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                                        {searchingSocio ? (
                                            <div className="p-4 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                Buscando...
                                            </div>
                                        ) : socios.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-gray-500">No se encontraron resultados.</div>
                                        ) : (
                                            socios.map(s => (
                                                <div
                                                    key={s.id}
                                                    onClick={() => setFormData({ ...formData, socio_id: s.id })}
                                                    className={`p-3 cursor-pointer hover:bg-emerald-600/20 border-b border-gray-800/50 transition-all flex justify-between items-center ${formData.socio_id === s.id ? 'bg-emerald-600/30 border-l-4 border-l-emerald-500 pl-2' : ''}`}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-white leading-none mb-1">{s.razon_social}</span>
                                                        <span className="text-[10px] text-gray-500 font-mono tracking-tight">{s.cuit}</span>
                                                    </div>
                                                    {formData.socio_id === s.id && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-2 space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Concepto / Operación Personalizada</Label>
                                <Input
                                    placeholder={type === 'factura_venta' ? 'Ej: Venta de servicios de consultoría' : 'Ej: Compra de insumos de oficina'}
                                    value={formData.concepto}
                                    onChange={(e) => setFormData({ ...formData, concepto: e.target.value })}
                                    className="bg-gray-900 border-gray-800"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Condición</Label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-900 border border-gray-800 rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({
                                            ...formData,
                                            condicion: 'contado',
                                            fecha_vencimiento: formData.fecha_emision
                                        })}
                                        className={`py-2 px-3 rounded-md text-xs font-bold transition-all ${formData.condicion === 'contado' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        Contado
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, condicion: 'cuenta_corriente' })}
                                        className={`py-2 px-3 rounded-md text-xs font-bold transition-all ${formData.condicion === 'cuenta_corriente' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        Cuenta Corriente
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 relative">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Medio de Pago</Label>
                                <div className="space-y-1">
                                    <div className="bg-gray-900 border border-gray-800 rounded-lg max-h-[150px] overflow-y-auto custom-scrollbar">
                                        {[
                                            { id: 'efectivo', label: 'Efectivo' },
                                            { id: 'transferencia', label: 'Transferencia' },
                                            { id: 'tarjeta_debito', label: 'Tarjeta de Débito' },
                                            { id: 'tarjeta_credito', label: 'Tarjeta de Crédito' },
                                            ...(type === 'factura_compra' ? [
                                                { id: 'cheque_propio', label: 'Cheque Propio' },
                                                { id: 'cheque_terceros', label: 'Cheque de Terceros (Endosado)' },
                                                { id: 'retenciones', label: 'Retenciones Impositivas' }
                                            ] : [
                                                { id: 'cheque', label: 'Cheque' }
                                            ]),
                                            { id: 'a_convenir', label: 'A convenir' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, metodo_pago: opt.id })}
                                                className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-gray-800 last:border-0 hover:bg-emerald-600/10 ${formData.metodo_pago === opt.id ? 'bg-emerald-600/20 text-emerald-400 font-bold' : 'text-gray-400'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Número de Factura</Label>
                                <Input
                                    placeholder="0001-00001234"
                                    value={formData.numero}
                                    onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                                    className="bg-gray-900 border-gray-800"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Monto Total</Label>
                                <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.monto_total || ''}
                                    onChange={(e) => setFormData({ ...formData, monto_total: Number(e.target.value) })}
                                    className="bg-gray-900 border-gray-800 text-right font-bold"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Fecha Emisión</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                    <Input
                                        type="date"
                                        value={formData.fecha_emision}
                                        onChange={(e) => {
                                            const newDate = e.target.value
                                            setFormData({
                                                ...formData,
                                                fecha_emision: newDate,
                                                fecha_vencimiento: formData.condicion === 'contado' ? newDate : formData.fecha_vencimiento
                                            })
                                        }}
                                        className="bg-gray-900 border-gray-800 pl-10 block w-full"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className={`text-xs uppercase text-gray-500 font-bold ${formData.condicion === 'contado' ? 'opacity-50' : 'text-emerald-400'}`}>
                                    Fecha Vencimiento
                                </Label>
                                <div className="relative">
                                    <Calendar className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${formData.condicion === 'contado' ? 'text-gray-600' : 'text-emerald-500'}`} />
                                    <Input
                                        type="date"
                                        value={formData.fecha_vencimiento}
                                        disabled={formData.condicion === 'contado'}
                                        onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                        className={`bg-gray-900 pl-10 ${formData.condicion === 'contado' ? 'border-gray-800 text-gray-500 opacity-50 cursor-not-allowed' : 'border-emerald-500/30 text-emerald-400'}`}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Banco (Si aplica)</Label>
                                <div className="relative">
                                    <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <Input
                                        placeholder="Ej: Banco Galicia"
                                        value={formData.banco}
                                        onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                                        className="bg-gray-900 border-gray-800 pl-10"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Número de Instrumento</Label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <Input
                                        placeholder="8 dígitos / Nº Transf."
                                        value={formData.numero_cheque}
                                        onChange={(e) => setFormData({ ...formData, numero_cheque: e.target.value })}
                                        className="bg-gray-900 border-gray-800 pl-10 font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-4 px-0">
                            <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="text-gray-400">
                                Cancelar
                            </Button>
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {invoice ? 'Guardar Cambios' : 'Registrar'}
                            </Button>
                        </DialogFooter>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    )
}
