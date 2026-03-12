import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

interface KPICardProps {
    title: string
    value: string
    description?: string
    icon: React.ReactNode
    trend?: 'up' | 'down' | 'neutral'
    trendValue?: string
    trendColor?: 'emerald' | 'red' | 'amber' | 'blue' | 'gray'
}

export function KPICard({ title, value, description, icon, trend, trendValue, trendColor }: KPICardProps) {
    const colorMap = {
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]',
        red: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]',
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]',
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]',
        gray: 'bg-white/5 text-gray-400 border-white/10',
    }

    const defaultColor = trend === 'up' ? 'emerald' : trend === 'down' ? 'red' : 'gray'
    const colorClass = colorMap[trendColor || defaultColor]

    return (
        <div className="glass-card rounded-[2rem] p-7 relative overflow-hidden group hover:scale-[1.02] active:scale-[0.98] transition-all duration-500 ease-out-expo shimmer">
            {/* Background Gradient */}
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-transparent via-transparent to-${trendColor || defaultColor}-500/5 -mr-16 -mt-16 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
            
            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="p-3 bg-white/5 backdrop-blur-xl rounded-2xl text-gray-300 border border-white/10 shadow-xl group-hover:bg-emerald-500/10 group-hover:text-emerald-400 group-hover:border-emerald-500/20 transition-all duration-500 group-hover:rotate-6">
                    {icon}
                </div>
                {trend && (
                    <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-black px-3 py-1.5 rounded-full ${colorClass} transition-all duration-500`}>
                        {trend === 'up' ? <ArrowUpRight className="h-3.5 w-3.5" /> :
                            trend === 'down' ? <ArrowDownRight className="h-3.5 w-3.5" /> :
                                <Minus className="h-3.5 w-3.5" />}
                        {trendValue || (trend === 'up' ? '+2.5%' : trend === 'down' ? '-1.2%' : 'ESTABLE')}
                    </div>
                )}
            </div>

            <div className="relative z-10 space-y-2">
                <div className="flex flex-col gap-0.5">
                    <p className="text-[10px] font-black text-gray-500/80 uppercase tracking-[0.2em] leading-tight">
                        {title}
                    </p>
                    <h3 className="text-3xl font-black text-white tracking-tighter shimmer-text group-hover:text-emerald-400 transition-colors duration-700">
                        {value}
                    </h3>
                </div>
                
                {description && (
                    <div className="pt-2 border-t border-white/5">
                        <p className={`text-[10px] font-bold tracking-wide italic ${
                            description.toLowerCase().includes('riesgo') || description.toLowerCase().includes('atención') || trendColor === 'red'
                            ? 'text-red-400/80 animate-pulse' 
                            : 'text-gray-500'
                        }`}>
                            {description}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Hover Accent */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>
    )
}
