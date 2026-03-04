'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import {
    FileText,
    ChevronDown,
    ChevronUp,
    Trash2,
    Download,
    Clock,
    Search,
    RefreshCcw,
    Upload,
    DownloadCloud,
    Tag,
    Plus
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { exportTreasuryMovementToExcel, downloadTreasuryTemplate } from '@/lib/excel-utils'
import { TreasuryManualEntry } from './treasury-manual-entry'

interface TreasuryHistoryProps {
    orgId: string
    typeFilter?: 'cobro' | 'pago'
    claseDocumentoFilter?: string[]
}

export function TreasuryHistory({ orgId, typeFilter, claseDocumentoFilter }: TreasuryHistoryProps) {
    const [movements, setMovements] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedMov, setExpandedMov] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [isUploading, setIsUploading] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isDeletingBulk, setIsDeletingBulk] = useState(false)
    const [isManualEntryOpen, setIsManualEntryOpen] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    async function fetchMovements() {
        setLoading(true)
        let query = supabase
            .from('movimientos_tesoreria')
            .select(`
                *,
                entidades (razon_social),
                instrumentos_pago (*),
                aplicaciones_pago (
                    monto_aplicado,
                    comprobante_id,
                    comprobantes (nro_factura, tipo)
                )
            `)
            .eq('organization_id', orgId)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })

        if (typeFilter) {
            query = query.eq('tipo', typeFilter)
        }

        if (claseDocumentoFilter && claseDocumentoFilter.length > 0) {
            query = query.in('clase_documento', claseDocumentoFilter)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching movements:', error)
            toast.error('Error al cargar el historial')
        } else {
            setMovements(data || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchMovements()
    }, [orgId, typeFilter])

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('context', typeFilter === 'cobro' ? 'receipt' : 'payment')

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            })

            const result = await response.json()

            if (response.ok) {
                toast.success(`Importación exitosa: ${result.count} movimientos cargados.`)
                fetchMovements()
            } else {
                toast.error(`Error en importación: ${result.error || 'Desconocido'}`)
            }
        } catch (error) {
            console.error('Error uploading treasury movements:', error)
            toast.error('Error de red al intentar importar.')
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const filteredMovements = movements.filter(m =>
        m.entidades?.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.nro_comprobante || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.observaciones?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredMovements.length && filteredMovements.length > 0) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(filteredMovements.map(m => m.id)))
        }
    }

    const deleteMovementLogic = async (movId: string) => {
        const mov = movements.find(m => m.id === movId)
        if (!mov) return

        if (mov.aplicaciones_pago && mov.aplicaciones_pago.length > 0) {
            for (const app of mov.aplicaciones_pago) {
                const { data: inv } = await supabase.from('comprobantes')
                    .select('monto_pendiente, monto_total, tipo')
                    .eq('id', app.comprobante_id)
                    .single()

                if (inv) {
                    const restoredMonto = inv.tipo === 'nota_credito'
                        ? Number(app.monto_aplicado)
                        : Number(inv.monto_pendiente) + Number(app.monto_aplicado)

                    const newEstado = restoredMonto >= inv.monto_total ? 'pendiente' : (restoredMonto <= 0.05 ? 'pagado' : 'parcial')

                    await supabase.from('comprobantes')
                        .update({ monto_pendiente: restoredMonto, estado: newEstado })
                        .eq('id', app.comprobante_id)
                }
            }
        }

        await supabase.from('aplicaciones_pago').delete().eq('movimiento_id', movId)
        await supabase.from('instrumentos_pago').delete().eq('movimiento_id', movId)
        await supabase.from('movimientos_tesoreria').delete().eq('id', movId)
    }

    const handleDelete = async (movId: string) => {
        if (!confirm('¿Estás seguro? Se restaurarán los saldos de facturas.')) return
        setLoading(true)
        try {
            await deleteMovementLogic(movId)
            toast.success('Movimiento eliminado')
            fetchMovements()
        } catch (err: any) {
            toast.error('Error: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleBulkDelete = async () => {
        if (!confirm(`¿Borrar ${selectedIds.size} seleccionados?`)) return
        setIsDeletingBulk(true)
        setLoading(true)
        for (const id of Array.from(selectedIds)) {
            await deleteMovementLogic(id)
        }
        setSelectedIds(new Set())
        toast.success(`Eliminados correctamente`)
        fetchMovements()
        setIsDeletingBulk(false)
        setLoading(false)
    }

    const title = typeFilter === 'cobro' ? 'Recibos' : 'Órdenes de Pago'
    const subtitle = typeFilter === 'cobro' ? 'Gestión de cobranzas a clientes.' : 'Gestión de pagos a proveedores.'

    return (
        <Card className="p-6 bg-gray-950 border-gray-800 text-white min-h-[500px]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-emerald-400" />
                        {title}
                    </h2>
                    <p className="text-sm text-gray-500">{subtitle}</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button
                        variant={selectedIds.size > 0 ? "destructive" : "outline"}
                        size="sm"
                        className={`gap-2 h-9 ${selectedIds.size > 0 ? '' : 'opacity-40 border-gray-700'}`}
                        onClick={handleBulkDelete}
                        disabled={isDeletingBulk || selectedIds.size === 0}
                    >
                        <Trash2 className="w-4 h-4" />
                        {isDeletingBulk ? '...' : (selectedIds.size > 0 ? `Borrar ${selectedIds.size}` : 'Borrar')}
                    </Button>

                    <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />

                    <Button variant="outline" size="sm" className="bg-gray-900 text-gray-300 gap-2 h-9" onClick={() => downloadTreasuryTemplate(typeFilter === 'cobro' ? 'cobro' : 'pago')}>
                        <DownloadCloud className="w-4 h-4" />
                        <span className="hidden sm:inline">Plantilla</span>
                    </Button>

                    <Button variant="outline" size="sm" className="border-emerald-500/30 text-emerald-400 gap-2 h-9" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">Importar</span>
                    </Button>

                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 h-9 font-bold px-4" onClick={() => setIsManualEntryOpen(true)}>
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">{typeFilter === 'cobro' ? 'Emitir Recibo' : 'Emitir OP'}</span>
                    </Button>

                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                        <Input placeholder="Buscar..." className="bg-gray-900 border-gray-800 pl-9 text-xs h-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/50">
                <div className="max-h-[500px] overflow-y-auto">
                    <Table>
                        <TableHeader className="bg-gray-900 sticky top-0 z-10">
                            <TableRow className="border-gray-800">
                                <TableHead className="w-[40px]"><input type="checkbox" checked={selectedIds.size === filteredMovements.length && filteredMovements.length > 0} onChange={toggleSelectAll} /></TableHead>
                                <TableHead className="text-gray-400 uppercase text-[10px]">Fecha</TableHead>
                                <TableHead className="text-gray-400 uppercase text-[10px]">Comprobante</TableHead>
                                <TableHead className="text-gray-400 uppercase text-[10px]">Socio</TableHead>
                                <TableHead className="text-gray-400 uppercase text-[10px]">Concepto</TableHead>
                                <TableHead className="text-gray-400 uppercase text-[10px] text-right">Total</TableHead>
                                <TableHead className="text-gray-400 uppercase text-[10px] text-center">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={7} className="h-32 text-center text-gray-500">Cargando...</TableCell></TableRow>
                            ) : filteredMovements.map(mov => (
                                <TableRow key={mov.id} className="border-gray-800 hover:bg-gray-800/30">
                                    <TableCell><input type="checkbox" checked={selectedIds.has(mov.id)} onChange={() => toggleSelect(mov.id)} /></TableCell>
                                    <TableCell className="font-mono text-xs">{new Date(mov.fecha).toLocaleDateString('es-AR')}</TableCell>
                                    <TableCell><Badge className="text-[9px] uppercase">{mov.nro_comprobante || 'S/N'}</Badge></TableCell>
                                    <TableCell className="font-bold text-gray-200 text-xs">{mov.entidades?.razon_social}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {mov.aplicaciones_pago?.map((app: any, idx: number) => (
                                                <Badge key={idx} variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400">
                                                    {app.comprobantes?.nro_factura}
                                                </Badge>
                                            )) || <span className="text-[10px] text-gray-500">{mov.concepto}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-white text-xs">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(mov.monto_total)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-400" onClick={() => exportTreasuryMovementToExcel(mov)}><Download className="w-4 h-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(mov.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <TreasuryManualEntry
                isOpen={isManualEntryOpen}
                onClose={() => setIsManualEntryOpen(false)}
                orgId={orgId}
                tipo={typeFilter === 'cobro' ? 'cobro' : 'pago'}
                onSuccess={() => { fetchMovements(); setIsManualEntryOpen(false); }}
            />
        </Card>
    )
}
