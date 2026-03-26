'use client'

import { Bell, Search, Menu, Database, ShieldAlert, Cpu } from 'lucide-react'

export function AdminHeader() {
    return (
        <header className="h-16 border-b border-indigo-900/20 bg-[#0a0a0f]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-20">
            <div className="flex items-center gap-4 md:hidden">
                <button className="text-gray-400 hover:text-white">
                    <Menu className="h-6 w-6" />
                </button>
                <span className="font-bold text-white text-indigo-400 uppercase tracking-tighter">BiFlow Admin</span>
            </div>

            {/* Admin Shortcuts/Quick Search */}
            <div className="hidden md:flex items-center gap-5 w-full max-w-lg">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Buscar por Email, CUIT o ID de Organización..."
                        className="w-full bg-[#12121a] border border-indigo-900/20 rounded-lg text-sm text-white placeholder:text-gray-600 pl-10 pr-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* System Health Indicators */}
                <div className="hidden lg:flex items-center gap-4 pr-4 border-r border-indigo-900/20 text-[10px] font-bold uppercase tracking-wider">
                   <div className="flex items-center gap-2 text-emerald-500">
                     <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                     DB connected
                   </div>
                   <div className="flex items-center gap-2 text-indigo-400">
                     <Cpu className="h-3 w-3" />
                     API 100%
                   </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="relative p-2 text-gray-400 hover:text-indigo-400 transition-colors bg-white/5 rounded-lg border border-transparent hover:border-indigo-500/20">
                        <ShieldAlert className="h-5 w-5" />
                        <span className="absolute top-1 right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-[#0a0a0f] text-[8px] text-white flex items-center justify-center font-bold">3</span>
                    </button>
                    
                    <button className="relative p-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-lg border border-transparent hover:border-indigo-500/20">
                        <Bell className="h-5 w-5" />
                        <div className="absolute top-1.5 right-1.5 h-2 w-2 bg-indigo-500 rounded-full border border-gray-900" />
                    </button>
                </div>
            </div>
        </header>
    )
}
