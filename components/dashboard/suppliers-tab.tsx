'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, ShieldCheck, Landmark, Search, Plus, Edit2, Trash2, FileDown, Upload, FileSpreadsheet, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EntityModal } from './entity-modal'
import { toast } from 'sonner'
import { downloadEntityTemplate, exportEntitiesToExcel, parseEntityExcel } from '@/lib/excel-utils'

interface SuppliersTabProps {
    orgId: string
    category?: 'cliente' | 'proveedor' | 'ambos'
}

export function SuppliersTab({ orgId, category = 'proveedor' }: SuppliersTabProps) {
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [isEntityModalOpen, setIsEntityModalOpen] = useState(false)
    const [selectedEntity, setSelectedEntity] = useState<any>(null)
    const supabase = createClient()

    const fetchSocios = async () => {
        setLoading(true)
        // Fetch entities (entidades) and their trusted CBUs
        let query = supabase
            .from('entidades')
            .select('*')
            .eq('organization_id', orgId)

        if (category !== 'ambos') {
            query = query.eq('categoria', category)
        }

        const { data: entitiesData } = await query.order('razon_social', { ascending: true })

        const { data: trustData } = await supabase
            .from('trust_ledger')
            .select('cuit, cbu, is_trusted')
            .eq('organization_id', orgId)

        if (entitiesData) {
            const combined = entitiesData.map(ent => ({
                ...ent,
                trusted_cbus: trustData?.filter(t => t.cuit === ent.cuit) || []
            }))
            setSuppliers(combined)
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchSocios()
    }, [orgId, category])

    const filteredSuppliers = suppliers.filter(s =>
        s.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.cuit.includes(searchTerm)
    )

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`¿Estás seguro de que deseas eliminar a "${name}"? Esta acción no se puede deshacer.`)) {
            return
        }

        try {
            const { error } = await supabase
                .from('entidades')
                .delete()
                .eq('id', id)

            if (error) throw error

            toast.success('Socio eliminado con éxito')
            fetchSocios()
        } catch (err: any) {
            console.error('Error deleting entity:', err)
            toast.error('Error al eliminar: ' + err.message)
        }
    }

    const handleDownloadTemplate = () => {
        downloadEntityTemplate(category)
        toast.success('Plantilla descargada')
    }

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const loadingToast = toast.loading('Procesando archivo...')
        try {
            const entities = await parseEntityExcel(file)
            if (entities.length === 0) {
                toast.error('No se encontraron datos válidos en el archivo')
                return
            }

            // Batch upsert to Supabase
            const { error } = await supabase
                .from('entidades')
                .upsert(
                    entities.map(ent => ({
                        organization_id: orgId,
                        cuit: ent.cuit,
                        razon_social: ent.razon_social,
                        categoria: category === 'ambos' ? 'proveedor' : category, // Default to current tab
                        metadata: {
                            cbu_habitual: ent.cbu_habitual,
                            direccion: ent.direccion,
                            localidad: ent.localidad,
                            departamento: ent.departamento,
                            provincia: ent.provincia,
                            codigo_postal: ent.codigo_postal,
                            email: ent.email,
                            telefono_1: ent.telefono_1,
                            contacto: ent.contacto
                        },
                        updated_at: new Date().toISOString()
                    })),
                    { onConflict: 'organization_id, cuit' }
                )

            if (error) throw error

            toast.success(`${entities.length} registros procesados correctamente`)
            fetchSocios()
        } catch (err: any) {
            console.error('Error importing entities:', err)
            toast.error('Error en la importación: ' + err.message)
        } finally {
            toast.dismiss(loadingToast)
            if (e.target) e.target.value = '' // Clear input
        }
    }

    const handleExportExcel = () => {
        if (suppliers.length === 0) {
            toast.error('No hay datos para exportar')
            return
        }
        exportEntitiesToExcel(suppliers, category)
        toast.success('Datos exportados')
    }

    return (
        <div className="space-y-6">
            {/* INPUT OCULTO PARA IMPORTACIÓN */}
            <input
                type="file"
                id="excel-import"
                className="hidden"
                accept=".xlsx, .xls"
                onChange={handleImportExcel}
            />

            {/* CABECERA: CONTADOR Y BOTÓN NUEVO */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Users className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white leading-none">
                            {category === 'cliente' ? 'Clientes' : 'Proveedores'} Registrados
                        </h2>
                        <span className="text-xs text-gray-500 font-medium">{suppliers.length} registros en total</span>
                    </div>
                </div>

                <Button
                    onClick={() => {
                        setSelectedEntity(null)
                        setIsEntityModalOpen(true)
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-9"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo {category === 'cliente' ? 'Cliente' : 'Proveedor'}
                </Button>
            </div>

            {/* ACCIONES DE DATOS: Títulos y Botones 1, 2, 3 */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleDownloadTemplate}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700 h-9"
                    >
                        <FileDown className="w-4 h-4 mr-2 text-emerald-500" />
                        B1: Descargar Plantilla
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => document.getElementById('excel-import')?.click()}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700 h-9"
                    >
                        <Upload className="w-4 h-4 mr-2 text-blue-500" />
                        B2: Importar {category === 'cliente' ? 'Clientes' : 'Proveedores'}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportExcel}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700 h-9"
                    >
                        <FileSpreadsheet className="w-4 h-4 mr-2 text-amber-500" />
                        B3: Exportar a Excel
                    </Button>
                </div>

                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder={`Buscar ${category === 'cliente' ? 'cliente' : 'proveedor'}...`}
                        className="pl-10 bg-gray-900 border-gray-800 text-white h-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-1">
                {loading ? (
                    <div className="p-12 text-center text-gray-500">Cargando directorio...</div>
                ) : filteredSuppliers.length === 0 ? (
                    <Card className="p-12 text-center bg-gray-900 border-gray-800">
                        <Users className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">No se encontraron {category === 'cliente' ? 'clientes' : 'proveedores'}</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            Agrega un nuevo socio manualmente para comenzar a gestionar sus comprobantes.
                        </p>
                    </Card>
                ) : (
                    filteredSuppliers.map(supplier => (
                        <Card key={supplier.id} className="p-6 bg-gray-900 border-gray-800 hover:border-emerald-500/30 transition-colors">
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="space-y-1 flex-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-bold text-white">{supplier.razon_social}</h3>
                                        <Badge className={`${category === 'cliente' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                                            {supplier.categoria?.toUpperCase()}
                                        </Badge>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-500 hover:text-white"
                                                onClick={() => {
                                                    setSelectedEntity(supplier)
                                                    setIsEntityModalOpen(true)
                                                }}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-500 hover:text-red-400"
                                                onClick={() => handleDelete(supplier.id, supplier.razon_social)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-400 font-mono">CUIT: {supplier.cuit}</p>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">CBUs / CVUs de Confianza</p>
                                    <div className="space-y-2">
                                        {supplier.trusted_cbus.length > 0 ? (
                                            supplier.trusted_cbus.map((t: any) => (
                                                <div key={t.cbu} className="flex items-center justify-between gap-4 p-2 bg-gray-800/50 rounded-lg border border-gray-800">
                                                    <div className="flex items-center gap-2">
                                                        <Landmark className="h-4 w-4 text-gray-500" />
                                                        <code className="text-xs text-white font-mono">{t.cbu}</code>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase">
                                                        <ShieldCheck className="h-3.5 w-3.5" />
                                                        Validado
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-amber-500/70 italic">Sin CBU detectado aún</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
            <EntityModal
                isOpen={isEntityModalOpen}
                onClose={() => setIsEntityModalOpen(false)}
                orgId={orgId}
                entity={selectedEntity}
                onSuccess={fetchSocios}
                defaultCategory={category === 'ambos' ? 'proveedor' : category as 'cliente' | 'proveedor'}
            />
        </div>
    )
}
