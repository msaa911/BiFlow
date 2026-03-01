'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Clock, Calendar, User, ArrowRight, CheckCircle2, AlertCircle, Landmark } from 'lucide-react'

interface HistoryEntry {
    id: string
    estado_anterior: string
    estado_nuevo: string
    created_at: string
    usuario_id: string
    motivo: string
    metadata: any
}

interface CheckHistoryModalProps {
    isOpen: boolean
    onClose: () => void
    checkId: string | null
    checkNumero: string | null
}

export function CheckHistoryModal({ isOpen, onClose, checkId, checkNumero }: CheckHistoryModalProps) {
    const [history, setHistory] = useState<HistoryEntry[]>([])
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        if (isOpen && checkId) {
            fetchHistory()
        }
    }, [isOpen, checkId])

    const fetchHistory = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('instrumentos_pago_historial')
                .select('*')
                .eq('instrumento_id', checkId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setHistory(data || [])
        } catch (error) {
            console.error('Error fetching check history:', error)
        } finally {
            setLoading(false)
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pendiente': return <Clock className="w-4 h-4 text-gray-400" />
            case 'depositado': return <Landmark className="w-4 h-4 text-blue-400" />
            case 'acreditado': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            case 'rechazado': return <AlertCircle className="w-4 h-4 text-red-400" />
            default: return <Clock className="w-4 h-4 text-gray-400" />
        }
    }

    const getStatusBadge = (status: string) => {
        const variants: Record<string, string> = {
            pendiente: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
            depositado: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            acreditado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            rechazado: 'bg-red-500/10 text-red-400 border-red-500/20',
            endosado: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
            anulado: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
        }
        return (
            <Badge variant="outline" className={variants[status] || variants.pendiente}>
                {status.toUpperCase()}
            </Badge>
        )
    }

    const formatDate = (dateStr: string) => {
        try {
            return new Intl.DateTimeFormat('es-AR', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date(dateStr))
        } catch (e) {
            return dateStr
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] bg-gray-950 border-gray-800 text-white p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-6 bg-gray-900/50 border-b border-gray-800">
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
                        <Clock className="w-5 h-5 text-blue-400" />
                        Historial del Cheque #{checkNumero}
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-400 text-sm italic">Rastreando movimientos...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-12">
                            <Clock className="w-12 h-12 text-gray-800 mx-auto mb-4" />
                            <p className="text-gray-400">No se encontraron registros previos para este valor.</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-[400px] pr-4">
                            <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-blue-500/50 before:via-gray-800 before:to-transparent">
                                {history.map((entry, index) => (
                                    <div key={entry.id} className="relative flex items-start gap-6 animate-in fade-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${index * 50}ms` }}>
                                        <div className="absolute left-0 mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 border border-gray-800 shadow-xl z-10 transition-transform hover:scale-110">
                                            {getStatusIcon(entry.estado_nuevo)}
                                        </div>

                                        <div className="ml-12 flex-1 pt-1">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    {entry.estado_anterior && (
                                                        <>
                                                            {getStatusBadge(entry.estado_anterior)}
                                                            <ArrowRight className="w-3 h-3 text-gray-600" />
                                                        </>
                                                    )}
                                                    {getStatusBadge(entry.estado_nuevo)}
                                                </div>
                                                <span className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {formatDate(entry.created_at)}
                                                </span>
                                            </div>

                                            <div className="bg-gray-900/40 border border-gray-800/50 rounded-xl p-3 hover:bg-gray-900/60 transition-colors">
                                                {entry.motivo && <p className="text-sm text-gray-300 mb-2 font-medium">{entry.motivo}</p>}
                                                <div className="flex items-center gap-4 text-[11px] text-gray-500">
                                                    <span className="flex items-center gap-1.5 bg-gray-800/50 px-2 py-0.5 rounded-full uppercase tracking-tighter font-bold">
                                                        <User className="w-3 h-3" />
                                                        {entry.usuario_id === 'system' || !entry.usuario_id ? 'SISTEMA' : 'OPERADOR'}
                                                    </span>
                                                    {entry.metadata?.cuenta_destino && (
                                                        <span className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
                                                            <Landmark className="w-3 h-3" />
                                                            Cta: {entry.metadata.cuenta_destino}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </div>

                <div className="p-4 bg-gray-950/50 border-t border-gray-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-all active:scale-95 shadow-lg"
                    >
                        Cerrar Registro
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
