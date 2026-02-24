'use client'

import { useState, useRef, useEffect } from 'react'
import {
    Send, Bot, User, X, Sparkles, Loader2,
    Calculator, TrendingUp, AlertCircle, ChevronRight,
    ArrowRightLeft, BadgeDollarSign, HeartPulse
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
}

export function AIChatAdvisor() {
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Hola, soy tu CFO Algorítmico. He analizado tus proyecciones y la normativa del BCRA. Tu liquidez actual es sólida, pero hay una oportunidad de netting detectada. ¿Quieres que la analicemos?'
        }
    ])
    const [isLoading, setIsLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev)
        window.addEventListener('toggle-biflow-ai', handleToggle)
        return () => window.removeEventListener('toggle-biflow-ai', handleToggle)
    }, [])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isLoading])

    const handleSend = async (forcedInput?: string) => {
        const textToSend = forcedInput || input
        if (!textToSend.trim() || isLoading) return

        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: textToSend }
        setMessages(prev => [...prev, userMsg])
        if (!forcedInput) setInput('')
        setIsLoading(true)

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: textToSend })
            })

            if (res.ok) {
                const data = await res.json()
                const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.reply }
                setMessages(prev => [...prev, assistantMsg])
            }
        } catch (error) {
            setMessages(prev => [...prev, { id: 'err', role: 'assistant', content: 'Lo siento, hubo un error procesando tu consulta financiera.' }])
        } finally {
            setIsLoading(false)
        }
    }

    const quickActions = [
        { label: 'Analizar Liquidez', icon: HeartPulse, color: 'text-emerald-400' },
        { label: 'Oportunidades Netting', icon: ArrowRightLeft, color: 'text-blue-400' },
        { label: 'Simular Atraso Factura', icon: Calculator, color: 'text-amber-400' },
        { label: 'Calificación de Clientes', icon: TrendingUp, color: 'text-purple-400' },
    ]

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] animate-in fade-in duration-300"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Slide-over Panel */}
            <div className={cn(
                "fixed top-0 right-0 h-full w-full max-w-[450px] bg-gray-950/95 border-l border-gray-800 shadow-2xl z-[100] transform transition-transform duration-500 ease-in-out flex flex-col",
                isOpen ? "translate-x-0" : "translate-x-full"
            )}>
                {/* Premium Header */}
                <div className="relative p-6 border-b border-gray-800 bg-gradient-to-br from-emerald-500/10 to-transparent overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30">
                                    <Bot className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 p-1 bg-gray-950 rounded-lg">
                                    <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
                                </div>
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-lg tracking-tight">CFO Algorítmico</h3>
                                <div className="flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-[0.2em]">Engine Active v3.0</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-all hover:rotate-90 duration-300"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Chat Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                    {messages.map((m, idx) => {
                        const isAssistant = m.role === 'assistant'
                        const suggestionMatch = m.content.match(/\[\[SUGGESTION:(.*?)\]\]/)
                        const displayContent = m.content.replace(/\[\[SUGGESTION:.*?\]\]/g, '')
                        let suggestionData = null
                        try { if (suggestionMatch) suggestionData = JSON.parse(suggestionMatch[1]) } catch (e) { }

                        return (
                            <div key={m.id} className={cn(
                                "flex flex-col animate-in slide-in-from-bottom-2 duration-300",
                                isAssistant ? "items-start" : "items-end"
                            )}>
                                <div className={cn(
                                    "flex gap-3 max-w-[85%]",
                                    !isAssistant && "flex-row-reverse"
                                )}>
                                    {isAssistant && (
                                        <div className="p-2 bg-emerald-500/10 rounded-xl h-fit mt-1 border border-emerald-500/20">
                                            <Sparkles className="w-4 h-4 text-emerald-400" />
                                        </div>
                                    )}
                                    <div className={cn(
                                        "p-4 rounded-2xl text-sm leading-relaxed shadow-xl",
                                        isAssistant
                                            ? "bg-gray-900/50 border border-gray-800 text-gray-100 rounded-tl-none"
                                            : "bg-emerald-600 text-white rounded-tr-none"
                                    )}>
                                        {displayContent}
                                    </div>
                                </div>

                                {suggestionData && (
                                    <div className="ml-11 mt-3 p-4 bg-gray-900 border border-emerald-500/30 rounded-2xl max-w-[80%] shadow-lg shadow-emerald-900/10">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="p-1 bg-emerald-500/20 rounded">
                                                <Calculator className="w-3 h-3 text-emerald-400" />
                                            </div>
                                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Simulación Inteligente</span>
                                        </div>
                                        <p className="text-xs text-white font-medium mb-1">{suggestionData.descripcion}</p>
                                        <p className={cn(
                                            "text-xs font-bold mb-4",
                                            suggestionData.monto > 0 ? "text-emerald-400" : "text-amber-400"
                                        )}>
                                            Impacto: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(suggestionData.monto)}
                                        </p>
                                        <button
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent('biflow-add-projection', { detail: suggestionData }));
                                                toast.success("Simulación aplicada al Cash Flow", {
                                                    description: `${suggestionData.descripcion} por ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(suggestionData.monto)}`,
                                                });
                                                setMessages(prev => prev.map(msg => msg.id === m.id ? {
                                                    ...msg,
                                                    content: msg.content.replace(/\[\[SUGGESTION:.*?\]\]/g, ' [Sugerencia aplicada con éxito ✅]')
                                                } : msg));
                                            }}
                                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-xs font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                                        >
                                            Ejecutar en Cash Flow
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {isLoading && (
                        <div className="flex justify-start animate-pulse">
                            <div className="flex gap-3 bg-gray-900/50 border border-gray-800 p-4 rounded-2xl rounded-tl-none">
                                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                                <span className="text-xs text-gray-400 font-medium">El CFO está consultando el motor de tesorería...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Controls */}
                <div className="p-6 border-t border-gray-800 bg-gray-900/20 backdrop-blur-xl">
                    {/* Quick Action Chips */}
                    {messages.length < 4 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                            {quickActions.map((action, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSend(action.label)}
                                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/40 hover:bg-gray-800 hover:border-emerald-500/30 border border-gray-700/50 rounded-xl transition-all group"
                                >
                                    <action.icon className={cn("w-3.5 h-3.5", action.color)} />
                                    <span className="text-[11px] text-gray-300 font-medium group-hover:text-white">{action.label}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                        <div className="relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Escribe tu consulta financiera..."
                                className="w-full bg-gray-950 border border-gray-800 rounded-2xl py-4 pl-5 pr-14 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 transition-all shadow-inner"
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={isLoading || !input.trim()}
                                className="absolute right-2 top-2 p-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-800 disabled:text-gray-600 text-gray-950 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-2 mt-4 opacity-40">
                        <BadgeDollarSign className="w-3 h-3" />
                        <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-gray-400">
                            Algorithmic CFO Intelligence
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}
