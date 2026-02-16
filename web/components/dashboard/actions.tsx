'use client'

import { useState } from 'react'
import { ArrowUpRight, Activity, Loader2, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export function DashboardActions() {
    const [analyzing, setAnalyzing] = useState(false)
    const [success, setSuccess] = useState(false)
    const router = useRouter()

    const runAnalysis = async () => {
        setAnalyzing(true)
        try {
            const res = await fetch('/api/analyze', { method: 'POST' })
            if (res.ok) {
                const data = await res.json()
                setSuccess(true)
                router.refresh() // Refresh server component data
                setTimeout(() => setSuccess(false), 3000)
            }
        } catch (error) {
            console.error('Analysis failed', error)
        } finally {
            setAnalyzing(false)
        }
    }

    return (
        <div className="grid grid-cols-2 gap-4">
            <Link href="/dashboard/upload" className="block">
                <button className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 hover:border-emerald-500/50 transition-all text-left group h-full">
                    <div className="bg-emerald-500/10 p-2 rounded-lg w-fit mb-3 group-hover:bg-emerald-500/20">
                        <ArrowUpRight className="h-5 w-5 text-emerald-400" />
                    </div>
                    <span className="block text-sm font-medium text-white">Subir Extracto</span>
                    <span className="text-xs text-gray-500">Importar CSV/Excel</span>
                </button>
            </Link>

            <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 hover:border-blue-500/50 transition-all text-left group h-full relative overflow-hidden"
            >
                <div className={`bg-blue-500/10 p-2 rounded-lg w-fit mb-3 group-hover:bg-blue-500/20 ${analyzing ? 'animate-pulse' : ''}`}>
                    {analyzing ? <Loader2 className="h-5 w-5 text-blue-400 animate-spin" /> :
                        success ? <CheckCircle className="h-5 w-5 text-emerald-400" /> :
                            <Activity className="h-5 w-5 text-blue-400" />}
                </div>
                <span className="block text-sm font-medium text-white">
                    {analyzing ? 'Analizando...' : success ? '¡Análisis Completado!' : 'Ejecutar Análisis'}
                </span>
                <span className="text-xs text-gray-500">
                    {analyzing ? 'Buscando patrones...' : success ? 'Datos actualizados' : 'Buscar anomalías'}
                </span>
            </button>
        </div>
    )
}
