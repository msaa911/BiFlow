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
    type: 'factura_venta' | 'factura_compra' | 'ingreso_vario' | 'egreso_vario'
    invoice?: any // If editing
    onSuccess: () => void
}

export function InvoiceFormModal({ isOpen, onClose, orgId, type, invoice, onSuccess }: InvoiceFormModalProps) {
    const [loading, setLoading] = useState(false)
    const [entidades, setEntidades] = useState<any[]>([])
    const [searchingEntidad, setSearchingEntidad] = useState(false)
    const [formData, setFormData] = useState({
        entidad_id: '',
        tipo: type,
        numero: '',
        monto_total: 0,
        fecha_emision: new Date().toISOString().split('T')[0],
        fecha_vencimiento: new Date().toISOString().split('T')[0],
        condicion: 'cuenta_corriente',
        concepto: '',
        vinculado_id: 'none'
    })
    const [searchQuery, setSearchQuery] = useState('')
    const [originalInvoices, setOriginalInvoices] = useState<any[]>([])
    const [initialized, setInitialized] = useState(false)

    async function fetchInitialEntities() {
        setSearchingEntidad(true)
        const supabase = createClient()

        // Filtrado estricto por categoría
        const targetCat = type === 'factura_venta' ? 'cliente' : 'proveedor'

        const { data } = await supabase
            .from('entidades')
            .select('id, razon_social, cuit, categoria')
            .eq('organization_id', orgId)
            .in('categoria', [targetCat, 'ambos'])
            .order('razon_social')
            .limit(20)

        if (data) {
            let finalEntidades = [...data]
            // Si la entidad de la factura no está en los 20 primeros, la buscamos específicamente
            if (invoice?.entidad_id && !data.find(s => s.id === invoice.entidad_id)) {
                const { data: specificEntidad } = await supabase
                    .from('entidades')
                    .select('id, razon_social, cuit, categoria')
                    .eq('id', invoice.entidad_id)
                    .single()
                if (specificEntidad) finalEntidades = [specificEntidad, ...finalEntidades]
            }
            setEntidades(finalEntidades)
        }
        setSearchingEntidad(false)
    }

    useEffect(() => {
        if (isOpen && !initialized) {
            console.log('[InvoiceForm] Initializing form...')
            fetchInitialEntities()

            if (invoice) {
                setFormData({
                    entidad_id: invoice.entidad_id || '',
                    tipo: invoice.tipo || type,
                    numero: invoice.nro_factura || invoice.numero || '',
                    monto_total: Number(invoice.monto_total) || 0,
                    fecha_emision: invoice.fecha_emision || new Date().toISOString().split('T')[0],
                    fecha_vencimiento: invoice.fecha_vencimiento || new Date().toISOString().split('T')[0],
                    condicion: invoice.condicion || 'cuenta_corriente',
                    concepto: invoice.concepto || '',
                    vinculado_id: invoice.vinculado_id || 'none'
                })
                setSearchQuery(invoice.razon_social_entidad || invoice.razon_social_socio || '')
            } else {
                setFormData({
                    entidad_id: '',
                    tipo: type,
                    numero: '',
                    monto_total: 0,
                    fecha_emision: new Date().toISOString().split('T')[0],
                    fecha_vencimiento: new Date().toISOString().split('T')[0],
                    condicion: 'cuenta_corriente',
                    concepto: '',
                    vinculado_id: 'none'
                })
                setSearchQuery('')
            }
            setInitialized(true)
        }

        if (!isOpen) {
            setInitialized(false)
            setEntidades([])
            setSearchQuery('')
        }
    }, [invoice, isOpen, orgId, type, initialized])

    useEffect(() => {
        async function fetchOriginalInvoices() {
            if (!formData.entidad_id || !['nota_credito', 'nota_debito'].includes(formData.tipo)) return

            const supabase = createClient()
            const { data } = await supabase
                .from('comprobantes')
                .select('id, numero, fecha_emision, monto_total')
                .eq('entidad_id', formData.entidad_id)
                .in('tipo', ['factura_venta', 'factura_compra'])
                .order('fecha_emision', { ascending: false })

            if (data) setOriginalInvoices(data)
        }
        fetchOriginalInvoices()
    }, [formData.entidad_id, formData.tipo])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        console.log('[InvoiceForm] START handleSubmit', { formData, type })
        setLoading(true)

        try {
            if (!formData.entidad_id || formData.entidad_id === 'none') {
                toast.error(`Debe seleccionar un ${(type === 'factura_venta' || type === 'ingreso_vario') ? 'Cliente' : 'Proveedor'}`)
                setLoading(false)
                return
            }

            if (!formData.concepto || formData.concepto.trim() === '') {
                toast.error('El concepto es obligatorio')
                setLoading(false)
                return
            }

            const supabase = createClient()
            console.log('[InvoiceForm] Validating entidad:', formData.entidad_id)

            const { data: selectedEntidad, error: entidadError } = await supabase
                .from('entidades')
                .select('id, razon_social, cuit, categoria')
                .eq('id', formData.entidad_id)
                .single()

            if (entidadError || !selectedEntidad) {
                console.error('[InvoiceForm] Error entidad validation:', entidadError)
                toast.error('No se pudo validar la entidad seleccionada: ' + (entidadError?.message || 'No encontrada'))
                setLoading(false)
                return
            }

            if (!selectedEntidad) return

            console.log('[InvoiceForm] Entidad validada:', selectedEntidad.razon_social)

            const upsertData: Record<string, any> = {
                organization_id: orgId,
                entidad_id: formData.entidad_id,
                cuit_socio: selectedEntidad.cuit,
                razon_social_entidad: selectedEntidad.razon_social,
                nombre_entidad: selectedEntidad.razon_social,
                tipo: formData.tipo,
                nro_factura: formData.numero || null,
                monto_total: formData.monto_total,
                monto_pendiente: formData.condicion === 'contado' ? 0 : (invoice?.monto_pendiente ?? formData.monto_total),
                fecha_emision: formData.fecha_emision,
                fecha_vencimiento: formData.fecha_vencimiento,
                estado: formData.condicion === 'contado' ? 'pagado' : (invoice?.estado || 'pendiente'),
                condicion: formData.condicion,
                concepto: formData.concepto || null,
                moneda: 'ARS'
            }

            // Solo incluir id si estamos editando (evitar enviar undefined)
            if (invoice?.id) {
                upsertData.id = invoice.id
            }

            // Solo incluir vinculado_id para NC/ND (columna puede no existir en schemas antiguos)
            if (['nota_credito', 'nota_debito'].includes(formData.tipo)) {
                const vinculadoVal = formData.vinculado_id === 'none' ? null : (formData.vinculado_id || null)
                if (vinculadoVal) {
                    upsertData.vinculado_id = vinculadoVal
                }
            }

            console.log('[InvoiceForm] Sending to Supabase (Optimized with Timeout)...')
            const startTime = Date.now()

            let query;
            if (invoice?.id) {
                query = supabase.from('comprobantes').update(upsertData).eq('id', invoice.id).select().single()
            } else {
                query = supabase.from('comprobantes').insert([upsertData]).select().single()
            }

            // Timeout de 15 segundos
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Tiempo de espera agotado en la base de datos (15s)')), 15000)
            );

            const { data: savedInvoice, error } = (await Promise.race([
                query,
                timeoutPromise
            ])) as { data: any, error: any }

            console.log(`[InvoiceForm] DB Response in ${Date.now() - startTime}ms`, { error })

            if (error) {
                console.error('[InvoiceForm] Database error:', error)
                toast.error(`Error de base de datos: ${error.message}`)
                setLoading(false)
                return
            }

            // SI ES CONTADO -> GENERAR RECIBO AUTOMATICO
            if (formData.condicion === 'contado' && savedInvoice) {
                console.log('[InvoiceForm] Generando pago automático por Condición Contado...')

                // 1. Crear Movimiento de Tesorería
                const { data: mov, error: movErr } = await supabase.from('movimientos_tesoreria').insert({
                    organization_id: orgId,
                    entidad_id: formData.entidad_id,
                    tipo: (type === 'factura_venta' || type === 'ingreso_vario') ? 'cobro' : 'pago',
                    monto_total: formData.monto_total,
                    fecha: formData.fecha_emision,
                    observaciones: `Cierre automático: Pago Contado ${savedInvoice.numero || ''}`
                }).select().single()

                if (!movErr && mov) {
                    // 2. Crear Instrumento (Efectivo por defecto)
                    await supabase.from('instrumentos_pago').insert({
                        movimiento_id: mov.id,
                        metodo: 'efectivo',
                        monto: formData.monto_total,
                        fecha_disponibilidad: formData.fecha_emision
                    })

                    // 3. Crear Aplicación
                    await supabase.from('aplicaciones_pago').insert({
                        movimiento_id: mov.id,
                        comprobante_id: savedInvoice.id,
                        monto_aplicado: formData.monto_total
                    })

                    toast.success(`Pago automático ${mov.numero} registrado`)
                } else if (movErr) {
                    console.error('[InvoiceForm] Error en pago auto:', movErr)
                }
            }

            console.log('[InvoiceForm] SUCCESS - Closing Modal and Refreshing')
            toast.success(invoice ? 'Comprobante actualizado' : 'Comprobante registrado con éxito')

            // Acción inmediata: Cerrar modal
            onClose()

            // Acción diferida: Refrescar datos para no bloquear el cierre
            setTimeout(() => {
                onSuccess()
            }, 100)
        } catch (err: any) {
            console.error('[InvoiceForm] CRITICAL ERROR:', err)
            toast.error('Error crítico: ' + (err.message || 'Error desconocido'))
        } finally {
            console.log('[InvoiceForm] END handleSubmit')
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-[500px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <div className="p-6 pb-2">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            {invoice ? 'Editar Comprobante' : `Nuevo ${type === 'factura_venta' ? 'Ingreso' : 'Egreso'}`}
                        </DialogTitle>
                    </DialogHeader>
                </div>

                <div className="max-h-[70vh] overflow-y-auto pr-4 custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-4 py-4 focus:outline-none">
                        <div className="grid grid-cols-2 gap-4">
                            {/* 1. Tipo de Comprobante - Movido al principio para evitar overlap con la búsqueda */}
                            <div className="col-span-2 space-y-2">
                                <Label className="text-xs uppercase text-emerald-500 font-bold tracking-wider">¿Qué estás registrando?</Label>
                                <Select
                                    value={formData.tipo}
                                    onValueChange={(val: any) => {
                                        console.log('[Form] Tipo cambiado a:', val)
                                        setFormData({ ...formData, tipo: val })
                                    }}
                                >
                                    <SelectTrigger className="bg-gray-900 border-gray-800 h-11 focus:ring-emerald-500/50 z-[60]">
                                        <SelectValue placeholder="Seleccione el tipo..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-950 border-gray-800 text-white z-[200]" position="popper" sideOffset={5}>
                                        <SelectItem value={type.includes('venta') || type.includes('ingreso') ? 'factura_venta' : 'factura_compra'} className="focus:bg-emerald-600 focus:text-white cursor-pointer">
                                            Factura (Original)
                                        </SelectItem>
                                        <SelectItem value={type.includes('venta') || type.includes('ingreso') ? 'ingreso_vario' : 'egreso_vario'} className="focus:bg-emerald-600 focus:text-white cursor-pointer">
                                            {type.includes('venta') || type.includes('ingreso') ? 'Ingresos Varios' : 'Egresos Varios'}
                                        </SelectItem>
                                        <SelectItem value="nota_credito" className="focus:bg-emerald-600 focus:text-white cursor-pointer">Nota de Crédito</SelectItem>
                                        <SelectItem value="nota_debito" className="focus:bg-emerald-600 focus:text-white cursor-pointer">Nota de Débito</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Condición de Pago */}
                            <div className="col-span-2 space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Condición de Pago</Label>
                                <Select
                                    value={formData.condicion}
                                    onValueChange={(val: any) => setFormData({ ...formData, condicion: val })}
                                >
                                    <SelectTrigger className="bg-gray-900 border-gray-800 h-11 focus:ring-emerald-500/50">
                                        <SelectValue placeholder="Seleccione condición..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-950 border-gray-800 text-white">
                                        <SelectItem value="cuenta_corriente">Cuenta Corriente (A cobrar luego)</SelectItem>
                                        <SelectItem value="contado">Contado (Pagado/Cobrado ahora)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Entidad (Cliente/Proveedor) */}
                            <div className="col-span-2 space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-xs uppercase text-gray-500 font-bold">
                                        {type === 'factura_venta' ? 'Cliente / Entidad' : 'Proveedor / Entidad'}
                                    </Label>
                                    {formData.entidad_id && (
                                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                            Entidad Seleccionada
                                        </Badge>
                                    )}
                                </div>
                                <div className="space-y-2 relative">
                                    <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 focus-within:border-emerald-500/50 transition-colors">
                                        <Search className="w-4 h-4 text-gray-500" />
                                        <Input
                                            placeholder={`Buscar por nombre o CUIT...`}
                                            className="bg-transparent border-none focus-visible:ring-0 h-11 px-0"
                                            value={searchQuery}
                                            onChange={async (e) => {
                                                const term = e.target.value
                                                setSearchQuery(term)

                                                if (!term || term.length < 2) {
                                                    setEntidades([])
                                                    return
                                                }

                                                const supabase = createClient()
                                                const targetCat = (type === 'factura_venta' || type === 'ingreso_vario') ? 'cliente' : 'proveedor'

                                                setSearchingEntidad(true)
                                                const { data } = await supabase
                                                    .from('entidades')
                                                    .select('id, razon_social, cuit, categoria')
                                                    .eq('organization_id', orgId)
                                                    .in('categoria', [targetCat, 'ambos'])
                                                    .or(`razon_social.ilike.%${term}%,cuit.ilike.%${term}%`)
                                                    .limit(10)

                                                if (data) setEntidades(data)
                                                setSearchingEntidad(false)
                                            }}
                                        />
                                        {formData.entidad_id && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    console.log('[InvoiceForm] Reseting entidad search...')
                                                    setFormData({ ...formData, entidad_id: '' })
                                                    setSearchQuery('')
                                                    fetchInitialEntities()
                                                }}
                                                className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded hover:bg-red-500/20 font-bold uppercase transition-colors"
                                            >
                                                Cambiar
                                            </button>
                                        )}
                                    </div>

                                    {/* Lista de resultados - Añadido un z-index más agresivo and min-height behavior */}
                                    {entidades.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 z-[200] mt-1 bg-gray-950 border border-emerald-500/30 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden max-h-[180px] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                                            <div className="p-1.5 bg-gray-900/50 border-b border-gray-800 text-[9px] uppercase font-bold text-gray-500 flex justify-between items-center">
                                                <span>Seleccione una entidad</span>
                                                <span className="text-emerald-500">{entidades.length} hallados</span>
                                            </div>
                                            {searchingEntidad ? (
                                                <div className="p-4 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Buscando...
                                                </div>
                                            ) : (
                                                entidades.map(s => (
                                                    <div
                                                        key={s.id}
                                                        onClick={() => {
                                                            console.log('[InvoiceForm] Entidad seleccionada:', s.razon_social)
                                                            setFormData({ ...formData, entidad_id: s.id })
                                                            setSearchQuery(s.razon_social)
                                                            setEntidades([])
                                                        }}
                                                        className={`p-3 cursor-pointer hover:bg-emerald-600/20 border-b border-gray-800/50 transition-all flex justify-between items-center ${formData.entidad_id === s.id ? 'bg-emerald-600/30 border-l-4 border-l-emerald-500 pl-2' : ''}`}
                                                    >
                                                        <div className="flex flex-col text-left">
                                                            <span className="text-sm font-bold text-white leading-none mb-1">{s.razon_social}</span>
                                                            <span className="text-[10px] text-gray-500 font-mono tracking-tight">{s.cuit}</span>
                                                        </div>
                                                        {formData.entidad_id === s.id && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Campo de Número de Comprobante */}
                            <div className="col-span-2 space-y-2">
                                <Label className="text-xs uppercase text-gray-500 font-bold">Número de Comprobante (Opcional)</Label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                    <Input
                                        placeholder="0001-00001234"
                                        value={formData.numero}
                                        onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                                        className="bg-gray-900 border-gray-800 pl-10 font-mono"
                                    />
                                </div>
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
                                            <SelectItem value="none">Sin vincular (ajuste suelto)</SelectItem>
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
                                <Label className="text-xs uppercase text-gray-500 font-bold flex items-center gap-1">
                                    Concepto / Operación Personalizada
                                    <span className="text-red-500">*</span>
                                </Label>
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
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm" disabled={loading}>
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
