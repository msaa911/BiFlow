
'use client'

import { useEffect, useState } from 'react'
import { FileText, Clock, RotateCcw, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'

type ImportRecord = {
    id: string
    nombre_archivo: string
    fecha_carga: string
    estado: 'procesando' | 'completado' | 'error' | 'revertido' | 'requiere_ajuste'
    metadata: Record<string, any>
    quarantine_count: number
}

export function ImportHistory() {
    const router = useRouter()
    const [imports, setImports] = useState<ImportRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(20)

    const fetchImports = async () => {
        try {
            const res = await fetch('/api/imports')
            if (res.ok) {
                const data = await res.json()
                setImports(data)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchImports()
    }, [])

    const totalPages = Math.ceil(imports.length / itemsPerPage)
    const paginatedImports = imports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

    const handleDelete = async (id: string, count: number) => {
        const msg = count > 0
            ? '¿Borrar esta importación y sus transacciones? Esta acción no se puede deshacer.'
            : '¿Borrar este registro del historial?'

        if (!confirm(msg)) return

        setDeleting(id)
        try {
            const res = await fetch(`/api/imports?id=${id}`, { method: 'DELETE' })
            if (res.ok) {
                await fetchImports()
            } else {
                alert('Error al eliminar')
            }
        } catch (e) {
            alert('Error de conexión')
        } finally {
            setDeleting(null)
        }
    }

    if (loading) return <div className="text-sm text-gray-500 animate-pulse">Cargando historial...</div>
    if (imports.length === 0) return null

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-400" />
                Historial de Importaciones
            </h3>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-emerald-500/20 hover:scrollbar-thumb-emerald-500/40 scrollbar-track-transparent">
                    <table className="w-full text-left text-xs border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-gray-800 text-[11px] font-bold text-gray-400 sticky top-0 z-10">
                                <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800">Archivo</th>
                                <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800">Fecha</th>
                                <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800">Estado</th>
                                <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800">Detalle</th>
                                <th className="px-6 py-4 text-right sticky top-0 z-20 bg-gray-800">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {paginatedImports.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-800/50 transition-colors border-b border-gray-800/50">
                                    <td className="px-6 py-3 font-medium text-white flex items-center gap-2">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-gray-500" />
                                            <span className="truncate max-w-[150px]" title={item.nombre_archivo}>
                                                {item.nombre_archivo}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-gray-400">
                                        <div className="flex flex-col">
                                            <span className="text-white font-bold text-xs">{new Date(item.fecha_carga).toLocaleDateString()}</span>
                                            <span className="text-[10px] text-gray-500">{new Date(item.fecha_carga).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        {item.estado === 'completado' && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-black uppercase tracking-tighter">Completado</Badge>}
                                        {item.estado === 'requiere_ajuste' && <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-[10px] font-black uppercase tracking-tighter">Ajuste Pendiente</Badge>}
                                        {item.estado === 'error' && <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px] font-black uppercase tracking-tighter">Error</Badge>}
                                        {item.estado === 'procesando' && <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse text-[10px] font-black uppercase tracking-tighter">Procesando</Badge>}
                                        {item.estado === 'revertido' && <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20 line-through text-[10px] font-black uppercase tracking-tighter">Revertido</Badge>}
                                    </td>
                                    <td className="px-6 py-3 text-gray-400">
                                        {item.estado === 'requiere_ajuste' ? (
                                            <span className="text-orange-400 font-bold text-[10px] flex items-center gap-1 cursor-help uppercase tracking-tighter" title="Mapeo incompleto o dudoso">
                                                <AlertTriangle className="w-3 h-3" />
                                                Formato Dudoso
                                            </span>
                                        ) : item.metadata?.inserted > 0 ? (
                                            <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-tighter">+{item.metadata.inserted} registros</span>
                                        ) : item.quarantine_count > 0 ? (
                                            <span className="text-yellow-500 flex items-center gap-1 font-bold text-[10px] uppercase tracking-tighter">
                                                <AlertTriangle className="w-3 h-3" />
                                                {item.quarantine_count} en revisión
                                            </span>
                                        ) : (
                                            <span className="text-[10px] uppercase tracking-tighter">{item.metadata?.note || '-'}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {item.estado === 'requiere_ajuste' && (
                                                <button
                                                    onClick={() => router.push(`/dashboard/upload?remap=${item.id}&name=${encodeURIComponent(item.nombre_archivo)}`)}
                                                    className="text-[10px] px-3 py-1 rounded-md font-bold transition-all flex items-center gap-1 shadow-lg bg-orange-600 hover:bg-orange-500 text-white uppercase"
                                                    title="Corregir mapeo de columnas y re-procesar"
                                                >
                                                    <RefreshCw className="w-3 h-3" />
                                                    Corregir
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(item.id, item.metadata?.inserted || 0)}
                                                disabled={!!deleting}
                                                className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50 p-1.5 hover:bg-gray-800 rounded-lg"
                                                title="Eliminar del historial"
                                            >
                                                {deleting === item.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Paginación */}
                <div className="p-4 border-t border-gray-800 bg-gray-900/40 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-[11px] text-gray-500 font-medium flex items-center gap-4">
                        <span>
                            Mostrando <span className="text-gray-300">{imports.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> - <span className="text-gray-300">{Math.min(currentPage * itemsPerPage, imports.length)}</span> de <span className="text-gray-300">{imports.length}</span> registros
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
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 disabled:opacity-30"
                            >
                                <RefreshCw className="w-4 h-4 rotate-180" />
                            </button>

                            <div className="flex items-center px-4 gap-2 border-x border-gray-800 px-6">
                                <span className="text-xs font-bold text-emerald-500">{currentPage}</span>
                                <span className="text-xs text-gray-600">/</span>
                                <span className="text-xs text-gray-400 font-medium">{totalPages}</span>
                            </div>

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 disabled:opacity-30"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
