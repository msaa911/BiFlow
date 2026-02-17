
'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, X, Sparkles, Loader2, MessageSquare } from 'lucide-react'

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

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    const handleSend = async () => {
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

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-8 right-8 p-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl shadow-2xl shadow-emerald-500/20 transition-all hover:scale-110 z-50 group flex items-center gap-3"
            >
                <div className="relative">
                    <Bot className="w-6 h-6" />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-white rounded-full border-2 border-emerald-500 animate-pulse"></span>
                </div>
                <span className="font-bold text-sm pr-2">CFO AI</span>
            </button>
        )
    }

    return (
        <div className="fixed bottom-8 right-8 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="p-4 border-b border-gray-800 bg-emerald-500/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Advisor CFO AI</h3>
                        <p className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-widest">En línea - Algoritmos v2.0</p>
                    </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Chat Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {messages.map(m => (
                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`p-2 rounded-xl h-fit ${m.role === 'user' ? 'bg-blue-500/10' : 'bg-emerald-500/10'}`}>
                                {m.role === 'user' ? <User className="w-4 h-4 text-blue-400" /> : <Bot className="w-4 h-4 text-emerald-400" />}
                            </div>
                            <div className={`p-3 rounded-2xl text-sm leading-relaxed ${m.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-600/10'
                                    : 'bg-gray-900 text-gray-200 border border-gray-800 rounded-tl-none'
                                }`}>
                                {m.content}
                            </div>
                        </div>
                    </div>
                ))}
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
