'use client'

import { Bell, Search, Menu, Bot } from 'lucide-react'

export function Header() {
    return (
        <header className="h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-20">
            <div className="flex items-center gap-4 md:hidden">
                <button className="text-gray-400 hover:text-white">
                    <Menu className="h-6 w-6" />
                </button>
                <span className="font-bold text-white">BiFlow</span>
            </div>

            {/* Desktop Spacer (or search in future) */}
            <div className="hidden md:flex items-center gap-2 w-full max-w-md">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Buscar transacciones, empresas..."
                        className="w-full bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-500 pl-10 pr-4 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-biflow-ai'))}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-full border border-emerald-500/20 transition-all group shadow-lg shadow-emerald-500/5"
                >
                    <Bot className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-tight hidden sm:inline">BiFlow AI</span>
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                </button>

                <button className="relative p-2 text-gray-400 hover:text-white transition-colors">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-2 right-2 h-2 w-2 bg-emerald-500 rounded-full border border-gray-900" />
                </button>
            </div>
        </header>
    )
}
