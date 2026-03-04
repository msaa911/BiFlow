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
    TrendingUp,
    TrendingDown
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { exportTreasuryMovementToExcel, downloadTreasuryTemplate } from '@/lib/excel-utils'

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
                    comprobantes (numero, tipo)
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
        (m.numero || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
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

        // 1. Revert all aplicaciones: restore monto_pendiente on each comprobante
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
                        .eq('organization_id', orgId)
                }
            }
        }

        // 2. Specialized Cleanup for NDB/NCB
        const isResidual = mov.clase_documento === 'NDB' || mov.clase_documento === 'NCB'
        if (isResidual && mov.aplicaciones_pago?.length > 0) {
            const voucherIds = mov.aplicaciones_pago.map((a: any) => a.comprobante_id)
            await supabase.from('comprobantes')
                .delete()
                .in('id', voucherIds)
                .in('tipo', ['ndb_bancaria', 'ncb_bancaria'])
                .eq('organization_id', orgId)
        }

        // 3. Bank Transaction Linkage Cleanup
        const { data: linkedTxs } = await supabase
            .from('transacciones')
            .select('*')
            .eq('movimiento_id', movId)
            .eq('organization_id', orgId)

        if (linkedTxs && linkedTxs.length > 0) {
            for (const tx of linkedTxs) {
                const movementMonto = Number(mov.monto_total || 0)
                const currentUsed = Number(tx.monto_usado || 0)
                const newMontoUsado = Math.max(0, currentUsed - movementMonto)
                const isNowOrphan = newMontoUsado <= 0.05

                await supabase.from('transacciones')
                    .update({
                        estado: isNowOrphan ? 'pendiente' : 'parcial',
                        movimiento_id: isNowOrphan ? null : tx.movimiento_id,
                        monto_usado: newMontoUsado
                    })
                    .eq('id', tx.id)
                    .eq('organization_id', orgId)
            }
        }

        // 4. Delete children
        await supabase.from('aplicaciones_pago').delete().eq('movimiento_id', movId)
        await supabase.from('instrumentos_pago').delete().eq('movimiento_id', movId)

        // 5. Final Delete
        const { error: delErr } = await supabase.from('movimientos_tesoreria')
            .delete()
            .eq('id', movId)
            .eq('organization_id', orgId)

        if (delErr) throw delErr
    }

    const handleDelete = async (movId: string) => {
        if (!confirm('¿Estás seguro de que quieres eliminar este movimiento? Los saldos de las facturas imputadas serán restaurados. Esta acción no se puede deshacer.')) return
        setLoading(true)
        try {
            await deleteMovementLogic(movId)
            toast.success('Movimiento eliminado correctamente.')
            fetchMovements()
        } catch (err: any) {
            console.error('Error deleting movement:', err)
            toast.error('Error al eliminar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleBulkDelete = async () => {
        if (!confirm(`¿Estás seguro de que quieres eliminar los ${selectedIds.size} movimientos seleccionados? Los saldos de las facturas imputadas serán restaurados.`)) return

        setIsDeletingBulk(true)
        setLoading(true)
        let deleted = 0
        let errors = 0

        try {
            for (const id of Array.from(selectedIds)) {
                try {
                    await deleteMovementLogic(id)
                    deleted++
                } catch (e) {
                    console.error(`Error deleting ${id}:`, e)
                    errors++
                }
            }
            setSelectedIds(new Set())
            toast.success(`Eliminación finalizada: ${deleted} exitosos, ${errors} fallidos.`)
            fetchMovements()
        } finally {
            setIsDeletingBulk(false)
            setLoading(false)
        }
    }

    const title = typeFilter === 'cobro' ? 'Recibos' : (typeFilter === 'pago' ? 'Órdenes de Pago' : 'Movimientos de Tesorería')
    const subtitle = typeFilter === 'cobro' ? 'Consulta y gestiona tus Recibos de cobro.' : (typeFilter === 'pago' ? 'Consulta y gestiona tus Órdenes de Pago.' : 'Consulta y gestiona tus Recibos y Órdenes de Pago.')

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
                        className={`gap-2 h-9 duration-200 ${selectedIds.size > 0 ? 'shadow-lg animate-in zoom-in-95' : 'opacity-40 border-dashed text-gray-500 bg-transparent hover:bg-transparent hover:text-gray-500 border-gray-700'}`}
                        onClick={handleBulkDelete}
                        disabled={isDeletingBulk || selectedIds.size === 0}
                        title={selectedIds.size === 0 ? "Marca las casillas a la izquierda de cada fila para activar este botón" : "Eliminar seleccionados"}
                    >
                        <Trash2 className="w-4 h-4" />
                        {isDeletingBulk ? 'Borrando...' : (selectedIds.size > 0 ? `Eliminar ${selectedIds.size}` : 'Selecciona para eliminar')}
                    </Button>

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileUpload}
                    />

                    <Button
                        variant="outline"
                        size="sm"
                        className="border-gray-800 bg-gray-900 text-gray-300 gap-2 h-9"
                        onClick={() => downloadTreasuryTemplate(typeFilter === 'cobro' ? 'cobro' : 'pago')}
                    >
                        <DownloadCloud className="w-4 h-4" />
                        <span className="hidden sm:inline">Plantilla</span>
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 gap-2 h-9"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                    >
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">{isUploading ? 'Cargando...' : 'Importar'}</span>
                    </Button>

                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                        <Input
                            placeholder="Buscar..."
                            className="bg-gray-900 border-gray-800 pl-9 text-xs h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" size="icon" onClick={fetchMovements} className="border-gray-800 bg-gray-900 h-9 w-9">
                        <RefreshCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/50">
                <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                    <Table>
                        <TableHeader className="bg-gray-900 sticky top-0 z-10">
                            <TableRow className="hover:bg-transparent border-gray-800">
                                <TableHead className="w-[40px]">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-700 bg-gray-900"
                                        checked={selectedIds.size === filteredMovements.length && filteredMovements.length > 0}
                                        onChange={toggleSelectAll}
                                    />
                                </TableHead>
                                <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Fecha</TableHead>
                                <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Comprobante</TableHead>
                                <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Razón Social</TableHead>
                                <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Concepto</TableHead>
                                <TableHead className="text-gray-400 font-bold uppercase text-[10px] text-right">Total</TableHead>
                                <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Detalle</TableHead>
                                <TableHead className="text-gray-400 font-bold uppercase text-[10px] text-center">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-32 text-center text-gray-500">Cargando...</TableCell>
                                </TableRow>
                            ) : filteredMovements.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-32 text-center text-gray-500">No se encontraron registros.</TableCell>
                                </TableRow>
                            ) : filteredMovements.map(mov => (
                                <>
                                    <TableRow key={mov.id} className={`border-gray-800 transition-colors ${selectedIds.has(mov.id) ? 'bg-emerald-500/5' : 'hover:bg-gray-800/30'}`}>
                                        <TableCell>
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-700 bg-gray-900"
                                                checked={selectedIds.has(mov.id)}
                                                onChange={() => toggleSelect(mov.id)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                            {new Date(mov.fecha).toLocaleDateString('es-AR')}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`uppercase text-[9px] font-bold ${mov.tipo === 'cobro' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                                                {mov.numero || 'S/N'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-bold text-gray-200 text-xs text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px]">
                                            {mov.entidades?.razon_social}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {mov.categoria ? (
                                                    <Badge variant="outline" className="text-[9px] uppercase font-bold border-emerald-500/30 text-emerald-400 bg-emerald-500/10 whitespace-nowrap w-fit">
                                                        {mov.categoria.replace('Aplica a ', '')}
                                                    </Badge>
                                                ) : mov.aplicaciones_pago && mov.aplicaciones_pago.length > 0 ? (
                                                    mov.aplicaciones_pago.map((app: any, idx: number) => {
                                                        const tipoLabel = app.comprobantes?.tipo === 'factura_venta' || app.comprobantes?.tipo === 'factura_compra' ? 'Factura' :
                                                            app.comprobantes?.tipo === 'nota_credito' ? 'N. Crédito' : 'N. Débito';
                                                        return (
                                                            <Badge key={idx} variant="outline" className="text-[9px] uppercase font-bold border-emerald-500/30 text-emerald-400 bg-emerald-500/10 whitespace-nowrap w-fit">
                                                                {tipoLabel} {app.comprobantes?.numero}
                                                            </Badge>
                                                        );
                                                    })
                                                ) : (
                                                    <Badge variant="outline" className="text-[9px] uppercase font-bold border-gray-700 bg-gray-800 text-gray-400">
                                                        {mov.observaciones || 'S/C'}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-white text-xs">
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(mov.monto_total)}
                                        </TableCell>
                                        <TableCell>
                                            <button
                                                onClick={() => setExpandedMov(expandedMov === mov.id ? null : mov.id)}
                                                className="text-[10px] uppercase font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                                            >
                                                {expandedMov === mov.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                {expandedMov === mov.id ? 'Cerrar' : 'Ver Detalle'}
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                                                    title="Exportar a Excel"
                                                    onClick={() => {
                                                        try {
                                                            exportTreasuryMovementToExcel(mov)
                                                            toast.success('Excel generado')
                                                        } catch (e) {
                                                            toast.error('Error al exportar')
                                                        }
                                                    }}
                                                >
                                                    <Download className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-gray-500 hover:text-red-500 hover:bg-red-500/10"
                                                    onClick={() => handleDelete(mov.id)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    {expandedMov === mov.id && (
                                        <TableRow className="bg-gray-900/80 border-gray-800">
                                            <TableCell colSpan={8} className="p-0">
                                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    {/* Instrumentos */}
                                                    <div>
                                                        <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-3 tracking-widest">Valores / Instrumentos</h4>
                                                        <div className="space-y-2">
                                                            {mov.instrumentos_pago.map((ins: any) => (
                                                                <div key={ins.id} className="flex justify-between items-center p-3 bg-gray-950 border border-gray-800 rounded-lg text-xs">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
                                                                            <FileText className="w-4 h-4 text-emerald-500" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="font-bold text-gray-300 uppercase">{ins.metodo.replace('_', ' ')}</p>
                                                                            <p className="text-[10px] text-gray-500">Disp: {new Date(ins.fecha_disponibilidad).toLocaleDateString('es-AR')} {ins.referencia ? ` | Ref: ${ins.referencia}` : ''}</p>
                                                                        </div>
                                                                    </div>
                                                                    <p className="font-mono font-bold text-emerald-400">
                                                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(ins.monto)}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Aplicaciones o Desglose */}
                                                    <div>
                                                        {mov.metadata?.desglose ? (
                                                            <>
                                                                <h4 className="text-[10px] uppercase font-bold text-amber-500 mb-3 tracking-widest flex items-center gap-2">
                                                                    <Tag className="w-3 h-3" /> Desglose Administrativo (Split)
                                                                </h4>
                                                                <div className="space-y-2">
                                                                    {mov.metadata.desglose.map((item: any, idx: number) => (
                                                                        <div key={idx} className="flex justify-between items-center p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg text-xs">
                                                                            <div className="flex items-center gap-2">
                                                                                <Badge variant="outline" className={`text-[8px] uppercase ${item.tipo === 'activo' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
                                                                                    {item.tipo}
                                                                                </Badge>
                                                                                <p className="font-bold text-gray-300">{item.concepto}</p>
                                                                            </div>
                                                                            <p className="font-mono font-bold text-white">
                                                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.monto)}
                                                                            </p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-3 tracking-widest">Facturas Canceladas / Imputadas</h4>
                                                                <div className="space-y-2">
                                                                    {mov.aplicaciones_pago.length > 0 ? (
                                                                        mov.aplicaciones_pago.map((app: any, idx: number) => (
                                                                            <div key={idx} className="flex justify-between items-center p-3 bg-gray-950 border border-gray-800 rounded-lg text-xs">
                                                                                <div>
                                                                                    <p className="font-bold text-gray-300">{app.comprobantes?.numero}</p>
                                                                                    <p className="text-[10px] text-gray-500 uppercase">{app.comprobantes?.tipo.replace('_', ' ')}</p>
                                                                                </div>
                                                                                <p className="font-mono font-bold text-blue-400">
                                                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(app.monto_aplicado)}
                                                                                </p>
                                                                            </div>
                                                                        ))
                                                                    ) : (
                                                                        <p className="text-[10px] text-gray-600 italic">Movimiento directo sin imputación de facturas.</p>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </Card>
    )
}
