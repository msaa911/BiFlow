
'use client'

import { Activity, ShieldCheck, TrendingUp, AlertCircle } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'

interface CashHealthScoreProps {
    score: number
    anomalyCount: number
    recoveryPotential: number
    opportunityCost?: number
    daysOfRunway?: number | 'stable'
    history?: { score: number, fecha: string }[]
    onOpenStressTest?: () => void
}

export function CashHealthScore({
    score,
    anomalyCount,
    recoveryPotential,
    opportunityCost = 0,
    daysOfRunway = 'stable',
    history = [],
    onOpenStressTest
}: CashHealthScoreProps) {
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 relative overflow-hidden group hover:border-gray-700 transition-all duration-500 shadow-2xl h-full flex flex-col justify-center">
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

                    <div className="grid grid-cols-2 gap-3 pb-2">
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
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                                <TrendingUp className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500 font-bold uppercase">Recupero</div>
                                <div className="text-sm font-bold text-white">+{recoveryPotential}%</div>
                            </div>
                        </div>
                    </div>

                    {opportunityCost > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between group/leak hover:border-amber-500/40 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 animate-pulse">
                                    <TrendingUp className="w-4 h-4 rotate-180" />
                                </div>
                                <div>
                                    <div className="text-[10px] text-amber-500/70 font-bold uppercase">Fuga de Capital (Est.)</div>
                                    <div className="text-sm font-bold text-white">
                                        {new Intl.NumberFormat('es-AR', {
                                            style: 'currency',
                                            currency: 'ARS',
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2
                                        }).format(opportunityCost)}
                                    </div>
                                </div>
                            </div>
                            <div className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                DINERO OCIOSO
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <div className={`text-[10px] font-bold px-3 py-1.5 rounded-full inline-flex ${status.bg} ${status.color} border border-current/20`}>
                            Nivel {status.label}
                        </div>
                        <div className={`text-[10px] font-bold px-3 py-1.5 rounded-full inline-flex border ${anomalyCount > 0 || recoveryPotential > 0
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                            }`}>
                            {anomalyCount > 0 || recoveryPotential > 0 ? 'Auditoría Activa' : 'Auditoría Inactiva'}
                        </div>
                    </div>

                    <button
                        onClick={onOpenStressTest}
                        className="ml-4 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors border-b border-blue-400/30 pb-0.5"
                    >
                        Simular Stress Test →
                    </button>
                </div>

                {/* Trend Chart Section */}
                <div className="hidden lg:block w-48 h-24 mt-auto">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Tendencia (30d)</div>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history.length > 0 ? history : [
                            { score: 60 }, { score: 65 }, { score: 70 }, { score: 68 },
                            { score: 75 }, { score: 85 }, { score: 80 }, { score: 90 }, { score: score }
                        ]}>
                            <defs>
                                <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={status.stroke} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={status.stroke} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="score"
                                stroke={status.stroke}
                                fillOpacity={1}
                                fill="url(#scoreColor)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    )
}
