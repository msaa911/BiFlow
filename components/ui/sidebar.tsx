'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, Shield, Settings, FileText, LogOut, Clock, Wallet, Landmark } from 'lucide-react'

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Bancos', href: '/dashboard/banks', icon: Landmark },
    { name: 'Finanzas', href: '/dashboard/treasury', icon: Wallet },
    { name: 'Auditoría IA', href: '/dashboard/audit', icon: Shield },
    { name: 'Reportes', href: '/dashboard/reports', icon: FileText },
    { name: 'Historial', href: '/dashboard/history', icon: Clock },
    { name: 'Carga de Documentos', href: '/dashboard/upload', icon: FileText },
    { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
]

export function Sidebar({ userEmail }: { userEmail: string }) {
    const pathname = usePathname()

    const handleFinanzasClick = (e: React.MouseEvent) => {
        e.preventDefault()
        // Full page reload to /dashboard/treasury — bypasses ALL Next.js caching
        window.location.href = '/dashboard/treasury'
    }

    return (
        <aside className="hidden md:flex flex-col w-64 bg-gray-900 border-r border-gray-800 h-screen sticky top-0">
            <div className="p-6">
                <div className="flex items-center gap-2 text-emerald-500 font-bold text-xl tracking-tight">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-blue-500 flex items-center justify-center text-white">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    BiFlow
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    const isFinanzas = item.name === 'Finanzas'
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={isFinanzas ? handleFinanzasClick : undefined}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                }`}
                        >
                            <item.icon className={`h-5 w-5 ${isActive ? 'text-emerald-500' : 'text-gray-500 group-hover:text-gray-300'}`} />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 border-t border-gray-800">
                <div className="bg-gray-800/50 rounded-xl p-3 flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-900/50 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/20">
                        {userEmail.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{userEmail}</p>
                        <p className="text-xs text-gray-500">Plan Pro</p>
                    </div>
                </div>

                <form action="/auth/signout" method="post">
                    <button className="flex w-full items-center gap-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-colors">
                        <LogOut className="h-4 w-4" />
                        Cerrar Sesión
                    </button>
                </form>
            </div>
        </aside>
    )
}
