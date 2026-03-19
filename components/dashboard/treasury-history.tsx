'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
// Table components removed to use native HTML tables for better sticky performance
import {
    FileText,
    ChevronDown,
    ChevronUp,
    Trash2,
    Download,
    Clock,
    Search,
    RefreshCcw,
    Upload,
    DownloadCloud,
    Tag,
    Plus,
    Info,
    Printer
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { exportTreasuryMovementToExcel, downloadTreasuryTemplate } from '@/lib/excel-utils'
import { exportTreasuryMovementToPDF } from '@/lib/pdf-utils'
import { TreasuryManualEntry } from './treasury-manual-entry'

interface TreasuryHistoryProps {
    orgId: string
    accountId?: string
    typeFilter?: 'cobro' | 'pago'
    claseDocumentoFilter?: string[]
    title?: string
    hideHeader?: boolean
}

export function TreasuryHistory({ orgId, accountId, typeFilter, claseDocumentoFilter, title: customTitle, hideHeader }: TreasuryHistoryProps) {
    const [movements, setMovements] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedMov, setExpandedMov] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [isUploading, setIsUploading] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isDeletingBulk, setIsDeletingBulk] = useState(false)
    const [isManualEntryOpen, setIsManualEntryOpen] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(100)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    async function fetchMovements() {
        setLoading(true)
        let query = supabase
            .from('movimientos_tesoreria')
            .select(`
                *,
                entidades (razon_social),
                instrumentos_pago (*),
                transacciones (id),
                aplicaciones_pago (
                    monto_aplicado,
                    comprobante_id,
                    comprobantes (*)
                )
            `)
            .eq('organization_id', orgId)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })

        if (typeFilter) {
            query = query.eq('tipo', typeFilter)
        }

        if (accountId && accountId !== 'all') {
            query = query.eq('cuenta_id', accountId)
        }

        if (claseDocumentoFilter && claseDocumentoFilter.length > 0) {
            query = query.in('clase_documento', claseDocumentoFilter)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching movements:', error)
            toast.error('Error al cargar el historial')
        } else {
            setMovements(data || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchMovements()
    }, [orgId, typeFilter, accountId])

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('context', typeFilter === 'cobro' ? 'receipt' : 'payment')

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            })

            const result = await response.json()

            if (response.ok) {
                toast.success(`Importación exitosa: ${result.count} movimientos cargados.`)
                fetchMovements()
            } else {
                toast.error(`Error en importación: ${result.error || 'Desconocido'}`)
            }
        } catch (error) {
            console.error('Error uploading treasury movements:', error)
            toast.error('Error de red al intentar importar.')
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const filteredMovements = movements.filter(m =>
        m.entidades?.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.nro_comprobante || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.observaciones?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Paginación
    const totalPages = Math.ceil(filteredMovements.length / itemsPerPage)
    const paginatedMovements = filteredMovements.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredMovements.length && filteredMovements.length > 0) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filteredMovements.map(m => m.id)))
        }
    }

    const deleteMovementLogic = async (movId: string) => {
        const mov = movements.find(m => m.id === movId)
        if (!mov) return

        if (mov.aplicaciones_pago && mov.aplicaciones_pago.length > 0) {
            for (const app of mov.aplicaciones_pago) {
                const { data: inv } = await supabase.from('comprobantes')
                    .select('monto_pendiente, monto_total, tipo')
                    .eq('id', app.comprobante_id)
                    .single()

                if (inv) {
                    const restoredMonto = inv.tipo === 'nota_credito'
                        ? Number(app.monto_aplicado)
                        : Number(inv.monto_pendiente) + Number(app.monto_aplicado)

                    const newEstado = restoredMonto >= inv.monto_total ? 'pendiente' : (restoredMonto <= 0.05 ? 'pagado' : 'parcial')

                    await supabase.from('comprobantes')
                        .update({ monto_pendiente: restoredMonto, estado: newEstado })
                        .eq('id', app.comprobante_id)
                }
            }
        }

        await supabase.from('aplicaciones_pago').delete().eq('movimiento_id', movId)
        await supabase.from('instrumentos_pago').delete().eq('movimiento_id', movId)
        await supabase.from('movimientos_tesoreria').delete().eq('id', movId)
    }

    const handleDelete = async (movId: string) => {
        if (!confirm('¿Estás seguro? Se restaurarán los saldos de facturas.')) return
        setLoading(true)
        try {
            await deleteMovementLogic(movId)
            toast.success('Movimiento eliminado')
            fetchMovements()
        } catch (err: any) {
            toast.error('Error: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleBulkDelete = async () => {
        if (!confirm(`¿Borrar ${selectedIds.size} seleccionados?`)) return
        setIsDeletingBulk(true)
        setLoading(true)
        for (const id of Array.from(selectedIds)) {
            await deleteMovementLogic(id)
        }
        setSelectedIds(new Set())
        toast.success(`Eliminados correctamente`)
        fetchMovements()
        setIsDeletingBulk(false)
        setLoading(false)
    }

    const title = customTitle || (typeFilter === 'cobro' ? 'Recibos' : 'Órdenes de Pago')
    const subtitle = typeFilter === 'cobro' ? 'Gestión de cobranzas a clientes.' : 'Gestión de pagos a proveedores.'

    return (
        <Card className={`p-6 bg-gray-950 border-gray-800 text-white min-h-[500px] ${hideHeader ? 'border-none shadow-none bg-transparent p-0' : ''}`}>
            {!hideHeader && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-emerald-400" />
                            {title}
                        </h2>
                        <p className="text-sm text-gray-500">{subtitle}</p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <Button
                            variant={selectedIds.size > 0 ? "destructive" : "outline"}
                            size="sm"
                            className={`gap-2 h-9 ${selectedIds.size > 0 ? '' : 'opacity-40 border-gray-700'}`}
                            onClick={handleBulkDelete}
                            disabled={isDeletingBulk || selectedIds.size === 0}
                        >
                            <Trash2 className="w-4 h-4" />
                            {isDeletingBulk ? '...' : (selectedIds.size > 0 ? `Borrar ${selectedIds.size}` : 'Borrar')}
                        </Button>

                        <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />

                        <Button variant="outline" size="sm" className="bg-gray-900 text-gray-300 gap-2 h-9" onClick={() => downloadTreasuryTemplate(typeFilter === 'cobro' ? 'cobro' : 'pago')}>
                            <DownloadCloud className="w-4 h-4" />
                            <span className="hidden sm:inline">Plantilla</span>
                        </Button>

                        <Button variant="outline" size="sm" className="border-emerald-500/30 text-emerald-400 gap-2 h-9" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                            <Upload className="w-4 h-4" />
                            <span className="hidden sm:inline">Importar</span>
                        </Button>

                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 h-9 font-bold px-4 text-sm" onClick={() => setIsManualEntryOpen(true)}>
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">{typeFilter === 'cobro' ? 'Emitir Recibo' : 'Emitir Orden De Pago'}</span>
                        </Button>

                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                            <Input placeholder="Buscar..." className="bg-gray-900 border-gray-800 pl-9 text-xs h-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                </div>
            )}


            <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/50">
                <div className="max-h-[500px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-emerald-500/20 hover:scrollbar-thumb-emerald-500/40 scrollbar-track-transparent">
                    <table className="w-full text-left text-xs border-separate border-spacing-0">
                        <thead className="bg-gray-800 sticky top-0 z-10">
                            <tr className="border-gray-800 hover:bg-transparent">
                                <th className="px-6 py-4 w-[40px] sticky top-0 z-20 bg-gray-800"><input type="checkbox" checked={selectedIds.size === filteredMovements.length && filteredMovements.length > 0} onChange={toggleSelectAll} /></th>
                                <th className="px-6 py-4 text-gray-500 text-[11px] font-bold text-center w-[30px] sticky top-0 z-20 bg-gray-800">C</th>
                                <th className="px-6 py-4 text-gray-500 text-[11px] font-bold sticky top-0 z-20 bg-gray-800">Fecha</th>
                                <th className="px-6 py-4 text-gray-500 text-[11px] font-bold sticky top-0 z-20 bg-gray-800">Comprobante</th>
                                <th className="px-6 py-4 text-gray-500 text-[11px] font-bold sticky top-0 z-20 bg-gray-800">Entidad</th>
                                <th className="px-6 py-4 text-gray-500 text-[11px] font-bold cursor-help sticky top-0 z-20 bg-gray-800" title="Si es blanco indica que el movimiento está conciliado, si es verde que no lo está">
                                    <div className="flex items-center gap-1">
                                        Concepto
                                        <Info className="w-3.5 h-3.5 text-emerald-500/50" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-gray-500 text-[11px] font-bold text-right sticky top-0 z-20 bg-gray-800">Total</th>
                                <th className="px-6 py-4 text-gray-500 text-[11px] font-bold text-center sticky top-0 z-20 bg-gray-800">Acciones</th>
                                <th className="px-6 py-4 w-[30px] sticky top-0 z-20 bg-gray-800"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading ? (
                                <tr className="border-gray-800"><td colSpan={9} className="h-32 text-center text-gray-500">Cargando...</td></tr>
                            ) : paginatedMovements.map(mov => {
                                const isConciliated = mov.transacciones && mov.transacciones.length > 0;
                                const isExpanded = expandedMov === mov.id;

                                return (
                                    <Fragment key={mov.id}>
                                        <tr
                                            key={mov.id}
                                            className={`border-gray-800 transition-colors cursor-pointer ${isExpanded ? 'bg-emerald-500/5' : 'hover:bg-gray-800/30'}`}
                                            onClick={() => setExpandedMov(isExpanded ? null : mov.id)}
                                        >
                                            <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                <input type="checkbox" checked={selectedIds.has(mov.id)} onChange={() => toggleSelect(mov.id)} />
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className={`
                                                    w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black
                                                    ${isConciliated ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-800/50 text-gray-600 border border-gray-800'}
                                                `}>
                                                    C
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-xs">{new Date(mov.fecha).toLocaleDateString('es-AR')}</td>
                                            <td className="px-6 py-4"><Badge className="text-[9px] uppercase">{mov.nro_comprobante || mov.nro_factura || 'S/N'}</Badge></td>
                                            <td className="px-6 py-4 font-bold text-gray-200 text-xs">{mov.entidades?.razon_social}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1 min-h-[1.2rem] justify-center">
                                                    {mov.aplicaciones_pago && mov.aplicaciones_pago.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {mov.aplicaciones_pago.map((app: any, idx: number) => (
                                                                <span
                                                                    key={idx}
                                                                    className="text-[10px] font-bold text-white uppercase tracking-tight bg-gray-800 px-1.5 py-0.5 rounded"
                                                                >
                                                                    {app.comprobantes?.nro_factura || app.comprobantes?.numero}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-tight">
                                                                {mov.concepto || 'Sin concepto'}
                                                            </span>
                                                            {mov.observaciones && mov.observaciones !== mov.concepto && (
                                                                <span className="text-[10px] text-gray-500 italic truncate max-w-[200px]">
                                                                    {mov.observaciones}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-white text-xs">
                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(mov.monto_total)}
                                            </td>
                                            <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex justify-center gap-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-400" onClick={() => setExpandedMov(isExpanded ? null : mov.id)} title="Ver Detalles"><FileText className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => exportTreasuryMovementToPDF(mov)} title="Descargar PDF"><Printer className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-400" onClick={() => exportTreasuryMovementToExcel(mov)} title="Descargar EXCEL"><Download className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(mov.id)} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></Button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-500" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
                                            </td>
                                        </tr>

                                        {isExpanded && (
                                            <tr className="bg-gray-950/80 border-gray-800/50 hover:bg-transparent">
                                                <td colSpan={9} className="p-0">
                                                    <div className="p-6 border-l-2 border-emerald-500 bg-gray-900/40 animate-in slide-in-from-top-2 duration-200">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                            {/* Detalles de Instrumentos */}
                                                            <div>
                                                                <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                                    <Tag className="w-3 h-3" /> Medios de Cobro / Pago
                                                                </h4>
                                                                <div className="space-y-2">
                                                                    {mov.instrumentos_pago && mov.instrumentos_pago.length > 0 ? (
                                                                        mov.instrumentos_pago.map((inst: any, idx: number) => (
                                                                            <div key={idx} className="flex justify-between items-center p-2.5 bg-gray-950/50 rounded-lg border border-gray-800">
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-xs font-bold text-gray-200 uppercase">{inst.metodo}</span>
                                                                                    {inst.banco && <span className="text-[10px] text-gray-500 uppercase">{inst.banco} {(inst.detalle_referencia || inst.numero_cheque) ? `#${inst.detalle_referencia || inst.numero_cheque}` : ''}</span>}
                                                                                </div>
                                                                                <span className="font-mono text-sm font-bold text-white">
                                                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inst.monto)}
                                                                                </span>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <div className="text-xs text-gray-600 italic">No hay instrumentos detallados</div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Detalles de Aplicaciones (Facturas) */}
                                                            <div>
                                                                <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                                    <FileText className="w-3 h-3" /> Facturas Conciliadas
                                                                </h4>
                                                                <div className="space-y-2">
                                                                    {mov.aplicaciones_pago && mov.aplicaciones_pago.length > 0 ? (
                                                                        mov.aplicaciones_pago.map((app: any, idx: number) => (
                                                                            <div key={idx} className="flex justify-between items-center p-2.5 bg-gray-950/50 rounded-lg border border-gray-800">
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-xs font-medium text-gray-300 uppercase">{app.comprobantes?.nro_factura}</span>
                                                                                    <span className="text-[9px] text-gray-500 uppercase">{app.comprobantes?.tipo}</span>
                                                                                </div>
                                                                                <span className="font-mono text-xs font-bold text-emerald-400">
                                                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(app.monto_aplicado)}
                                                                                </span>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <div className="text-xs text-gray-600 italic">Movimiento sin aplicaciones directas (Gasto/Concepto libre)</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {mov.observaciones && (
                                                            <div className="mt-6 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                                                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Notas Administrativas</p>
                                                                <p className="text-xs text-gray-400">{mov.observaciones}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Paginación */}
            <div className="mt-4 p-4 border-t border-gray-800 bg-gray-900/40 flex flex-col md:flex-row justify-between items-center gap-4 rounded-xl">
                <div className="text-[11px] text-gray-500 font-medium flex items-center gap-4">
                    <span>
                        Mostrando <span className="text-gray-300">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-gray-300">{Math.min(currentPage * itemsPerPage, filteredMovements.length)}</span> de <span className="text-gray-300">{filteredMovements.length}</span> registros
                    </span>

                    <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
                        <span className="text-gray-600">Ver:</span>
                        {[20, 25, 50, 100, 200].map(size => (
                            <button
                                key={size}
                                onClick={() => {
                                    setItemsPerPage(size)
                                    setCurrentPage(1)
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${itemsPerPage === size ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-600 hover:text-gray-400'}`}
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center bg-gray-950 border border-gray-800 rounded-lg p-1 gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-gray-800 text-gray-400"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                        </Button>

                        <div className="flex items-center px-4 gap-2 border-x border-gray-800 px-6">
                            <span className="text-xs font-bold text-emerald-500">{currentPage}</span>
                            <span className="text-xs text-gray-600">/</span>
                            <span className="text-xs text-gray-400 font-medium">{totalPages}</span>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-gray-800 text-gray-400"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            <ChevronDown className="w-4 h-4 -rotate-90" />
                        </Button>
                    </div>
                )}
            </div>

            <TreasuryManualEntry
                isOpen={isManualEntryOpen}
                onClose={() => setIsManualEntryOpen(false)}
                orgId={orgId}
                tipo={typeFilter === 'cobro' ? 'cobro' : 'pago'}
                onSuccess={() => { fetchMovements(); setIsManualEntryOpen(false); }}
            />
        </Card >
    )
}
