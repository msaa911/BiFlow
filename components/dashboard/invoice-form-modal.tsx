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
        tipo: type, // Valor inicial
        numero: '',
        monto_total: 0,
        fecha_emision: new Date().toISOString().split('T')[0],
        fecha_vencimiento: new Date().toISOString().split('T')[0],
        concepto: '',
        vinculado_id: ''
    })
    const [originalInvoices, setOriginalInvoices] = useState<any[]>([])

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
                tipo: invoice.tipo || type,
                numero: invoice.numero || '',
                monto_total: Number(invoice.monto_total) || 0,
                fecha_emision: invoice.fecha_emision || new Date().toISOString().split('T')[0],
                fecha_vencimiento: invoice.fecha_vencimiento || new Date().toISOString().split('T')[0],
                concepto: invoice.concepto || '',
                vinculado_id: invoice.vinculado_id || ''
            })
        } else {
            setFormData({
                socio_id: '',
                tipo: type,
                numero: '',
                monto_total: 0,
                fecha_emision: new Date().toISOString().split('T')[0],
                fecha_vencimiento: new Date().toISOString().split('T')[0],
                concepto: '',
                vinculado_id: ''
            })
        }
    }, [invoice, isOpen, orgId, type])

    useEffect(() => {
        async function fetchOriginalInvoices() {
            if (!formData.socio_id || !['nota_credito', 'nota_debito'].includes(formData.tipo)) return

            const supabase = createClient()
            const { data } = await supabase
                .from('comprobantes')
                .select('id, numero, fecha_emision, monto_total')
                .eq('entidad_id', formData.socio_id)
                .in('tipo', ['factura_venta', 'factura_compra'])
                .order('fecha_emision', { ascending: false })

            if (data) setOriginalInvoices(data)
        }
        fetchOriginalInvoices()
    }, [formData.socio_id, formData.tipo])

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

            const upsertData = {
                id: invoice?.id,
                organization_id: orgId,
                entidad_id: formData.socio_id,
                cuit_socio: selectedSocio.cuit,
                razon_social_socio: selectedSocio.razon_social,
                nombre_entidad: selectedSocio.razon_social,
                tipo: formData.tipo, // Usar el seleccionado en el form
                numero: formData.numero,
                monto_total: formData.monto_total,
                monto_pendiente: invoice?.monto_pendiente ?? formData.monto_total,
                fecha_emision: formData.fecha_emision,
                fecha_vencimiento: formData.fecha_vencimiento,
                estado: invoice?.estado || 'pendiente',
                condicion: 'cuenta_corriente',
                concepto: formData.concepto || null,
                vinculado_id: formData.vinculado_id || null,
                moneda: 'ARS'
            }

            const { error } = await supabase
                .from('comprobantes')
                .upsert(upsertData)

            if (error) {
                console.error('[Submit] Error de Supabase:', error)
                toast.error(`Error de base de datos: ${error.message} (${error.code})`)
                setLoading(false)
                return
            }

            toast.success(invoice ? 'Comprobante actualizado' : 'Comprobante registrado con éxito')
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error('[Submit] Error crítico en handleSubmit:', err)
            toast.error('Error crítico al guardar: ' + (err.message || 'Error desconocido'))
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
                                <Label className="text-xs uppercase text-gray-500 font-bold">Tipo de Comprobante</Label>
                                <Select
                                    value={formData.tipo}
                                    onValueChange={(val: any) => setFormData({ ...formData, tipo: val })}
                                >
                                    <SelectTrigger className="bg-gray-900 border-gray-800 h-11">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-900 border-gray-800 text-white">
                                        <SelectItem value={type}>Factura (Original)</SelectItem>
                                        <SelectItem value="nota_credito">Nota de Crédito</SelectItem>
                                        <SelectItem value="nota_debito">Nota de Débito</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {['nota_credito', 'nota_debito'].includes(formData.tipo) && (
                                <div className="col-span-2 space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <Label className="text-xs uppercase text-amber-500 font-bold tracking-wider">Vincular a Comprobante Original (AFIP)</Label>
                                    <Select
                                        value={formData.vinculado_id}
                                        onValueChange={(val) => setFormData({ ...formData, vinculado_id: val })}
                                    >
                                        <SelectTrigger className="bg-gray-900 border-amber-500/20 h-11 text-xs">
                                            <SelectValue placeholder="Seleccione la factura que está ajustando..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-900 border-gray-800 text-white max-h-[200px]">
                                            <SelectItem value="">Sin vincular (ajuste suelto)</SelectItem>
                                            {originalInvoices.map(inv => (
                                                <SelectItem key={inv.id} value={inv.id}>
                                                    {inv.numero || 'S/N'} - {new Date(inv.fecha_emision).toLocaleDateString()} (${new Intl.NumberFormat('es-AR').format(inv.monto_total)})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-gray-500 italic">Obligatorio segun RG 4540 de AFIP para notas de ajuste vinculadas.</p>
                                </div>
                            )}

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
                                <Label className="text-xs uppercase text-gray-500 font-bold">Monto Total</Label>
                                <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.monto_total || ''}
                                    onChange={(e) => setFormData({ ...formData, monto_total: Number(e.target.value) })}
                                    className="bg-gray-900 border-gray-800 text-right font-bold h-11 text-emerald-400"
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
                                                fecha_emision: newDate
                                            })
                                        }}
                                        className="bg-gray-900 border-gray-800 pl-10 block w-full h-11"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-emerald-400 font-bold">Fecha Vencimiento</Label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                                    <Input
                                        type="date"
                                        value={formData.fecha_vencimiento}
                                        onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                        className="bg-gray-900 border-emerald-500/30 text-emerald-400 pl-10 h-11"
                                        required
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
