'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle2, Info, Loader2, Edit2, Check, X, MapPin } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HierarchicalLocationSelector } from './location-selector'
import { isValidCUIT } from '@/lib/excel-utils'

interface ImportPreviewModalProps {
    isOpen: boolean
    onClose: () => void
    data: any[]
    category: 'cliente' | 'proveedor' | 'ambos'
    onConfirm: (validData: any[]) => Promise<void>
    onRowUpdate: (updatedRow: any) => void
}

export function ImportPreviewModal({ isOpen, onClose, data, category, onConfirm, onRowUpdate }: ImportPreviewModalProps) {
    const [isProcessing, setIsProcessing] = useState(false)
    const [editingRowId, setEditingRowId] = useState<string | null>(null)

    const validCount = data.filter(d => d.isValid).length
    const errorCount = data.filter(d => d.errors?.length > 0).length
    const warningCount = data.filter(d => d.isValid && d.warnings?.length > 0).length

    const handleConfirm = async () => {
        setIsProcessing(true)
        try {
            const validData = data.filter(d => d.isValid)
            await onConfirm(validData)
            onClose()
        } catch (error) {
            console.error('Error confirming import:', error)
        } finally {
            setIsProcessing(false)
        }
    }

    const validateFieldChange = (row: any, field: string, value: string) => {
        const updatedRow = { ...row, [field]: value }

        // Re-validate row
        const newErrors: string[] = []
        if (!updatedRow.razon_social?.trim()) newErrors.push('Falta Razón Social')

        const cleanCuit = (updatedRow.cuit || '').replace(/[^\d]/g, '')
        if (!cleanCuit) newErrors.push('Falta CUIT')
        else if (cleanCuit.length !== 11) newErrors.push('CUIT debe tener 11 dígitos')

        updatedRow.errors = newErrors
        updatedRow.isValid = newErrors.length === 0

        onRowUpdate(updatedRow)
    }

    const handleLocationChange = (row: any, updates: any) => {
        const updatedRow = {
            ...row,
            ...updates,
            warnings: [],
            isValid: row.errors?.length === 0 // Still valid if no errors
        }
        onRowUpdate(updatedRow)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl bg-gray-900 border-gray-800 text-white max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2 font-bold">
                        Previsualización de Importación ({category === 'cliente' ? 'Clientes' : 'Proveedores'})
                    </DialogTitle>
                </DialogHeader>

                <div className="flex gap-4 mb-4">
                    <div className="flex-1 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <div>
                            <p className="text-sm font-bold text-emerald-400">{validCount} Listos</p>
                            <p className="text-xs text-emerald-500/70">Para importar ahora</p>
                        </div>
                    </div>
                    {warningCount > 0 && (
                        <div className="flex-1 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3">
                            <Info className="h-5 w-5 text-amber-500" />
                            <div>
                                <p className="text-sm font-bold text-amber-400">{warningCount} Advertencias</p>
                                <p className="text-xs text-amber-500/70">Ubicación a normalizar</p>
                            </div>
                        </div>
                    )}
                    {errorCount > 0 && (
                        <div className="flex-1 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <div>
                                <p className="text-sm font-bold text-red-400">{errorCount} Errores</p>
                                <p className="text-xs text-red-500/70">Requieren corrección</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="border border-gray-800 rounded-xl overflow-hidden flex-1 bg-gray-950/50">
                    <ScrollArea className="h-[450px]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-900 text-gray-500 sticky top-0 z-20 border-b border-gray-800">
                                <tr>
                                    <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-wider w-16">Fila</th>
                                    <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-wider">Razón Social</th>
                                    <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-wider w-40">CUIT</th>
                                    <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-wider">Ubicación</th>
                                    <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-wider text-center w-40">Estado / Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {data.map((row) => (
                                    <tr key={row.id} className={`
                                        transition-colors
                                        ${row.isValid ? 'hover:bg-emerald-500/[0.02]' : 'bg-red-500/[0.03] hover:bg-red-500/[0.05]'} 
                                        ${editingRowId === row.id ? 'bg-blue-500/[0.05]' : ''}
                                    `}>
                                        <td className="px-4 py-4 text-gray-500 tabular-nums font-mono">#{row.rowNum}</td>

                                        <td className="px-4 py-4">
                                            {editingRowId === row.id ? (
                                                <Input
                                                    value={row.razon_social}
                                                    placeholder="Ej: ACME S.A."
                                                    onChange={(e) => validateFieldChange(row, 'razon_social', e.target.value)}
                                                    className="bg-gray-900 border-gray-700 h-8 text-sm focus:border-emerald-500"
                                                />
                                            ) : (
                                                <span className={`font-medium ${!row.razon_social ? 'text-red-400 italic' : 'text-white'}`}>
                                                    {row.razon_social || 'Sin nombre'}
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-4 py-4">
                                            {editingRowId === row.id ? (
                                                <Input
                                                    value={row.cuit}
                                                    placeholder="20123456789"
                                                    onChange={(e) => validateFieldChange(row, 'cuit', e.target.value)}
                                                    className="bg-gray-900 border-gray-700 h-8 text-sm font-mono focus:border-emerald-500"
                                                />
                                            ) : (
                                                <span className="font-mono text-gray-400">{row.cuit}</span>
                                            )}
                                        </td>

                                        <td className="px-4 py-4 text-gray-400">
                                            {editingRowId === row.id ? (
                                                <div className="bg-gray-900 p-4 rounded-xl border border-blue-500/30 w-80 shadow-2xl relative z-30">
                                                    <div className="flex items-center gap-2 mb-3 text-blue-400">
                                                        <MapPin className="h-4 w-4" />
                                                        <span className="text-xs font-bold uppercase">Corregir Ubicación</span>
                                                    </div>
                                                    <HierarchicalLocationSelector
                                                        formData={{
                                                            provincia: row.provincia,
                                                            departamento: row.departamento,
                                                            localidad: row.localidad
                                                        }}
                                                        onChange={(updates) => handleLocationChange(row, updates)}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="text-gray-300">{row.localidad || <span className="text-gray-600 italic">No especificado</span>}</span>
                                                    {row.provincia && (
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-tighter">
                                                            {row.departamento && `${row.departamento}, `}{row.provincia}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        <td className="px-4 py-4">
                                            <div className="flex flex-col items-center gap-1.5">
                                                {editingRowId === row.id ? (
                                                    <Button
                                                        size="sm"
                                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-8 text-xs"
                                                        onClick={() => setEditingRowId(null)}
                                                    >
                                                        <Check className="h-3.5 w-3.5 mr-1" /> FINALIZAR
                                                    </Button>
                                                ) : row.isValid ? (
                                                    <>
                                                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-bold px-2 py-0.5">
                                                            OK
                                                        </Badge>
                                                        {(row.warnings?.length > 0 || !row.localidad) && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 text-[10px] text-amber-500 hover:text-amber-400 px-2 mt-1 font-bold group"
                                                                onClick={() => setEditingRowId(row.id)}
                                                            >
                                                                <Edit2 className="h-3 w-3 mr-1 transition-transform group-hover:scale-110" /> EDITAR
                                                            </Button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-1">
                                                        {row.errors.map((err: string, i: number) => (
                                                            <span key={i} className="text-[10px] text-red-400 font-bold leading-none bg-red-400/5 px-1.5 py-0.5 rounded">
                                                                {err}
                                                            </span>
                                                        ))}
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            className="h-7 text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 mt-1 font-bold rounded-lg border border-red-400/20"
                                                            onClick={() => setEditingRowId(row.id)}
                                                        >
                                                            <Edit2 className="h-3 w-3 mr-1" /> CORREGIR
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </ScrollArea>
                </div>

                <DialogFooter className="mt-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" onClick={onClose} className="text-gray-500 hover:text-white hover:bg-white/5 px-6">
                            Cancelar
                        </Button>
                    </div>
                    <Button
                        onClick={handleConfirm}
                        disabled={validCount === 0 || isProcessing}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 h-10 shadow-lg shadow-emerald-500/10"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importando...
                            </>
                        ) : (
                            `Confirmar Importación (${validCount})`
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
