'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2, Loader2, Edit2, Calendar, Hash, Landmark, Search } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'

interface InvoiceImportPreviewModalProps {
    isOpen: boolean
    onClose: () => void
    data: any[]
    orgId: string
    type: 'factura_venta' | 'factura_compra'
    onConfirm: (validData: any[]) => Promise<void>
    onRowUpdate: (updatedRow: any) => void
    onSuccess?: () => void
}

export function InvoiceImportPreviewModal({
    isOpen,
    onClose,
    data,
    orgId,
    type,
    onConfirm,
    onRowUpdate,
    onSuccess
}: InvoiceImportPreviewModalProps) {
    const [isProcessing, setIsProcessing] = useState(false)
    const [editingRowId, setEditingRowId] = useState<string | null>(null)

    const validCount = data.filter((d: any) => d.isValid).length
    const errorCount = data.filter((d: any) => d.errors?.length > 0).length

    const handleConfirm = async () => {
        setIsProcessing(true)
        try {
            const validData = data.filter((d: any) => d.isValid)
            await onConfirm(validData)
            if (onSuccess) onSuccess()
            onClose()
        } catch (error) {
            console.error('[InvoicePreview] Confirm Error:', error)
        } finally {
            setIsProcessing(false)
        }
    }

    const validateRow = (row: any) => {
        const errors: string[] = []
        const warnings: string[] = []

        if (!row.fecha_emision) errors.push('Falta Fecha')
        // El número ahora es opcional pero se advierte si falta
        if (!row.nro_factura || row.nro_factura === '') {
            warnings.push('Sin Número')
        }
        if (isNaN(row.monto_total) || row.monto_total <= 0) errors.push('Monto Inválido')
        if (!row.entidad_id && !row.cuit_entidad && !row.razon_social_entidad) errors.push('Falta Entidad')

        row.errors = errors
        row.warnings = warnings
        row.isValid = errors.length === 0
        return row
    }

    const handleFieldChange = (row: any, field: string, value: any) => {
        const updatedRow = { ...row, [field]: value }
        onRowUpdate(validateRow(updatedRow))
    }


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-7xl bg-gray-900 border-gray-800 text-white max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2 font-bold uppercase tracking-tight">
                        {type === 'factura_venta' ? 'Pre-visualizar Ingresos' : 'Pre-visualizar Egresos'} ({data.length})
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className={`p-4 rounded-xl border-2 ${errorCount === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-gray-800/50 border-gray-700'}`}>
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                            <div>
                                <h3 className="text-sm font-bold text-emerald-400">{validCount} Filas Válidas</h3>
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Listas para importar</p>
                            </div>
                        </div>
                    </div>
                    <div className={`p-4 rounded-xl border-2 ${errorCount > 0 ? 'bg-red-500/10 border-red-500/50' : 'bg-gray-800/50 border-gray-700'}`}>
                        <div className="flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-400" />
                            <div>
                                <h3 className="text-sm font-bold text-red-400">{errorCount} Con Errores</h3>
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Requieren atención</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border border-gray-800 rounded-xl overflow-hidden flex-1 bg-gray-950/50">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            Previsualización de Importación
                        </DialogTitle>
                        <DialogDescription className="text-gray-500">
                            Revise los datos antes de confirmar. Las filas con advertencias se pueden importar.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[400px]">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-gray-900 border-b border-gray-800 sticky top-0 z-20">
                                <tr>
                                    <th className="px-4 py-3 font-bold text-gray-500 w-12 sticky top-0 z-20 bg-gray-900">#</th>
                                    <th className="px-4 py-3 font-bold text-gray-500 w-32 sticky top-0 z-20 bg-gray-900">Fecha</th>
                                    <th className="px-4 py-3 font-bold text-gray-500 min-w-[180px] sticky top-0 z-20 bg-gray-900">
                                        {type === 'factura_venta' ? 'Cliente' : 'Proveedor'} / CUIT
                                    </th>
                                    <th className="px-4 py-3 font-bold text-gray-500 min-w-[150px] sticky top-0 z-20 bg-gray-900">Concepto / Descripción</th>
                                    <th className="px-4 py-3 font-bold text-gray-500 w-32 sticky top-0 z-20 bg-gray-900">Número</th>
                                    <th className="px-4 py-3 font-bold text-gray-500 text-right w-28 sticky top-0 z-20 bg-gray-900">Monto</th>
                                    <th className="px-4 py-3 font-bold text-gray-500 text-center w-28 sticky top-0 z-20 bg-gray-900">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {data.map((row, idx) => (
                                    <tr key={row.id} className={`hover:bg-white/[0.02] transition-colors ${!row.isValid ? 'bg-red-500/5' : ''}`}>
                                        <td className="px-4 py-4 text-gray-600 font-mono">#{row.rowNum}</td>
                                        <td className="px-4 py-4">
                                            <div className="relative">
                                                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                                <Input
                                                    type="text"
                                                    value={row.fecha_emision}
                                                    onChange={(e) => handleFieldChange(row, 'fecha_emision', e.target.value)}
                                                    className="h-8 bg-gray-900 border-gray-800 pl-7 text-[10px]"
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <EntidadSelector
                                                row={row}
                                                orgId={orgId}
                                                type={type}
                                                onSelect={(s) => {
                                                    const updated = {
                                                        ...row,
                                                        entidad_id: s.id,
                                                        razon_social_entidad: s.razon_social,
                                                        cuit_entidad: s.cuit
                                                    }
                                                    onRowUpdate(validateRow(updated))
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <Input
                                                value={row.concepto || ''}
                                                placeholder="Ej: Honorarios..."
                                                onChange={(e) => handleFieldChange(row, 'concepto', e.target.value)}
                                                className="h-8 bg-gray-900 border-gray-800 text-[10px]"
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="relative">
                                                <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                                <Input
                                                    value={row.nro_factura}
                                                    onChange={(e) => handleFieldChange(row, 'nro_factura', e.target.value)}
                                                    className="h-7 bg-gray-900 border-gray-800 pl-7 font-mono text-[10px]"
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <Input
                                                type="number"
                                                value={row.monto_total}
                                                onChange={(e) => handleFieldChange(row, 'monto_total', parseFloat(e.target.value))}
                                                className="h-7 bg-gray-900 border-gray-800 text-right font-bold text-emerald-400 text-[10px]"
                                            />
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            {row.isValid ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] uppercase font-bold tracking-widest px-2">Válido</Badge>
                                                    {row.warnings?.map((warn: string, i: number) => (
                                                        <span key={i} className="text-[8px] bg-amber-500 text-black font-black px-1.5 rounded animate-pulse uppercase">
                                                            ⚠️ {warn}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    {row.errors?.map((err: string, i: number) => (
                                                        <span key={i} className="text-[8px] bg-red-500/10 text-red-500 font-bold px-1 rounded border border-red-500/10">{err}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </ScrollArea>
                </div>

                <DialogFooter className="mt-4 flex items-center justify-between">
                    <Button variant="ghost" onClick={onClose} disabled={isProcessing} className="text-gray-500">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={validCount === 0 || isProcessing}
                        className="bg-emerald-600 hover:bg-emerald-500 font-bold px-10"
                    >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Importar {validCount} Comprobantes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

interface EntidadSelectorProps {
    row: any
    orgId: string
    type: 'factura_venta' | 'factura_compra'
    onSelect: (s: any) => void
}

function EntidadSelector({ row, orgId, type, onSelect }: EntidadSelectorProps) {
    const [entidades, setEntidades] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [query, setQuery] = useState('')

    // Debounced search
    useEffect(() => {
        const timeout = setTimeout(async () => {
            if (query.length < 2) return
            setSearching(true)
            try {
                const supabase = createClient()
                const { data } = await supabase
                    .from('entidades')
                    .select('id, razon_social, cuit, categoria')
                    .eq('organization_id', orgId)
                    .or(`razon_social.ilike.%${query}%,cuit.ilike.%${query}%`)
                    .limit(8)
                if (data) setEntidades(data)
            } finally {
                setSearching(false)
            }
        }, 500)
        return () => clearTimeout(timeout)
    }, [query, orgId])

    return (
        <div className="space-y-2">
            <div className="relative group">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                <Input
                    placeholder={`Buscar ${type === 'factura_venta' ? 'cliente' : 'proveedor'}...`}
                    className="h-7 bg-gray-900 border-gray-800 pl-7 text-[10px]"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {searching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-500 animate-spin" />}
            </div>
            <Select
                value={row.entidad_id || ""}
                onValueChange={(v) => {
                    const s = entidades.find(e => e.id === v)
                    if (s) onSelect(s)
                }}
            >
                <SelectTrigger className="h-7 bg-gray-950 border-gray-800 text-[10px] w-full">
                    <SelectValue>
                        {row.razon_social_entidad || "Seleccionar..."}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800 text-white min-w-[200px]">
                    {entidades.length === 0 && !row.entidad_id && (
                        <div className="p-2 text-[10px] text-gray-400 italic">Escriba para buscar...</div>
                    )}
                    {entidades.map(e => (
                        <SelectItem key={e.id} value={e.id} className="text-[10px]">
                            <div className="flex flex-col">
                                <span className="font-bold">{e.razon_social}</span>
                                <span className="text-[9px] text-gray-500">{e.cuit}</span>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
