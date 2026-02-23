'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, ShieldCheck, Landmark } from 'lucide-react'

interface EntityModalProps {
    isOpen: boolean
    onClose: () => void
    orgId: string
    entity?: any // If editing
    onSuccess: () => void
}

export function EntityModal({ isOpen, onClose, orgId, entity, onSuccess }: EntityModalProps) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        cuit: '',
        razon_social: '',
        categoria: 'proveedor',
        cbu_habitual: ''
    })

    useEffect(() => {
        if (entity) {
            setFormData({
                cuit: entity.cuit || '',
                razon_social: entity.razon_social || '',
                categoria: entity.categoria || 'proveedor',
                cbu_habitual: entity.metadata?.cbu_habitual || ''
            })
        } else {
            setFormData({
                cuit: '',
                razon_social: '',
                categoria: 'proveedor',
                cbu_habitual: ''
            })
        }
    }, [entity, isOpen])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const supabase = createClient()

        // Clean CUIT (remove dashes)
        const cleanCuit = formData.cuit.replace(/-/g, '')

        if (cleanCuit.length !== 11) {
            toast.error('El CUIT debe tener 11 dígitos')
            setLoading(false)
            return
        }

        try {
            const { error } = await supabase
                .from('entidades')
                .upsert({
                    id: entity?.id, // Keep ID if editing
                    organization_id: orgId,
                    cuit: cleanCuit,
                    razon_social: formData.razon_social,
                    categoria: formData.categoria,
                    metadata: {
                        ...entity?.metadata,
                        cbu_habitual: formData.cbu_habitual
                    },
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'organization_id, cuit'
                })

            if (error) throw error

            // Also update trust_ledger if CBU is provided
            if (formData.cbu_habitual) {
                await supabase.from('trust_ledger').upsert({
                    organization_id: orgId,
                    cuit: cleanCuit,
                    cbu: formData.cbu_habitual,
                    is_trusted: true,
                    last_seen: new Date().toISOString()
                }, {
                    onConflict: 'organization_id,cuit,cbu'
                })
            }

            toast.success(entity ? 'Socio actualizado' : 'Socio creado con éxito')
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error('Error saving entity:', err)
            toast.error('Error al guardar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        {entity ? 'Editar Socio' : 'Nuevo Socio'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="categoria" className="text-xs uppercase text-gray-500 font-bold">Categoría</Label>
                        <Select
                            value={formData.categoria}
                            onValueChange={(v: string) => setFormData({ ...formData, categoria: v })}
                        >
                            <SelectTrigger className="bg-gray-900 border-gray-800">
                                <SelectValue placeholder="Seleccionar categoría" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 border-gray-800 text-white">
                                <SelectItem value="cliente">Cliente</SelectItem>
                                <SelectItem value="proveedor">Proveedor</SelectItem>
                                <SelectItem value="ambos">Ambos (Cliente/Proveedor)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="razon_social" className="text-xs uppercase text-gray-500 font-bold">Razón Social / Nombre</Label>
                        <Input
                            id="razon_social"
                            placeholder="Ej: ACME S.A."
                            value={formData.razon_social}
                            onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                            className="bg-gray-900 border-gray-800"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="cuit" className="text-xs uppercase text-gray-500 font-bold">CUIT</Label>
                        <Input
                            id="cuit"
                            placeholder="00-00000000-0"
                            value={formData.cuit}
                            onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                            className="bg-gray-900 border-gray-800 font-mono"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="cbu" className="text-xs uppercase text-gray-500 font-bold">CBU / CVU Habitual</Label>
                            <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" /> Trust Ledger
                            </span>
                        </div>
                        <div className="relative">
                            <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <Input
                                id="cbu"
                                placeholder="22 dígitos"
                                value={formData.cbu_habitual}
                                onChange={(e) => setFormData({ ...formData, cbu_habitual: e.target.value })}
                                className="bg-gray-900 border-gray-800 pl-10 font-mono text-sm"
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {entity ? 'Guardar Cambios' : 'Crear Socio'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
