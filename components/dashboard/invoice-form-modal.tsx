'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
        numero_cheque: ''
    })

    useEffect(() => {
        async function fetchInitialSocios() {
            setSearchingSocio(true)
            const supabase = createClient()
            const { data } = await supabase
                .from('entidades')
                .select('id, razon_social, cuit')
                .eq('organization_id', orgId)
                .order('razon_social')
                .limit(10)
            if (data) setSocios(data)
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
                numero_cheque: invoice.numero_cheque || ''
            })
        }
    }, [invoice, isOpen, orgId])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const selectedSocio = socios.find(s => s.id === formData.socio_id)
        if (!selectedSocio) {
            toast.error('Debe seleccionar un socio (Cliente/Proveedor)')
            setLoading(false)
            return
        }

        const supabase = createClient()
        try {
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
                    monto_pendiente: invoice?.estado === 'pagado' ? 0 : formData.monto_total,
                    fecha_emision: formData.fecha_emision,
                    fecha_vencimiento: formData.fecha_vencimiento,
                    estado: invoice?.estado || 'pendiente',
                    banco: formData.banco,
                    numero_cheque: formData.numero_cheque
                })

            if (error) throw error

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
            <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">
                        {invoice ? 'Editar Comprobante' : `Nuevo ${type === 'factura_venta' ? 'Ingreso' : 'Egreso'}`}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 space-y-2">
                            <Label className="text-xs uppercase text-gray-500 font-bold">Socio (Cliente/Proveedor)</Label>
                            <Select
                                value={formData.socio_id}
                                onValueChange={(v) => setFormData({ ...formData, socio_id: v })}
                            >
                                <SelectTrigger className="bg-gray-900 border-gray-800">
                                    <SelectValue placeholder="Seleccionar socio..." />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900 border-gray-800 text-white">
                                    {searchingSocio ? (
                                        <div className="p-2 text-center text-xs text-gray-500">Buscando...</div>
                                    ) : socios.length === 0 ? (
                                        <div className="p-2 text-center text-xs text-gray-500 font-bold">No hay socios registrados. Créalos primero.</div>
                                    ) : (
                                        socios.map(s => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.razon_social} ({s.cuit})
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase text-gray-500 font-bold">Número</Label>
                            <Input
                                placeholder="0001-00001234"
                                value={formData.numero}
                                onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                                className="bg-gray-900 border-gray-800"
                                required
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
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                    type="date"
                                    value={formData.fecha_emision}
                                    onChange={(e) => setFormData({ ...formData, fecha_emision: e.target.value })}
                                    className="bg-gray-900 border-gray-800 pl-10"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs uppercase text-gray-500 font-bold text-emerald-400">Fecha Vencimiento</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                                <Input
                                    type="date"
                                    value={formData.fecha_vencimiento}
                                    onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                                    className="bg-gray-900 border-emerald-500/30 pl-10 text-emerald-400"
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
                            <Label className="text-xs uppercase text-gray-500 font-bold">Número de Cheque</Label>
                            <div className="relative">
                                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                    placeholder="8 dígitos"
                                    value={formData.numero_cheque}
                                    onChange={(e) => setFormData({ ...formData, numero_cheque: e.target.value })}
                                    className="bg-gray-900 border-gray-800 pl-10 font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {invoice ? 'Guardar Cambios' : 'Registrar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
