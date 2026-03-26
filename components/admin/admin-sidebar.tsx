'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Building2, LayoutDashboard, ShieldCheck, LogOut, Settings, ExternalLink, Activity } from 'lucide-react'

const navigation = [
    { name: 'Admin Hub', href: '/admin', icon: LayoutDashboard },
    { name: 'Usuarios B2B', href: '/admin/users', icon: Users },
    { name: 'Empresas / Tenants', href: '/admin/organizations', icon: Building2 },
    { name: 'Monitor del Sistema', href: '/admin/monitor', icon: Activity },
    { name: 'Seguridad / RBAC', href: '/admin/security', icon: ShieldCheck },
    { name: 'Global Settings', href: '/admin/settings', icon: Settings },
]

export function AdminSidebar({ userEmail }: { userEmail: string }) {
    const pathname = usePathname()

    return (
        <aside className="hidden md:flex flex-col w-64 bg-[#0a0a0f] border-r border-indigo-900/20 h-screen sticky top-0 relative overflow-hidden">
            {/* Background design elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[80px] -z-10" />
            
            <div className="p-6">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xl tracking-tight">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    BiFlow Admin
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/10'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            <item.icon className={`h-5 w-5 ${isActive ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                            {item.name}
                        </Link>
                    )
                })}

                <div className="pt-8 pb-4">
                    <p className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Back To App</p>
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-500 hover:bg-emerald-500/5 transition-all group border border-dashed border-emerald-500/10"
                    >
                        <ExternalLink className="h-5 w-5" />
                        Go to Dashboard
                    </Link>
                </div>
            </nav>

            <div className="p-4 border-t border-indigo-900/20 bg-indigo-500/5">
                <div className="bg-[#05050a] rounded-xl p-3 flex items-center gap-3 mb-3 border border-indigo-500/10">
                    <div className="h-8 w-8 rounded-full bg-indigo-900/50 text-indigo-300 flex items-center justify-center text-xs font-bold border border-indigo-500/30">
                        {userEmail.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{userEmail}</p>
                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Superadmin</p>
                    </div>
                </div>

                <form action="/auth/signout" method="post">
                    <input type="hidden" name="redirectTo" value="/login" />
                    <button className="flex w-full items-center gap-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-colors">
                        <LogOut className="h-4 w-4" />
                        Cerrar Sesión
                    </button>
                </form>
            </div>
        </aside>
    )
}
