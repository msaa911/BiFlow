'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import {
    FileText,
    ChevronDown,
    ChevronUp,
    Trash2,
    Clock,
    Search,
    RefreshCcw,
    Tag,
    AlertCircle,
    Landmark
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface BankNotesHistoryProps {
    orgId: string
    accountId?: string
    bankAccounts?: any[]
    onRefresh?: () => void
}

export function BankNotesHistory({ orgId, accountId, bankAccounts = [], onRefresh }: BankNotesHistoryProps) {
    const [notes, setNotes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedNote, setExpandedNote] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(20)
    const supabase = createClient()

    // Build a map of accountId -> bank name
    const bankAccountMap = Object.fromEntries(
        bankAccounts.map(acc => [acc.id, acc.banco_nombre])
    )

    async function fetchNotes() {
        setLoading(true)
        try {
            // Query comprobantes directly for bank notes
            let query = supabase
                .from('comprobantes')
                .select(`
                    *,
                    entidades (razon_social),
                    transacciones!comprobante_id (*)
                `)
                .eq('organization_id', orgId)
                .in('tipo', ['ndb_bancaria', 'ncb_bancaria'])

            if (accountId && accountId !== 'all') {
                query = query.eq('metadata->>cuenta_id', accountId)
            }

            const { data, error } = await query.order('fecha_emision', { ascending: false })

            if (error) throw error

            // Post-processing to ensure we have transaction data even if link is broken in DB
            // but exists in metadata
            const processedNotes = await Promise.all((data || []).map(async (note) => {
                if ((!note.transacciones || note.transacciones.length === 0) && note.metadata?.transaccion_id) {
                    try {
                        const { data: txData } = await supabase
                            .from('transacciones')
                            .select('*')
                            .eq('id', note.metadata.transaccion_id)
                            .single()

                        if (txData) {
                            return { ...note, transacciones: [txData] }
                        }
                    } catch (e) {
                        console.warn(`Could not recover tx for note ${note.id}`, e)
                    }
                }
                return note
            }))

            setNotes(processedNotes)
        } catch (error: any) {
            console.error('Error fetching bank notes:', error)
            toast.error('Error al cargar historial de notas')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchNotes()
    }, [orgId])

    const filteredNotes = notes.filter(n =>
        n.entidades?.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.nro_factura || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.transacciones?.[0]?.descripcion?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalPages = Math.ceil(filteredNotes.length / itemsPerPage)
    const paginatedNotes = filteredNotes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

    const handleDelete = async (note: any) => {
        if (!confirm('¿Seguro que desea eliminar esta nota bancaria? La transacción bancaria asociada volverá a estar pendiente.')) return

        setLoading(true)
        try {
            // 1. Reset the linked transaction first if it exists
            const txId = note.metadata?.bank_transaction_id || note.transacciones?.[0]?.id

            if (txId) {
                const { error: txErr } = await supabase
                    .from('transacciones')
                    .update({
                        comprobante_id: null,
                        estado: 'pendiente',
                        metadata: {
                            ...(note.transacciones?.[0]?.metadata || {}),
                            reverted_at: new Date().toISOString(),
                            reversal_source: 'bank_note_direct_delete'
                        }
                    })
                    .eq('id', txId)

                if (txErr) throw txErr
            }

            // 2. Delete the note
            const { error: delErr } = await supabase
                .from('comprobantes')
                .delete()
                .eq('id', note.id)

            if (delErr) throw delErr

            toast.success('Nota bancaria eliminada y transacción revertida')
            fetchNotes()
            if (onRefresh) onRefresh()
        } catch (error: any) {
            console.error('Error deleting bank note:', error)
            toast.error('Error al eliminar la nota: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    return (
        <Card className="p-0 bg-gray-950 border-gray-800 text-white min-h-[400px] overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-900/40">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Clock className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-tighter">Historial de Notas Bancarias</h3>
                        <p className="text-[10px] text-gray-500">Documentos generados directamente desde el extracto.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-gray-500" />
                        <Input
                            placeholder="Buscar por entidad o concepto..."
                            className="bg-gray-900 border-gray-800 pl-9 text-[11px] h-8 focus:ring-emerald-500/20"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-white" onClick={fetchNotes} disabled={loading}>
                        <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-emerald-500/20 hover:scrollbar-thumb-emerald-500/40 scrollbar-track-transparent">
                    <table className="w-full text-left text-xs border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-gray-800 text-[11px] font-bold text-gray-400 sticky top-0 z-10">
                                <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800 text-left">Fecha</th>
                                <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800 text-left">Nro Nota</th>
                                <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800 text-left">Banco</th>
                                <th className="px-6 py-4 sticky top-0 z-20 bg-gray-800 text-left">Entidad / Concepto</th>
                                <th className="px-6 py-4 text-right sticky top-0 z-20 bg-gray-800">Monto</th>
                                <th className="px-6 py-4 text-center sticky top-0 z-20 bg-gray-800">Estado</th>
                                <th className="px-6 py-4 text-center sticky top-0 z-20 bg-gray-800">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                            {loading && notes.length === 0 ? (
                                <tr><td colSpan={7} className="h-32 text-center text-gray-500 italic">Cargando notas bancarias...</td></tr>
                            ) : paginatedNotes.length === 0 ? (
                                <tr><td colSpan={7} className="h-32 text-center text-gray-500 italic">No se encontraron notas bancarias directas.</td></tr>
                            ) : (
                                paginatedNotes.map(note => {
                                    const isExpanded = expandedNote === note.id
                                    const tx = note.transacciones?.[0]
                                    const bankName = bankAccountMap[note.metadata?.cuenta_id] || null
                                    return (
                                        <Fragment key={note.id}>
                                            <tr className={`hover:bg-emerald-500/[0.02] transition-colors cursor-pointer border-b border-gray-800/50 ${isExpanded ? 'bg-emerald-500/5' : ''}`} onClick={() => setExpandedNote(isExpanded ? null : note.id)}>
                                                <td className="px-6 py-3 font-mono text-gray-400">{formatDate(note.fecha_emision)}</td>
                                                <td className="px-6 py-3 font-bold text-emerald-400">{note.nro_factura}</td>
                                                <td className="px-6 py-3">
                                                    {bankName ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <Landmark className="w-3 h-3 text-blue-400 shrink-0" />
                                                            <span className="text-[11px] font-bold text-blue-300">{bankName}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-gray-600">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-white text-[11px] uppercase tracking-tight">
                                                            {note.concepto || note.metadata?.categoria_principal || tx?.categoria || 'Sin concepto'}
                                                        </span>
                                                        <div className="flex flex-col mt-0.5">
                                                            <span className="text-[10px] text-emerald-400 font-medium italic">
                                                                {note.entidades?.razon_social || 'Entidad no identificada'}
                                                            </span>
                                                            <span className="text-[9px] text-gray-500 truncate max-w-[250px]">
                                                                {tx?.descripcion || note.metadata?.original_desc || note.metadata?.bank_desc || 'Nota bancaria de extracto'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={`px-6 py-3 text-right font-black tabular-nums text-xs ${note.tipo === 'ndb_bancaria' ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(note.monto_total)}
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] uppercase font-black tracking-tighter">
                                                        Conciliado
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-full"
                                                        onClick={() => handleDelete(note)}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="bg-gray-950/80 border-gray-800/50">
                                                    <td colSpan={7} className="p-6">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-200">
                                                            <div className="space-y-4">
                                                                <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                                                                    <Tag className="w-3 h-3" /> Origen Bancario
                                                                </div>
                                                                <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800 space-y-2">
                                                                    {bankName && (
                                                                        <div className="flex justify-between">
                                                                            <span className="text-gray-500">Banco:</span>
                                                                            <span className="flex items-center gap-1.5 text-blue-300 font-bold">
                                                                                <Landmark className="w-3 h-3" />{bankName}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex justify-between">
                                                                        <span className="text-gray-500">Transacción:</span>
                                                                        <span className="text-white font-medium">{tx?.descripcion || note.metadata?.original_desc || 'ID: ' + note.metadata?.transaccion_id?.slice(0, 8)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="text-gray-500">Fecha Banco:</span>
                                                                        <span className="text-white">{tx?.fecha ? formatDate(tx.fecha) : formatDate(note.fecha_emision)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="text-gray-500">Categoría:</span>
                                                                        <span className="px-2 py-0.5 bg-gray-800 rounded text-[9px] text-emerald-400 font-bold">{tx?.categoria || note.concepto || 'S/D'}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-4">
                                                                <div className="flex items-center gap-2 text-[10px] font-black text-blue-500 uppercase tracking-widest">
                                                                    <FileText className="w-3 h-3" /> Detalle Imputación
                                                                </div>
                                                                <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-800 space-y-2 text-gray-400 text-[10px]">
                                                                    <p>ID de Documento: <span className="text-white font-mono">{note.id}</span></p>
                                                                    {note.metadata?.desglose ? (
                                                                        <div className="mt-2 pt-2 border-t border-gray-800">
                                                                            <p className="font-bold text-gray-500 uppercase mb-1">Desglose:</p>
                                                                            {note.metadata.desglose.map((item: any, idx: number) => (
                                                                                <div key={idx} className="flex justify-between items-center text-[10px]">
                                                                                    <span className="text-gray-300 font-bold uppercase">{item.concepto}</span>
                                                                                    <span className="font-mono text-white">
                                                                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.monto)}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex justify-between">
                                                                            <span className="text-gray-500">Concepto Único:</span>
                                                                            <span className="text-white">{note.metadata?.categoria_principal || 'S/D'}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginación */}
                <div className="p-4 border-t border-gray-800 bg-gray-900/40 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-[11px] text-gray-500 font-medium flex items-center gap-4">
                        <span>
                            Mostrando <span className="text-gray-300">{filteredNotes.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> - <span className="text-gray-300">{Math.min(currentPage * itemsPerPage, filteredNotes.length)}</span> de <span className="text-gray-300">{filteredNotes.length}</span> registros
                        </span>

                        <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
                            <span className="text-gray-600">Ver:</span>
                            {[20, 25, 50, 100].map(size => (
                                <button
                                    key={size}
                                    onClick={() => {
                                        setItemsPerPage(size)
                                        setCurrentPage(1)
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${itemsPerPage === size ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-600 hover:text-gray-400'}`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center bg-gray-950 border border-gray-800 rounded-lg p-1 gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-gray-800 text-gray-400"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronDown className="w-4 h-4 rotate-90" />
                            </Button>

                            <div className="flex items-center px-4 gap-2 border-x border-gray-800 px-6">
                                <span className="text-xs font-bold text-emerald-500">{currentPage}</span>
                                <span className="text-xs text-gray-600">/</span>
                                <span className="text-xs text-gray-400 font-medium">{totalPages}</span>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 hover:bg-gray-800 text-gray-400"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronDown className="w-4 h-4 -rotate-90" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}
