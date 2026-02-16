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
        emerald: 'bg-emerald-500/10 text-emerald-400',
        red: 'bg-red-500/10 text-red-400',
        amber: 'bg-amber-500/10 text-amber-400',
        blue: 'bg-blue-500/10 text-blue-400',
        gray: 'bg-gray-800 text-gray-400',
    }

    const defaultColor = trend === 'up' ? 'emerald' : trend === 'down' ? 'red' : 'gray'
    const colorClass = colorMap[trendColor || defaultColor]

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 relative overflow-hidden group hover:border-gray-700 transition-all duration-300">
            {/* Glossy Effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-white/10 transition-colors" />

            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-2.5 bg-gray-800 rounded-xl text-gray-300">
                    {icon}
                </div>
                {trend && (
                    <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${colorClass}`}>
                        {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> :
                            trend === 'down' ? <ArrowDownRight className="h-3 w-3" /> :
                                <Minus className="h-3 w-3" />}
                        {trendValue || (trend === 'up' ? '+2.5%' : trend === 'down' ? '-1.2%' : '0%')}
                    </div>
                )}
            </div>

            <div className="relative z-10">
                <p className="text-sm font-medium text-gray-400">{title}</p>
                <h3 className="text-2xl font-bold text-white mt-1 tracking-tight">{value}</h3>
                {description && (
                    <p className="text-xs text-gray-500 mt-2">{description}</p>
                )}
            </div>
        </div>
    )
}
