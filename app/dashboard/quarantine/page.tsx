
'use client'

import { useState, useEffect } from 'react'
import { Check, X, AlertTriangle, Calendar, DollarSign, FileText, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

type ReviewItem = {
    id: string
    datos_crudos: any
    motivo: string
    fecha?: string
    descripcion?: string
    monto?: number
    created_at: string
}

export default function QuarantinePage() {
    const [items, setItems] = useState<ReviewItem[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const router = useRouter()

    useEffect(() => {
        fetchItems()
    }, [])

    const fetchItems = async () => {
        try {
            const res = await fetch('/api/quarantine')
            if (res.ok) {
                const data = await res.json()
                setItems(data)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleAction = async (id: string, action: 'approve' | 'reject', data?: any) => {
        setProcessingId(id)
        try {
            const res = await fetch('/api/quarantine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action, data })
            })

            if (res.ok) {
                setItems(prev => prev.filter(i => i.id !== id))
            } else {
                alert('Error al procesar acción')
            }
        } catch (e) {
            alert('Error de conexión')
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) return <div className="text-gray-400 p-8">Cargando revisiones...</div>

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-yellow-500" />
                        Revisión de Datos Pendientes
                    </h1>
                    <p className="text-gray-400 text-sm">
                        {items.length} movimientos requieren tu revisión manual.
                    </p>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
                    <Check className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Todo Limpio</h3>
                    <p className="text-gray-500">No hay transacciones pendientes de revisión.</p>
                    <button
                        onClick={() => router.push('/dashboard/upload')}
                        className="mt-6 text-emerald-400 hover:text-emerald-300 text-sm font-medium"
                    >
                        Subir nuevos archivos
                    </button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {items.map(item => (
                        <ReviewCard key={item.id} item={item} onAction={handleAction} processing={processingId === item.id} />
                    ))}
                </div>
            )}
        </div>
    )
}

function ReviewCard({ item, onAction, processing }: { item: ReviewItem, onAction: any, processing: boolean }) {
    // Local state for editing
    // Local state for editing
    // Prefer explicit suggestions from backend if available
    const [fecha, setFecha] = useState(item.fecha || extractPossibleDate(item.datos_crudos) || '')
    const [descripcion, setDescripcion] = useState(item.descripcion || extractPossibleDesc(item.datos_crudos) || '')
    const [monto, setMonto] = useState<string>(item.monto ? item.monto.toString() : '')

    const handleApprove = () => {
        if (!fecha || !monto || !descripcion) {
            alert('Completa todos los campos para aprobar')
            return
        }
        onAction(item.id, 'approve', { fecha, descripcion, monto })
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
            <div className="flex flex-col md:flex-row gap-6">
                {/* Visual Context: Raw Data */}
                <div className="flex-1 md:max-w-xs space-y-3">
                    <div className="flex items-start gap-2 text-yellow-500 text-xs font-medium uppercase tracking-wider">
                        <AlertTriangle className="w-3 h-3 mt-0.5" />
                        {item.motivo}
                    </div>
                    <div className="bg-black/30 rounded p-3 text-xs font-mono text-gray-400 break-all border border-gray-800">
                        {JSON.stringify(item.datos_crudos, null, 2)}
                    </div>
                    <div className="text-xs text-gray-500">
                        Detectado: {new Date(item.created_at).toLocaleDateString()}
                    </div>
                </div>

                {/* Edit Form */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                            <input
                                type="date"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:border-emerald-500 outline-none"
                                value={fecha}
                                onChange={e => setFecha(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:border-emerald-500 outline-none"
                                value={descripcion}
                                onChange={e => setDescripcion(e.target.value)}
                                placeholder="Ej: Compra Insumos"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Monto (ARS)</label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                            <input
                                type="number"
                                step="any"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:border-emerald-500 outline-none"
                                value={monto}
                                onChange={e => setMonto(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2 flex items-end justify-end gap-2 h-full">
                        <button
                            onClick={() => onAction(item.id, 'reject')}
                            disabled={processing}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                        >
                            <X className="w-4 h-4" /> Descartar
                        </button>
                        <button
                            onClick={handleApprove}
                            disabled={processing}
                            className="px-6 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" /> Aprobar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Helpers to guess data
function extractPossibleDate(raw: any) {
    if (!raw) return ''
    const str = JSON.stringify(raw)
    // Try to find YYYY-MM-DD
    const match = str.match(/(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
    return ''
}

function extractPossibleDesc(raw: any) {
    if (raw?.line) return raw.line.substring(0, 50)
    if (raw?.descripcion) return raw.descripcion
    return ''
}
