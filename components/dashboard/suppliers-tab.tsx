'use client'

import { useRef, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, ShieldCheck, Landmark, Search, Plus, Edit2, Trash2, FileDown, Upload, FileSpreadsheet, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EntityModal } from './entity-modal'
import { toast } from 'sonner'
import { downloadEntityTemplate, exportEntitiesToExcel, parseEntityExcel } from '@/lib/excel-utils'
import { ImportPreviewModal } from './import-preview-modal'

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
    const [importData, setImportData] = useState<any[]>([])
    const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false)
    const [currentFileName, setCurrentFileName] = useState<string>('')
    const fileInputRef = useRef<HTMLInputElement>(null)
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

    const handleDelete = async (id: string, name: string, currentCategory: string) => {
        const actionLabel = category === 'cliente' ? 'cliente' : 'proveedor'
        const otherCategory = category === 'cliente' ? 'proveedor' : 'cliente'

        if (!confirm(`¿Estás seguro de que deseas eliminar a "${name}" como ${actionLabel}? Esta acción no se puede deshacer.`)) {
            return
        }

        try {
            if (currentCategory === 'ambos') {
                // Downgrade category instead of deleting
                console.log(`[Delete] Downgrading entity ${id} from 'ambos' to '${otherCategory}'`)
                const { error } = await supabase
                    .from('entidades')
                    .update({ categoria: otherCategory })
                    .eq('id', id)

                if (error) throw error
                toast.success(`Ahora "${name}" ya no es ${actionLabel}, pero sigue guardado como ${otherCategory}`)
            } else {
                // Physical delete
                console.log(`[Delete] Physical delete for entity ${id}`)
                const { error } = await supabase
                    .from('entidades')
                    .delete()
                    .eq('id', id)

                if (error) throw error
                toast.success(`${name} eliminado con éxito`)
            }

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

        console.log('[Import] Starting parse for file:', file.name)
        setCurrentFileName(file.name)
        const loadingToast = toast.loading('Procesando archivo Excel...')

        try {
            const { data: parsedData, errors: parserErrors } = await parseEntityExcel(file)
            console.log('[Import] Parsed records:', parsedData.length)

            // NEW: Handle specific parser errors (e.g., empty file, missing headers)
            if (parserErrors && parserErrors.length > 0) {
                toast.error(parserErrors[0])
                return
            }

            if (parsedData.length === 0) {
                toast.error('No se encontraron datos en el archivo. Verificá que la hoja no esté vacía.')
                return
            }

            // Dictionary of common geographical aliases to avoid false positives
            const GEO_ALIASES: Record<string, { localidad?: string, provincia?: string, departamento?: string }> = {
                'caba': { localidad: 'ciudad autónoma de buenos aires', provincia: 'ciudad autónoma de buenos aires', departamento: 'comuna 1' },
                'mza': { provincia: 'mendoza' },
                'mendoza': { provincia: 'mendoza' },
                'cba': { provincia: 'córdoba' },
                'cordoba': { provincia: 'córdoba' },
                'sta fe': { provincia: 'santa fe' },
                'santa fe': { provincia: 'santa fe' },
                'bsas': { provincia: 'buenos aires' },
                'buenos aires': { provincia: 'buenos aires' },
                'tuc': { provincia: 'tucumán' },
                'sl': { provincia: 'san luis' },
                'sj': { provincia: 'san juan' },
                'er': { provincia: 'entre ríos' },
                'rn': { provincia: 'río negro' },
                'chubut': { provincia: 'chubut' },
                'lpa': { provincia: 'la pampa' },
                'mis': { provincia: 'misiones' },
                'corr': { provincia: 'corrientes' },
                'sgo': { provincia: 'santiago del estero' },
                'tdf': { provincia: 'tierra del fuego' }
            }

            const resolveAlias = (val: string, type: 'provincia' | 'localidad' | 'departamento') => {
                const clean = val.trim().toLowerCase()
                const match = GEO_ALIASES[clean]
                if (match) return match[type] || clean
                return clean
            }

            // NEW: Proactive Batch Check for Locations
            console.log('[Import] Step 2: Proactive Location Validation...')
            const uniqueLocs = Array.from(new Set(
                parsedData
                    .filter((ent: any) => ent.localidad && ent.provincia)
                    .map((ent: any) => {
                        const p = resolveAlias(ent.provincia, 'provincia')
                        const l = resolveAlias(ent.localidad, 'localidad')
                        return `${l}|${p}`
                    })
            ))

            const validLocMap = new Map<string, any>()
            if (uniqueLocs.length > 0) {
                const { data: geoData } = await supabase
                    .from('geo_argentina')
                    .select('localidad, provincia, departamento')

                geoData?.forEach((g: any) => {
                    validLocMap.set(`${g.localidad.trim().toLowerCase()}|${g.provincia.trim().toLowerCase()}`, g)
                })
            }
            const dataWithContext = parsedData.map((ent: any) => {
                const errors: string[] = []

                // 1. Critical Information Validation
                if (!ent.razon_social?.trim()) {
                    errors.push('Falta Razón Social')
                }

                const cleanCuit = (ent.cuit || '').toString().replace(/[^\d]/g, '')
                if (!cleanCuit) {
                    errors.push('Falta CUIT')
                } else if (cleanCuit.length !== 11) {
                    errors.push('CUIT incompleto (necesita 11 dígitos)')
                }

                // 2. Location SILENT Normalization & Strict Error Mapping
                let normalizedProv = resolveAlias(ent.provincia || '', 'provincia')
                let normalizedLoc = resolveAlias(ent.localidad || '', 'localidad')
                const locKey = `${normalizedLoc}|${normalizedProv}`
                const geoMatch = validLocMap.get(locKey)

                // If we found a match, update the entity data with official names
                if (geoMatch) {
                    ent.provincia = geoMatch.provincia
                    ent.localidad = geoMatch.localidad
                    ent.departamento = geoMatch.departamento
                } else if (!ent.localidad || !ent.provincia) {
                    // MISSING location is now an Error, not a warning
                    errors.push('Falta información de ubicación')
                } else {
                    // If it's not a match but it has some data, we DON'T add a warning/error anymore.
                    // We trust it enough to be imported if the user doesn't care about geo-tagging,
                    // or we simply avoid the noise.
                    console.log(`[Import] Location not in DB but not blocking: ${locKey}`)
                }

                return {
                    ...ent,
                    errors,
                    warnings: [], // Explicitly empty to avoid UI noise
                    isValid: errors.length === 0
                }
            })

            setImportData(dataWithContext)
            setIsImportPreviewOpen(true)
            console.log('[Import] Preview modal opened with validation.')
        } catch (err: any) {
            console.error('[Import] FATAL ERROR:', err)
            toast.error('Error crítico en el procesador: ' + (err.message || 'Desconocido'))
        } finally {
            toast.dismiss(loadingToast)
            if (e.target) e.target.value = '' // Reset input
        }
    }

    const onRowUpdate = (updatedRow: any) => {
        setImportData(prev => prev.map(row =>
            row.id === updatedRow.id ? updatedRow : row
        ))
    }

    const onConfirmImport = async (validData: any[]) => {
        console.log('[ConfirmImport] Starting optimized persist for', validData.length, 'records')
        const loadingToast = toast.loading(`Normalizando y guardando ${validData.length} registros...`)

        try {
            if (!orgId) throw new Error('No se detectó el ID de la organización')

            // 1. BATCH NORMALIZATION
            console.log('[ConfirmImport] Step 1: Batch Normalizing Locations...')
            const uniqueLocations = Array.from(new Set(
                validData
                    .filter(ent => !ent.geo_lat && ent.localidad && ent.provincia)
                    .map(ent => `${ent.localidad.trim().toLowerCase()}|${ent.provincia.trim().toLowerCase()}`)
            ))

            const geoCachedMap = new Map<string, any>()

            if (uniqueLocations.length > 0) {
                console.log(`[ConfirmImport] Fetching ${uniqueLocations.length} unique locations from DB...`)

                // We fetch all potential matches in one go using OR filters or filtering by the list of provinces
                // For simplicity and speed, we fetch only columns we need
                const { data: geoData } = await supabase
                    .from('geo_argentina')
                    .select('localidad, departamento, provincia, latitud, longitud')

                // Build a quick lookup map
                geoData?.forEach(g => {
                    const key = `${g.localidad.trim().toLowerCase()}|${g.provincia.trim().toLowerCase()}`
                    if (!geoCachedMap.has(key)) {
                        geoCachedMap.set(key, g)
                    }
                })
            }

            // 1.5 FETCH EXISTING CATEGORIES TO PREVENT OVERWRITES
            console.log('[ConfirmImport] Step 1.5: Checking for existing categories...')
            const allCuits = validData.map((ent: any) => ent.cuit)
            const { data: existingEnts } = await supabase
                .from('entidades')
                .select('cuit, categoria')
                .eq('organization_id', orgId)
                .in('cuit', allCuits)

            const existingCategoryMap = new Map<string, string>()
            existingEnts?.forEach((e: any) => {
                existingCategoryMap.set(e.cuit, e.categoria)
            })

            // 2. MAPPING & CHUNKING
            console.log('[ConfirmImport] Step 2: Preparing data chunks...')
            const normalizedData = validData.map(ent => {
                const key = `${(ent.localidad || '').trim().toLowerCase()}|${(ent.provincia || '').trim().toLowerCase()}`
                const geoMatch = geoCachedMap.get(key)

                // Intelligent Category Merging
                const currentCategory = category === 'ambos' ? 'proveedor' : category
                const existingCategory = existingCategoryMap.get(ent.cuit)

                let finalCategory: 'cliente' | 'proveedor' | 'ambos' = currentCategory
                if (existingCategory && existingCategory !== 'ambos' && existingCategory !== currentCategory) {
                    finalCategory = 'ambos'
                } else if (existingCategory === 'ambos') {
                    finalCategory = 'ambos'
                }

                return {
                    organization_id: orgId,
                    cuit: ent.cuit,
                    razon_social: ent.razon_social,
                    categoria: finalCategory as any,
                    metadata: {
                        cbu_habitual: ent.cbu_habitual,
                        direccion: ent.direccion,
                        localidad: geoMatch?.localidad || ent.localidad,
                        departamento: geoMatch?.departamento || ent.departamento,
                        provincia: geoMatch?.provincia || ent.provincia,
                        codigo_postal: ent.codigo_postal,
                        email: ent.email,
                        telefono_1: ent.telefono_1,
                        contacto: ent.contacto,
                        geo_lat: geoMatch?.latitud || ent.geo_lat,
                        geo_lon: geoMatch?.longitud || ent.geo_lon
                    },
                    updated_at: new Date().toISOString()
                }
            })

            // 3. CHUNKED UPSERT (Batches of 50)
            const CHUNK_SIZE = 50
            for (let i = 0; i < normalizedData.length; i += CHUNK_SIZE) {
                const chunk = normalizedData.slice(i, i + CHUNK_SIZE)
                console.log(`[ConfirmImport] Upserting chunk ${i / CHUNK_SIZE + 1}...`)

                const { error: upsertError } = await supabase
                    .from('entidades')
                    .upsert(chunk, { onConflict: 'organization_id, cuit' })

                if (upsertError) {
                    console.error('[ConfirmImport] Error in chunk upsert:', upsertError)
                    throw new Error(`Error en lote ${i / CHUNK_SIZE + 1}: ${upsertError.message}`)
                }
            }

            // Log explicitly to import history via API to bypass RLS
            try {
                await fetch('/api/imports/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        organization_id: orgId,
                        nombre_archivo: currentFileName || `importacion_${category}.xlsx`,
                        metadata: {
                            context: category,
                            processed: validData.length,
                            inserted: validData.length
                        }
                    })
                })
            } catch (historyErr) {
                console.error('[ConfirmImport] Failed to log import history:', historyErr)
            }

            console.log('[ConfirmImport] SUCCESS. Process finished.')
            toast.success(`${validData.length} registros importados correctamente`)
            fetchSocios()
        } catch (err: any) {
            console.error('[ConfirmImport] FATAL ERROR:', err)
            toast.error('Error al guardar datos: ' + (err.message || 'Error desconocido'))
            throw err
        } finally {
            toast.dismiss(loadingToast)
        }
    }


    const handleExportExcel = () => {
        exportEntitiesToExcel(suppliers, category)
        toast.success('Datos exportados')
    }

    return (
        <div className="space-y-6">
            {/* INPUT OCULTO PARA IMPORTACIÓN */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx, .xls, .csv"
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
            <div className="flex flex-col md:flex-row items-center gap-3 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
                <div className="flex flex-wrap items-center gap-3">
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
                        onClick={() => fileInputRef.current?.click()}
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
                        B3: Exportar {category === 'cliente' ? 'Clientes' : 'Proveedores'}
                    </Button>
                </div>

                <div className="relative flex-1 w-full md:min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder={`Buscar ${category === 'cliente' ? 'cliente' : 'proveedor'}...`}
                        className="pl-10 bg-gray-900 border-gray-800 text-white h-9 w-full"
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
                                                onClick={() => handleDelete(supplier.id, supplier.razon_social, supplier.categoria)}
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
            <ImportPreviewModal
                isOpen={isImportPreviewOpen}
                onClose={() => setIsImportPreviewOpen(false)}
                data={importData}
                category={category}
                onConfirm={onConfirmImport}
                onRowUpdate={onRowUpdate}
            />
        </div>
    )
}
