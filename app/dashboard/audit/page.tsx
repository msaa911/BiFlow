'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    AlertTriangle,
    Download,
    Filter,
    Search,
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Gavel,
    ShieldAlert,
    FileSpreadsheet,
    Calendar,
    ChevronRight,
    Loader2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import * as XLSX from 'xlsx'
import Link from 'next/link'

interface AuditFinding {
    id: string
    tipo: string
    severidad: string
    estado: string
    detalle: {
        razon: string
        score?: number
        monto_esperado?: number
        monto_real?: number
    }
    created_at: string
    transaccion: {
        id: string
        fecha: string
        descripcion: string
        monto: number
    }
}

export default function AuditCenterPage() {
    const [findings, setFindings] = useState<AuditFinding[]>([])
    const [filteredFindings, setFilteredFindings] = useState<AuditFinding[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')
    const supabase = createClient()

    useEffect(() => {
        loadFindings()
    }, [])

    useEffect(() => {
        let result = findings
        if (filter !== 'all') {
            result = result.filter(f => f.tipo === filter)
        }
        if (searchTerm) {
            result = result.filter(f =>
                f.transaccion.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.detalle.razon.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }
        setFilteredFindings(result)
    }, [filter, searchTerm, findings])

    async function loadFindings() {
        setLoading(true)
        const { data, error } = await supabase
            .from('hallazgos')
            .select(`
                *,
                transaccion:transaccion_id (
                    id,
                    fecha,
                    descripcion,
                    monto
                )
            `)
            .order('created_at', { ascending: false })

        if (data) {
            setFindings(data as any)
            setFilteredFindings(data as any)
        }
        setLoading(false)
    }

    const exportToExcel = () => {
        const dataToExport = filteredFindings.map(f => ({
            Fecha: new Date(f.transaccion.fecha).toLocaleDateString('es-AR'),
            Descripción: f.transaccion.descripcion,
            Monto: f.transaccion.monto,
            Tipo: f.tipo.toUpperCase(),
            Severidad: f.severidad.toUpperCase(),
            Estado: f.estado.toUpperCase(),
            Razón: f.detalle.razon,
            'Monto Esperado': f.detalle.monto_esperado || 'N/A',
            'Monto Real': f.detalle.monto_real || 'N/A'
        }))

        const ws = XLSX.utils.json_to_sheet(dataToExport)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Auditoria")
        XLSX.writeFile(wb, `Informe_Auditoria_BiFlow_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
                <p className="text-gray-400 font-mono text-sm animate-pulse tracking-widest">ANALIZANDO INTEGRIDAD DE DATOS...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Header section with glass effect */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20"></div>

                <div className="relative z-10">
                    <Link href="/dashboard" className="text-gray-500 hover:text-white flex items-center gap-2 text-sm mb-4 transition-colors group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Volver al Dashboard
                    </Link>
                    <h1 className="text-4xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                        Centro de Auditoría <Gavel className="w-8 h-8 text-emerald-500" />
                    </h1>
                    <p className="text-gray-400 mt-2 max-w-xl">
                        Explorá y gestioná las anomalías detectadas por el Algorithmic CFO. Descargá informes para reclamos bancarios.
                    </p>
                </div>

                <div className="flex items-center gap-3 relative z-10">
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-black font-black uppercase text-xs rounded-xl hover:bg-emerald-400 transition-all shadow-xl active:scale-95"
                    >
                        <FileSpreadsheet className="w-4 h-4" /> Exportar a Excel
                    </button>
                </div>
            </div>

            {/* Filters bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Buscar por descripción o razón..."
                        className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-2xl text-white text-sm focus:border-emerald-500/50 transition-all outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <select
                        className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-2xl text-white text-sm focus:border-emerald-500/50 transition-all outline-none appearance-none"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    >
                        <option value="all">TODOS LOS TIPOS</option>
                        <option value="duplicado">DUPLICADOS</option>
                        <option value="anomalia">ANOMALÍAS</option>
                        <option value="banco">AUDITORÍA BANCO</option>
                    </select>
                </div>
                <div className="flex bg-gray-900 border border-gray-800 rounded-2xl p-1">
                    <div className="flex-1 text-center py-2 px-3 balance-badge">
                        <p className="text-[10px] text-gray-500 font-bold uppercase">Casos Detectados</p>
                        <p className="text-lg font-black text-emerald-500">{filteredFindings.length}</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 gap-4">
                {filteredFindings.length > 0 ? (
                    filteredFindings.map((finding) => (
                        <Card key={finding.id} className="bg-gray-900 border-gray-800 hover:border-emerald-500/30 transition-all group overflow-hidden">
                            <CardContent className="p-0">
                                <div className="flex flex-col md:flex-row items-stretch">
                                    {/* Sidebar severity indicator */}
                                    <div className={`w-2 md:w-3 ${finding.severidad === 'critical' ? 'bg-red-500' :
                                            finding.severidad === 'high' ? 'bg-amber-500' : 'bg-emerald-500'
                                        } opacity-50 group-hover:opacity-100 transition-opacity`}></div>

                                    <div className="flex-1 p-6">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${finding.tipo === 'duplicado' ? 'bg-red-500/10 text-red-500' :
                                                            finding.tipo === 'anomalia' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
                                                        }`}>
                                                        {finding.tipo}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" /> {new Date(finding.transaccion.fecha).toLocaleDateString('es-AR')}
                                                    </span>
                                                </div>
                                                <h3 className="text-white font-bold text-lg group-hover:text-emerald-400 transition-colors">
                                                    {finding.transaccion.descripcion}
                                                </h3>
                                                <p className="text-sm text-gray-400 font-medium">
                                                    {finding.detalle.razon}
                                                </p>
                                            </div>

                                            <div className="text-left md:text-right bg-black/20 p-4 rounded-2xl border border-gray-800 min-w-[150px]">
                                                <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Monto Transacción</p>
                                                <p className={`text-xl font-black ${finding.transaccion.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    $ {new Intl.NumberFormat('es-AR').format(Math.abs(finding.transaccion.monto))}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-6 pt-4 border-t border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-6">
                                                {finding.detalle.monto_esperado && (
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Esperado</p>
                                                        <p className="text-xs font-mono text-gray-300">$ {new Intl.NumberFormat('es-AR').format(finding.detalle.monto_esperado)}</p>
                                                    </div>
                                                )}
                                                {finding.detalle.score && (
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Score Anomalía</p>
                                                        <p className="text-xs font-mono text-amber-500">{(finding.detalle.score * 100).toFixed(1)}%</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-lg transition-colors border border-gray-700">
                                                    Ignorar
                                                </button>
                                                <button className="px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 text-xs font-bold rounded-lg transition-colors border border-emerald-500/30 flex items-center gap-2 group/btn">
                                                    Generar Reclamo <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="text-center py-20 bg-gray-900 border-2 border-dashed border-gray-800 rounded-3xl">
                        <div className="w-20 h-20 bg-emerald-500/5 rounded-full flex items-center justify-center mx-auto mb-6">
                            <ShieldAlert className="w-10 h-10 text-emerald-500/40" />
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Tu caja está limpia</h2>
                        <p className="text-gray-400 max-w-sm mx-auto mt-2">
                            No encontramos anomalías críticas en el período seleccionado. El Algorithmic CFO sigue vigilando tus datos.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
