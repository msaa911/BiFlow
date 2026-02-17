
'use client'

import { Activity, ShieldCheck, TrendingUp, AlertCircle } from 'lucide-react'

interface CashHealthScoreProps {
    score: number
    anomalyCount: number
    recoveryPotential: number
}

export function CashHealthScore({ score, anomalyCount, recoveryPotential }: CashHealthScoreProps) {
    // Determine status levels
    const getStatus = (s: number) => {
        if (s >= 90) return { label: 'Excelente', color: 'text-emerald-400', stroke: '#10b981', bg: 'bg-emerald-500/10' }
        if (s >= 75) return { label: 'Saludable', color: 'text-blue-400', stroke: '#60a5fa', bg: 'bg-blue-500/10' }
        if (s >= 50) return { label: 'En Riesgo', color: 'text-amber-400', stroke: '#fbbf24', bg: 'bg-amber-500/10' }
        return { label: 'Crítico', color: 'text-red-400', stroke: '#f87171', bg: 'bg-red-500/10' }
    }

    const status = getStatus(score)
    const strokeDasharray = 251.2 // Circumference of circle with r=40 (2 * PI * 40)
    const strokeDashoffset = strokeDasharray - (strokeDasharray * (score / 100))

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 relative overflow-hidden group hover:border-gray-700 transition-all duration-500 shadow-2xl">
            {/* Background Glow */}
            <div className={`absolute -top-24 -right-24 w-64 h-64 opacity-20 blur-[100px] rounded-full transition-colors duration-1000 ${status.bg}`} />

            <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                {/* Gauge Section */}
                <div className="relative w-40 h-40">
                    <svg className="w-full h-full transform -rotate-90">
                        {/* Background Track */}
                        <circle
                            cx="80"
                            cy="80"
                            r="70"
                            stroke="currentColor"
                            strokeWidth="12"
                            fill="transparent"
                            className="text-gray-800"
                        />
                        {/* Progress Bar */}
                        <circle
                            cx="80"
                            cy="80"
                            r="70"
                            stroke={status.stroke}
                            strokeWidth="12"
                            strokeDasharray="440"
                            strokeDashoffset={440 - (440 * score) / 100}
                            strokeLinecap="round"
                            fill="transparent"
                            className="transition-all duration-1000 ease-out"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-black text-white tracking-tighter">{score}</span>
                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Score</span>
                    </div>
                </div>

                {/* Info Section */}
                <div className="flex-1 space-y-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Activity className={`w-4 h-4 ${status.color}`} />
                            <h3 className="text-lg font-bold text-white tracking-tight">Salud de Caja</h3>
                        </div>
                        <p className="text-sm text-gray-400">Tu estado financiero basado en auditoría algorítmica.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${anomalyCount > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                {anomalyCount > 0 ? <AlertCircle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 font-bold uppercase">Anomalías</div>
                                <div className="text-sm font-bold text-white">{anomalyCount}</div>
                            </div>
                        </div>
                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                                <TrendingUp className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 font-bold uppercase">Optimización</div>
                                <div className="text-sm font-bold text-white">+{recoveryPotential}%</div>
                            </div>
                        </div>
                    </div>

                    <div className={`text-xs font-bold px-3 py-1.5 rounded-full inline-flex ${status.bg} ${status.color} border border-current/20`}>
                        Nivel {status.label}
                    </div>
                </div>
            </div>
        </div>
    )
}
