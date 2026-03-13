'use client'

import { AlertCircle, ShieldCheck, TrendingDown, RefreshCcw, Info, CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'

interface AuditCardProps {
    finding: any
}

export function AuditCard({ finding: initialFinding }: AuditCardProps) {
    const [finding, setFinding] = useState(initialFinding)
    const [loading, setLoading] = useState(false)

    const typeLabels: any = {
        'duplicado': { label: 'Pago Duplicado', color: 'text-red-400', bg: 'bg-red-500/10', icon: RefreshCcw },
        'fuga_fiscal': { label: 'Fuga Fiscal', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: TrendingDown },
        'anomalia': { label: 'Anomalía Atípica', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Info }
    }

    const style = typeLabels[finding.tipo] || typeLabels.anomalia
    const Icon = style.icon

    async function updateStatus(newStatus: string) {
        setLoading(true)
        try {
            const res = await fetch(`/api/findings/${finding.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: newStatus })
            })

            if (res.ok) {
                setFinding({ ...finding, estado: newStatus })
            }
        } catch (error) {
            console.error('Error updating finding status:', error)
        } finally {
            setLoading(false)
        }
    }

    function formatCurrency(amount: number) {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
        }).format(amount)
    }

    if (finding.estado === 'ignorado' || finding.estado === 'resuelto') {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 flex items-center justify-between opacity-60">
                <div className="flex items-center gap-3">
                    {finding.estado === 'resuelto' ? <CheckCircle2 className="text-emerald-500" /> : <XCircle className="text-gray-500" />}
                    <div>
                        <p className="text-sm font-bold text-white uppercase tracking-tighter">Hallazgo {finding.estado === 'resuelto' ? 'Resuelto' : 'Ignorado'}</p>
                        <p className="text-xs text-gray-500">{finding.detalle.razon}</p>
                    </div>
                </div>
                <button
                    onClick={() => updateStatus('detectado')}
                    className="text-xs text-emerald-500 hover:underline font-bold"
                >
                    Deshacer
                </button>
            </div>
        )
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-all group">
            <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className={`p-4 rounded-xl ${style.bg} ${style.color}`}>
                    <Icon className="h-6 w-6" />
                </div>

                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${style.bg} ${style.color}`}>
                            {style.label}
                        </span>
                        <span className="text-gray-500 text-xs">
                            Detectado el {new Date(finding.created_at).toLocaleDateString('es-AR')}
                        </span>
                    </div>

                    <h3 className="text-lg font-bold text-white">
                        {finding.detalle.razon || 'Anomalía detectada'}
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800">
                            <p className="text-gray-500 text-xs mb-1">Monto Implicado</p>
                            <p className="font-mono text-white">
                                {formatCurrency(finding.transaccion.monto)}
                            </p>
                        </div>
                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800">
                            <p className="text-gray-500 text-xs mb-1">Destinatario / CUIT</p>
                            <p className="text-white truncate">
                                {finding.transaccion.cuit || 'No disponible'}
                            </p>
                        </div>
                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800">
                            <p className="text-gray-500 text-xs mb-1">Severidad</p>
                            <p className={`font-bold capitalize ${finding.severidad === 'critical' || finding.severidad === 'high' ? 'text-red-400' : 'text-amber-400'
                                }`}>
                                {finding.severidad}
                            </p>
                        </div>
                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800">
                            <p className="text-gray-500 text-xs mb-1">Estado</p>
                            <p className="text-emerald-400 font-medium capitalize">
                                {finding.estado}
                            </p>
                        </div>
                    </div>

                    {finding.detalle.duplicate_of && (
                        <div className="mt-4 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Transacción Original Detectada</p>
                            <div className="flex justify-between items-center text-sm">
                                <div className="space-y-1">
                                    <p className="text-white font-medium">{finding.detalle.duplicate_of.descripcion}</p>
                                    <p className="text-gray-500 text-xs">{new Date(finding.detalle.duplicate_of.fecha).toLocaleDateString('es-AR')}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-white font-mono">{formatCurrency(finding.detalle.duplicate_of.monto)}</p>
                                    <p className="text-[10px] text-gray-400">ID: {finding.detalle.duplicate_of.id?.substring(0, 8) || 'N/D'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 p-4 bg-gray-800/30 rounded-xl border border-gray-800/50 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-sm text-gray-300 italic flex-1">
                            &quot;Hallazgo: {finding.detalle.razon}. {finding.detalle.duplicate_of ? `Este movimiento es idéntico a uno detectado el ${new Date(finding.detalle.duplicate_of.fecha).toLocaleDateString('es-AR')}.` : ''} {finding.detalle.historical_avg ? `El gasto histórico promedio es ${formatCurrency(finding.detalle.historical_avg)}.` : ''}&quot;
                        </p>
                        {finding.transaccion.archivo_importacion_id && (
                            <button
                                onClick={() => {
                                    // Navigate to upload and open remap
                                    // For now, just trigger the event assuming the user is in Dashboard
                                    window.dispatchEvent(new CustomEvent('open-remap', {
                                        detail: {
                                            id: finding.transaccion.archivo_importacion_id,
                                            nombre_archivo: finding.transaccion.nombre_archivo || 'Archivo de Origen'
                                        }
                                    }))
                                    // Small UX hint: the user might need to go to Uploads tab
                                    alert('Se abrió el Asistente en la pestaña "Cargar Archivos"');
                                }}
                                className="text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2 font-bold transition-all"
                            >
                                <RefreshCcw className="w-3 h-3" />
                                CORREGIR MAPEO DE ORIGEN
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2 w-full md:w-auto">
                    <button
                        onClick={() => updateStatus('resuelto')}
                        disabled={loading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                    >
                        Resolver
                    </button>
                    <button
                        onClick={() => updateStatus('ignorado')}
                        disabled={loading}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors disabled:opacity-50"
                    >
                        Ignorar
                    </button>
                </div>
            </div>
        </div>
    )
}
