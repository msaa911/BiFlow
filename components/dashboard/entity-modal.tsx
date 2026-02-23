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
    defaultCategory?: 'cliente' | 'proveedor'
}

export function EntityModal({ isOpen, onClose, orgId, entity, onSuccess, defaultCategory = 'proveedor' }: EntityModalProps) {
    const [loading, setLoading] = useState(false)
    const [showOptional, setShowOptional] = useState(false)
    const [formData, setFormData] = useState({
        cuit: '',
        razon_social: '',
        categoria: defaultCategory as 'cliente' | 'proveedor' | 'ambos',
        cbu_habitual: '',
        direccion: '',
        localidad: '',
        codigo_postal: '',
        provincia: '',
        pais: 'Argentina',
        telefono_1: '',
        telefono_2: '',
        email: '',
        contacto: ''
    })

    useEffect(() => {
        if (entity) {
            setFormData({
                cuit: entity.cuit || '',
                razon_social: entity.razon_social || '',
                categoria: entity.categoria || defaultCategory,
                cbu_habitual: entity.metadata?.cbu_habitual || '',
                direccion: entity.metadata?.direccion || '',
                localidad: entity.metadata?.localidad || '',
                codigo_postal: entity.metadata?.codigo_postal || '',
                provincia: entity.metadata?.provincia || '',
                pais: entity.metadata?.pais || 'Argentina',
                telefono_1: entity.metadata?.telefono_1 || '',
                telefono_2: entity.metadata?.telefono_2 || '',
                email: entity.metadata?.email || '',
                contacto: entity.metadata?.contacto || ''
            })
            // If any optional field has data, show the section
            const hasOptional = !!(
                entity.metadata?.direccion ||
                entity.metadata?.localidad ||
                entity.metadata?.telefono_1 ||
                entity.metadata?.email
            )
            setShowOptional(hasOptional)
        } else {
            setFormData({
                cuit: '',
                razon_social: '',
                categoria: defaultCategory,
                cbu_habitual: '',
                direccion: '',
                localidad: '',
                codigo_postal: '',
                provincia: '',
                pais: 'Argentina',
                telefono_1: '',
                telefono_2: '',
                email: '',
                contacto: ''
            })
            setShowOptional(false)
        }
    }, [entity, isOpen, defaultCategory])

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
                        cbu_habitual: formData.cbu_habitual,
                        direccion: formData.direccion,
                        localidad: formData.localidad,
                        codigo_postal: formData.codigo_postal,
                        provincia: formData.provincia,
                        pais: formData.pais,
                        telefono_1: formData.telefono_1,
                        telefono_2: formData.telefono_2,
                        email: formData.email,
                        contacto: formData.contacto
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

            const entityLabel = defaultCategory === 'cliente' ? 'Cliente' : 'Proveedor'
            toast.success(entity ? `${entityLabel} actualizado` : `${entityLabel} creado con éxito`)
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error('Error saving entity:', err)
            toast.error('Error al guardar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const titleLabel = defaultCategory === 'cliente' ? 'Cliente' : 'Proveedor'

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        {entity ? `Editar ${titleLabel}` : `Nuevo ${titleLabel}`}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    {/* SECCIÓN 1: DATOS BÁSICOS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="categoria" className="text-xs uppercase text-gray-500 font-bold">Categoría</Label>
                            <Select
                                value={formData.categoria}
                                onValueChange={(v: string) => setFormData({ ...formData, categoria: v as 'cliente' | 'proveedor' | 'ambos' })}
                            >
                                <SelectTrigger className="bg-gray-900 border-gray-800">
                                    <SelectValue placeholder="Seleccionar categoría" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900 border-gray-800 text-white">
                                    {defaultCategory === 'cliente' ? (
                                        <>
                                            <SelectItem value="cliente">Cliente</SelectItem>
                                            <SelectItem value="ambos">Cliente / Proveedor</SelectItem>
                                        </>
                                    ) : (
                                        <>
                                            <SelectItem value="proveedor">Proveedor</SelectItem>
                                            <SelectItem value="ambos">Proveedor / Cliente</SelectItem>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
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
                    </div>

                    {/* BOTÓN PARA MOSTRAR CAMPOS OPCIONALES */}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-emerald-500 hover:text-emerald-400 p-0 h-auto"
                        onClick={() => setShowOptional(!showOptional)}
                    >
                        {showOptional ? '- Menos información' : '+ Agregar información de contacto y dirección'}
                    </Button>

                    {showOptional && (
                        <div className="space-y-6 pt-2 border-t border-gray-800 animate-in fade-in slide-in-from-top-2">
                            {/* SECCIÓN: CONTACTO */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Contacto</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="contacto" className="text-xs text-gray-400">Persona de Contacto</Label>
                                        <Input
                                            id="contacto"
                                            placeholder="Nombre del contacto"
                                            value={formData.contacto}
                                            onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                                            className="bg-gray-900 border-gray-800"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-xs text-gray-400">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="ejemplo@correo.com"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            className="bg-gray-900 border-gray-800"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="telefono_1" className="text-xs text-gray-400">Teléfono Principal</Label>
                                        <Input
                                            id="telefono_1"
                                            placeholder="+54 11 ..."
                                            value={formData.telefono_1}
                                            onChange={(e) => setFormData({ ...formData, telefono_1: e.target.value })}
                                            className="bg-gray-900 border-gray-800"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="telefono_2" className="text-xs text-gray-400">Teléfono Secundario</Label>
                                        <Input
                                            id="telefono_2"
                                            placeholder="+54 11 ..."
                                            value={formData.telefono_2}
                                            onChange={(e) => setFormData({ ...formData, telefono_2: e.target.value })}
                                            className="bg-gray-900 border-gray-800"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN: UBICACIÓN */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Ubicación</h4>
                                <div className="space-y-2">
                                    <Label htmlFor="direccion" className="text-xs text-gray-400">Dirección</Label>
                                    <Input
                                        id="direccion"
                                        placeholder="Calle y número"
                                        value={formData.direccion}
                                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                                        className="bg-gray-900 border-gray-800"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="localidad" className="text-xs text-gray-400">Localidad</Label>
                                        <Input
                                            id="localidad"
                                            placeholder="Ciudad"
                                            value={formData.localidad}
                                            onChange={(e) => setFormData({ ...formData, localidad: e.target.value })}
                                            className="bg-gray-900 border-gray-800"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="codigo_postal" className="text-xs text-gray-400">CP</Label>
                                        <Input
                                            id="codigo_postal"
                                            placeholder="1425"
                                            value={formData.codigo_postal}
                                            onChange={(e) => setFormData({ ...formData, codigo_postal: e.target.value })}
                                            className="bg-gray-900 border-gray-800"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="provincia" className="text-xs text-gray-400">Provincia</Label>
                                        <Input
                                            id="provincia"
                                            placeholder="Buenos Aires"
                                            value={formData.provincia}
                                            onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
                                            className="bg-gray-900 border-gray-800"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="pais" className="text-xs text-gray-400">País</Label>
                                    <Input
                                        id="pais"
                                        placeholder="Argentina"
                                        value={formData.pais}
                                        onChange={(e) => setFormData({ ...formData, pais: e.target.value })}
                                        className="bg-gray-900 border-gray-800"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="pt-4 sticky bottom-0 bg-gray-950 pb-2">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {entity ? 'Guardar Cambios' : `Crear ${titleLabel}`}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
