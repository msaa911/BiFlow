import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, CreditCard, Activity, ArrowUpRight, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default async function AdminDashboard() {
    const supabase = await createClient()
    
    // Fetch system-wide stats
    const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
    const { count: orgCount } = await supabase.from('organizations').select('*', { count: 'exact', head: true })
    const { count: transactionCount } = await supabase.from('transacciones').select('*', { count: 'exact', head: true })

    const stats = [
        { 
            label: 'Usuarios Registrados', 
            value: userCount || 0, 
            icon: Users, 
            color: 'indigo', 
            growth: '+12%',
            bg: 'bg-indigo-500/10',
            text: 'text-indigo-400',
            ring: 'ring-indigo-500/20',
            iconColor: 'indigo'
        },
        { 
            label: 'Empresas / Tenants', 
            value: orgCount || 0, 
            icon: Building2, 
            color: 'blue', 
            growth: '+4%',
            bg: 'bg-blue-500/10',
            text: 'text-blue-400',
            ring: 'ring-blue-500/20',
            iconColor: 'blue'
        },
        { 
            label: 'Transacciones Auditadas', 
            value: transactionCount || 0, 
            icon: CreditCard, 
            color: 'emerald', 
            growth: '+25%',
            bg: 'bg-emerald-500/10',
            text: 'text-emerald-400',
            ring: 'ring-emerald-500/20',
            iconColor: 'emerald'
        },
        { 
            label: 'Estado del Sistema', 
            value: 'Operativo', 
            icon: Activity, 
            color: 'violet', 
            growth: '100% UP',
            bg: 'bg-violet-500/10',
            text: 'text-violet-400',
            ring: 'ring-violet-500/20',
            iconColor: 'violet'
        },
    ]

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                    Admin <span className="text-indigo-500">Overview</span>
                    <TrendingUp className="h-5 w-5 text-indigo-500" />
                </h1>
                <p className="text-gray-400 max-w-2xl">
                    Panel de control global de BiFlow. Supervisa el crecimiento, la salud del sistema y gestiona las cuentas B2B activas.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <div 
                        key={i} 
                        className="p-6 rounded-2xl bg-[#0a0a0f] border border-white/5 hover:border-indigo-500/30 transition-all group overflow-hidden relative shadow-lg shadow-black/40"
                    >
                        {/* Background glow for card */}
                        <div className={`absolute top-0 right-0 w-16 h-16 ${stat.bg} blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity`} />
                        
                        <div className="flex items-start justify-between relative z-10">
                            <div className={`p-3 rounded-xl ${stat.bg} ${stat.text} ring-1 ${stat.ring}`}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1 bg-white/5 px-2 py-1 rounded-full">
                                <ArrowUpRight className="h-3 w-3 text-indigo-500" />
                                {stat.growth}
                            </span>
                        </div>
                        
                        <div className="mt-4 space-y-1 relative z-10">
                            <p className="text-sm font-medium text-gray-400">{stat.label}</p>
                            <h3 className="text-2xl font-bold tracking-tight text-white">
                                {stat.value}
                            </h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* User management preview card */}
                <div className="lg:col-span-2 p-8 rounded-3xl bg-[#0a0a0f] border border-white/5 shadow-xl relative overflow-hidden h-[400px]">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-bold text-white">Gestión de Usuarios</h3>
                            <p className="text-sm text-gray-500">Administra roles y accesos globales de la plataforma.</p>
                        </div>
                        <Link href="/admin/users" className="text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest">Ver Todos</Link>
                    </div>
                    
                    <div className="flex items-center justify-center h-[250px] bg-white/5 rounded-2xl border border-dashed border-white/10 group">
                        <div className="text-center group-hover:scale-105 transition-transform">
                             <Users className="h-10 w-10 text-gray-700 mx-auto mb-4" />
                             <p className="text-gray-500 text-sm">Próximamente: Lista detallada y acciones rápidas.</p>
                        </div>
                    </div>
                </div>

                {/* System Activity */}
                <div className="p-8 rounded-3xl bg-[#0a0a0f] border border-white/5 shadow-xl relative overflow-hidden">
                    <h3 className="text-xl font-bold text-white mb-6">Logs Recientes</h3>
                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5].map((_, i) => (
                            <div key={i} className="flex gap-4 p-3 rounded-xl hover:bg-white/5 transition-all text-xs border border-transparent hover:border-indigo-500/10">
                                <div className="h-3 w-3 rounded-full bg-indigo-500 mt-0.5 shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-300">Intento de login fallido desde 192.168.1.1</p>
                                    <p className="text-gray-500 font-medium">Hace {i + 1} minutos</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full py-3 mt-8 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                        Ver Auditoría Completa
                    </button>
                </div>
            </div>
        </div>
    )
}
