
'use client'

import { useEffect, useState } from 'react'
import { FileText, Clock, RotateCcw, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type ImportRecord = {
    id: string
    nombre_archivo: string
    fecha_carga: string
    estado: 'procesando' | 'completado' | 'error' | 'revertido'
    metadata: Record<string, any>
    quarantine_count: number
}

export function ImportHistory() {
    const [imports, setImports] = useState<ImportRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState<string | null>(null)

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

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-400 bg-gray-900/50 uppercase border-b border-gray-800">
                            <tr>
                                <th className="px-4 py-3">Archivo</th>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3">Detalle</th>
                                <th className="px-4 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {imports.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-500" />
                                        <span className="truncate max-w-[150px]" title={item.nombre_archivo}>
                                            {item.nombre_archivo}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-400">
                                        {new Date(item.fecha_carga).toLocaleDateString()} <span className="text-xs opacity-50">{new Date(item.fecha_carga).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.estado === 'completado' && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Completado</Badge>}
                                        {item.estado === 'error' && <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20">Error</Badge>}
                                        {item.estado === 'procesando' && <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse">Procesando</Badge>}
                                        {item.estado === 'revertido' && <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20 line-through">Revertido</Badge>}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-xs">
                                        {item.metadata?.inserted > 0 ? (
                                            <span className="text-emerald-400 font-medium">+{item.metadata.inserted} registros</span>
                                        ) : item.quarantine_count > 0 ? (
                                            <span className="text-yellow-500 flex items-center gap-1 font-medium">
                                                <AlertTriangle className="w-3 h-3" />
                                                {item.quarantine_count} en revisión
                                            </span>
                                        ) : (
                                            <span>{item.metadata?.note || '-'}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => handleDelete(item.id, item.metadata?.inserted || 0)}
                                            disabled={!!deleting}
                                            className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50 p-1 hover:bg-gray-800 rounded"
                                            title="Eliminar del historial"
                                        >
                                            {deleting === item.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
