
'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, X, Sparkles, Loader2, MessageSquare, Calculator } from 'lucide-react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
}

export function AIAdvisor() {
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: 'Hola Miguel, soy tu CFO Algorítmico. He analizado tus últimas transacciones y detecté un potencial de ahorro del 5.2% en impuestos. ¿En qué puedo ayudarte hoy?'
        }
    ])
    const [isLoading, setIsLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Listener para apertura externa desde el Header
    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev)
        window.addEventListener('toggle-biflow-ai', handleToggle)
        return () => window.removeEventListener('toggle-biflow-ai', handleToggle)
    }, [])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    const handleSend = async () => {
        // ... (keep logic)
        if (!input.trim() || isLoading) return

        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setIsLoading(true)

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: input })
            })

            if (res.ok) {
                const data = await res.json()
                const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.reply }
                setMessages(prev => [...prev, assistantMsg])
            }
        } catch (error) {
            console.error('Chat error', error)
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed bottom-24 right-8 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-10rem)] bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="p-4 border-b border-gray-800 bg-emerald-500/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Advisor BiFLOW AI</h3>
                        <p className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-widest">En línea - Algoritmos v2.0</p>
                    </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Chat Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {messages.map(m => {
                    const suggestionMatch = m.content.match(/\[\[SUGGESTION:(.*?)\]\]/)
                    const displayContent = m.content.replace(/\[\[SUGGESTION:.*?\]\]/, '')
                    const suggestionData = suggestionMatch ? JSON.parse(suggestionMatch[1]) : null

                    return (
                        <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} gap-2`}>
                            <div className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`p-2 rounded-xl h-fit ${m.role === 'user' ? 'bg-blue-500/10' : 'bg-emerald-500/10'}`}>
                                    {m.role === 'user' ? <User className="w-4 h-4 text-blue-400" /> : <Bot className="w-4 h-4 text-emerald-400" />}
                                </div>
                                <div className={`p-3 rounded-2xl text-sm leading-relaxed ${m.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-600/10'
                                    : 'bg-gray-900 text-gray-200 border border-gray-800 rounded-tl-none'
                                    }`}>
                                    {displayContent}
                                </div>
                            </div>

                            {suggestionData && (
                                <div className="ml-11 mt-1 p-3 bg-gray-900 border border-emerald-500/30 rounded-2xl max-w-[80%] animate-in slide-in-from-left-2 duration-300">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1 bg-emerald-500/20 rounded">
                                            <Calculator className="w-3 h-3 text-emerald-400" />
                                        </div>
                                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Simulación Disponible</span>
                                    </div>
                                    <p className="text-xs text-white font-medium mb-1">{suggestionData.descripcion}</p>
                                    <p className={`text-xs font-bold mb-3 ${suggestionData.monto > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        Impacto: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(suggestionData.monto)}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent('biflow-add-projection', { detail: suggestionData }));
                                                setMessages(prev => prev.filter(msg => msg.id !== m.id).concat({
                                                    ...m,
                                                    id: m.id + '-done',
                                                    content: m.content.replace(/\[\[SUGGESTION:.*?\]\]/, '[Sugerencia aplicada ✅]')
                                                }));
                                            }}
                                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase rounded-lg transition-colors"
                                        >
                                            Aplicar Impacto
                                        </button>
                                        <button
                                            onClick={() => {
                                                setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, content: msg.content.replace(/\[\[SUGGESTION:.*?\]\]/, '') } : msg));
                                            }}
                                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-bold uppercase rounded-lg transition-colors"
                                        >
                                            Ignorar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="flex gap-3 bg-gray-900 border border-gray-800 p-3 rounded-2xl rounded-tl-none">
                            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                            <span className="text-xs text-gray-500">Analizando datos financieros...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Pregúntame algo sobre tus finanzas..."
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="absolute right-2 top-1.5 p-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-all"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-[10px] text-gray-600 text-center mt-3 font-medium">
                    Powered by BiFlow Intelligence Engine
                </p>
            </div>
        </div>
    )
}
