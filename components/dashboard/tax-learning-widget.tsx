'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, Check, X, Clock, ShieldAlert, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PendingTax {
    id: string
    patron_busqueda: string
}

export function TaxLearningWidget({ organizationId }: { organizationId: string }) {
    const [pending, setPending] = useState<PendingTax[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)

    const supabase = createClient()

    useEffect(() => {
        async function loadPending() {
            const { data } = await supabase
                .from('reglas_fiscales_ia')
                .select('id, patron_busqueda')
                .eq('organization_id', organizationId)
                .eq('estado', 'PENDIENTE')
                .limit(1) // Only show one at a time to not overwhelm

            setPending(data || [])
            setLoading(false)
        }
        loadPending()
    }, [organizationId, supabase])

    const handleClassify = async (id: string, action: 'YES' | 'NO' | 'LATER' | 'IGNORE_PERMANENT') => {
        setProcessingId(id)
        try {
            const res = await fetch('/api/taxes/classify', {
                method: 'POST',
                body: JSON.stringify({
                    id,
                    organization_id: organizationId,
                    es_recuperable: action === 'YES',
                    omitir_siempre: action === 'IGNORE_PERMANENT',
                    action
                })
            })

            if (res.ok) {
                setPending(prev => prev.filter(p => p.id !== id))
            }
        } catch (error) {
            console.error('Classification failed', error)
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) return null
    if (pending.length === 0) return null

    const current = pending[0]

    return (
        <Card className="bg-gray-950 border-emerald-500/30 border-l-4 border-l-emerald-500 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
            <CardHeader className="pb-2 bg-emerald-500/5">
                <div className="flex items-center gap-2 mb-1">
                    <div className="bg-emerald-500/20 p-1.5 rounded-lg">
                        <Brain className="w-5 h-5 text-emerald-400" />
                    </div>
                    <CardTitle className="text-sm font-black italic tracking-tighter uppercase text-emerald-400">
                        Ciclo de Aprendizaje Fiscal
                    </CardTitle>
                </div>
                <CardDescription className="text-[11px] text-gray-400 uppercase font-bold tracking-widest">
                    La IA de BiFlow está aprendiendo de tu operativa...
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
                <div className="space-y-1">
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-tighter">He detectado un nuevo concepto impositivo:</p>
                    <div className="bg-gray-900 border border-gray-800 p-3 rounded-lg">
                        <p className="text-lg font-mono font-bold text-white tracking-tight">{current.patron_busqueda}</p>
                    </div>
                    <p className="text-xs font-bold text-gray-300 mt-2">¿Este impuesto es recuperable (percepción/retención) para tu empresa?</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Button
                        onClick={() => handleClassify(current.id, 'YES')}
                        disabled={processingId === current.id}
                        className="bg-emerald-600 hover:bg-emerald-500 font-bold uppercase tracking-tighter text-[10px] h-9"
                    >
                        {processingId === current.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                        Sí, es Recuperable
                    </Button>
                    <Button
                        onClick={() => handleClassify(current.id, 'NO')}
                        variant="outline"
                        disabled={processingId === current.id}
                        className="border-gray-800 hover:bg-red-500/10 hover:text-red-400 font-bold uppercase tracking-tighter text-[10px] h-9"
                    >
                        No, es un Gasto
                    </Button>
                    <Button
                        onClick={() => handleClassify(current.id, 'LATER')}
                        variant="ghost"
                        className="text-gray-500 hover:text-white font-bold uppercase tracking-tighter text-[9px] h-8"
                    >
                        <Clock className="w-3 h-3 mr-1" />
                        Preguntar luego
                    </Button>
                    <Button
                        onClick={() => handleClassify(current.id, 'IGNORE_PERMANENT')}
                        variant="ghost"
                        className="text-gray-500 hover:text-red-400 font-bold uppercase tracking-tighter text-[9px] h-8"
                    >
                        <ShieldAlert className="w-3 h-3 mr-1" />
                        Nunca preguntar
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
