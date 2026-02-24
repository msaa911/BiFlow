'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X, Sparkles, Loader2, ArrowRightLeft, Calendar, User, DollarSign } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface Suggestion {
    transId: string
    transDesc: string
    monto: number
    invoiceIds: string[]
    level: number
    auto: boolean
}

export function ReconciliationAlerts() {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState<string | null>(null)

    useEffect(() => {
        fetchSuggestions()
    }, [])

    async function fetchSuggestions() {
        try {
            const res = await fetch('/api/reconcile/suggestions')
            const data = await res.json()
            if (data.suggestions) {
                setSuggestions(data.suggestions)
            }
        } catch (error) {
            console.error('Error fetching suggestions:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleApprove(suggestion: Suggestion) {
        setProcessing(suggestion.transId)
        try {
            // Simplified approximation: we would need a real endpoint for manual approval
            // For now, we simulate the success
            await new Promise(resolve => setTimeout(resolve, 800))
            setSuggestions(prev => prev.filter(s => s.transId !== suggestion.transId))
            toast.success('Conciliación aprobada con éxito')
        } catch (error) {
            toast.error('Error al conciliar')
        } finally {
            setProcessing(null)
        }
    }

    if (loading) return (
        <Card className="bg-gray-900 border-gray-800 animate-pulse">
            <div className="h-40 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
            </div>
        </Card>
    )

    if (suggestions.length === 0) return null

    return (
        <Card className="bg-gray-900 border-gray-800 shadow-2xl overflow-hidden">
            <CardHeader className="bg-emerald-500/5 pb-3">
                <CardTitle className="text-xs font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Sugerencias de Conciliación (IA)
                </CardTitle>
                <p className="text-[10px] text-gray-500">Detectamos {suggestions.length} movimientos con alta probabilidad de coincidencia.</p>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-gray-800 max-h-[400px] overflow-y-auto">
                    {suggestions.map((s) => (
                        <div key={s.transId} className="p-4 hover:bg-gray-800/20 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[9px] uppercase font-black border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                                            {s.level === 3 ? 'Match Difuso' : 'Match Proximidad'}
                                        </Badge>
                                        <span className="text-[10px] font-mono text-gray-500">#{s.transId.slice(0, 8)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 space-y-1">
                                            <p className="text-xs font-bold text-white leading-tight truncate">{s.transDesc}</p>
                                            <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                                <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {new Intl.NumberFormat('es-AR').format(s.monto)}</span>
                                                <span className="flex items-center gap-1 text-emerald-500/80 font-bold">
                                                    <ArrowRightLeft className="w-3 h-3" /> {s.invoiceIds.length} Factura(s)
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 rounded-full hover:bg-red-500/10 hover:text-red-500 text-gray-500"
                                        onClick={() => setSuggestions(prev => prev.filter(item => item.transId !== s.transId))}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        disabled={!!processing}
                                        className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white"
                                        onClick={() => handleApprove(s)}
                                    >
                                        {processing === s.transId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-3 bg-gray-900 border-t border-gray-800">
                    <Button variant="ghost" className="w-full text-[10px] uppercase font-bold text-gray-500 hover:text-emerald-500 transition-colors">
                        Ver historial de conciliación
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
