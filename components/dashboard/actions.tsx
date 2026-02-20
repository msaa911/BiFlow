'use client'

import { useState } from 'react'
import { ArrowUpRight, Activity, Loader2, CheckCircle, FileDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export function DashboardActions() {
    const [analyzing, setAnalyzing] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [success, setSuccess] = useState(false)
    const router = useRouter()

    const runAnalysis = async () => {
        setAnalyzing(true)
        try {
            const res = await fetch('/api/analysis/run', { method: 'POST' })
            if (res.ok) {
                setSuccess(true)
                router.refresh()
                setTimeout(() => setSuccess(false), 3000)
            } else {
                const err = await res.json()
                alert(`Error: ${err.error || 'No se pudo completar el análisis'}`)
            }
        } catch (error) {
            console.error('Analysis failed', error)
            alert('Error de conexión al ejecutar el análisis')
        } finally {
            setAnalyzing(false)
        }
    }

    const downloadReport = async () => {
        setExporting(true)
        try {
            const res = await fetch('/api/export')
            if (res.ok) {
                const blob = await res.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `BiFlow_Reporte_Premium.xlsx`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
            }
        } catch (error) {
            console.error('Export failed', error)
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <Link href="/dashboard/upload" className="block">
                    <button className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 hover:border-emerald-500/50 transition-all text-left group h-full">
                        <div className="bg-emerald-500/10 p-2 rounded-lg w-fit mb-3 group-hover:bg-emerald-500/20">
                            <ArrowUpRight className="h-5 w-5 text-emerald-400" />
                        </div>
                        <span className="block text-sm font-medium text-white">Subir Archivos</span>
                        <span className="text-xs text-gray-500">Carga documentos</span>
                    </button>
                </Link>

                <button
                    onClick={runAnalysis}
                    disabled={analyzing}
                    className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 hover:border-blue-500/50 transition-all text-left group h-full relative"
                >
                    <div className={`bg-blue-500/10 p-2 rounded-lg w-fit mb-3 group-hover:bg-blue-500/20 ${analyzing ? 'animate-pulse' : ''}`}>
                        {analyzing ? <Loader2 className="h-5 w-5 text-blue-400 animate-spin" /> :
                            success ? <CheckCircle className="h-5 w-5 text-emerald-400" /> :
                                <Activity className="h-5 w-5 text-blue-400" />}
                    </div>
                    <span className="block text-sm font-medium text-white">Auditar</span>
                    <span className="text-xs text-gray-500">{analyzing ? 'Buscando...' : 'Analizar todo'}</span>
                </button>
            </div>

            <button
                onClick={downloadReport}
                disabled={exporting}
                className="w-full p-4 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 rounded-xl flex items-center justify-between transition-all group"
            >
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-emerald-500/20 rounded-lg group-hover:scale-110 transition-transform">
                        {exporting ? <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" /> : <FileDown className="w-5 h-5 text-emerald-400" />}
                    </div>
                    <div className="text-left">
                        <span className="block text-sm font-bold text-white tracking-tight">Reporte Auditoría Premium</span>
                        <span className="text-[10px] text-emerald-500/70 font-bold uppercase tracking-widest">Descargar Excel Enriquecido</span>
                    </div>
                </div>
                <ArrowUpRight className="w-5 h-5 text-emerald-400 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all" />
            </button>
        </div>
    )
}
