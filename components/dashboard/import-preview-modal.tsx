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
    const [editingRowBackup, setEditingRowBackup] = useState<any | null>(null)
    const [showLocationPanel, setShowLocationPanel] = useState(false)

    const validCount = data.filter((d: any) => d.isValid).length
    const errorCount = data.filter((d: any) => d.errors?.length > 0).length
    const warningCount = data.filter((d: any) => d.isValid && d.warnings?.length > 0).length

    const handleConfirm = async () => {
        console.log('[PreviewModal] Confirm button CLICKED. Records to send:', data.filter(d => d.isValid).length)
        setIsProcessing(true)
        try {
            const validData = data.filter((d: any) => d.isValid)
            console.log('[PreviewModal] Calling parent onConfirm function...')
            await onConfirm(validData)
            console.log('[PreviewModal] Parent onConfirm SUCCESS. Closing modal.')
            onClose()
        } catch (error) {
            console.error('[PreviewModal] handleConfirm ERROR:', error)
        } finally {
            setIsProcessing(false)
            console.log('[PreviewModal] handleConfirm flow complete.')
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
            // Clear warnings only if we are actually editing/saving
        }
        onRowUpdate(updatedRow)
    }

    const startEditing = (row: any) => {
        setEditingRowBackup({ ...row })
        setEditingRowId(row.id)
        // Auto-show panel only if there's a location warning
        setShowLocationPanel(row.warnings?.length > 0 || !row.localidad)
    }

    const cancelEditing = (rowId: string) => {
        if (editingRowBackup && editingRowBackup.id === rowId) {
            onRowUpdate(editingRowBackup)
        }
        setEditingRowId(null)
        setEditingRowBackup(null)
        setShowLocationPanel(false)
    }

    const finishEditing = (row: any) => {
        // Clear all warnings once corrected
        const cleanRow = { ...row, warnings: [] }
        onRowUpdate(cleanRow)
        setEditingRowId(null)
        setEditingRowBackup(null)
        setShowLocationPanel(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl bg-gray-900 border-gray-800 text-white max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2 font-bold">
                        Previsualización de Importación ({category === 'cliente' ? 'Clientes' : 'Proveedores'})
                    </DialogTitle>
                </DialogHeader>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Ready Card */}
                    <div className={`p-4 rounded-xl border-2 transition-all ${errorCount === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-gray-800/50 border-gray-700'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${errorCount === 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}>
                                <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className={`text-sm font-bold ${errorCount === 0 ? 'text-emerald-400' : 'text-gray-400'}`}>{validCount} Listos</h3>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Para importar ahora</p>
                            </div>
                        </div>
                    </div>

                    {/* Errors Card */}
                    <div className={`p-4 rounded-xl border-2 transition-all ${errorCount > 0 ? 'bg-red-500/10 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-gray-800/50 border-gray-700'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${errorCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400'}`}>
                                <AlertCircle className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className={`text-sm font-bold ${errorCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>{errorCount} Errores</h3>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Requieren corrección</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border border-gray-800 rounded-xl overflow-hidden flex-1 bg-gray-950/50">
                    <ScrollArea className="h-[450px]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-900 text-gray-500 sticky top-0 z-20 border-b border-gray-800">
                                <tr>
                                    <th className="px-4 py-4 font-bold text-[10px] w-16 sticky top-0 z-20 bg-gray-900">Fila</th>
                                    <th className="px-4 py-4 font-bold text-[10px] min-w-[200px] sticky top-0 z-20 bg-gray-900">Razón Social</th>
                                    <th className="px-4 py-4 font-bold text-[10px] w-32 sticky top-0 z-20 bg-gray-900">CUIT</th>
                                    <th className="px-4 py-4 font-bold text-[10px] min-w-[150px] sticky top-0 z-20 bg-gray-900">Ubicación</th>
                                    <th className="px-4 py-4 font-bold text-[10px] w-48 sticky top-0 z-20 bg-gray-900">CBU / CVU</th>
                                    <th className="px-4 py-4 font-bold text-[10px] w-40 sticky top-0 z-20 bg-gray-900">Email</th>
                                    <th className="px-4 py-4 font-bold text-[10px] w-32 sticky top-0 z-20 bg-gray-900">Teléfono</th>
                                    <th className="px-4 py-4 font-bold text-[10px] text-center w-32 sticky top-0 z-20 bg-gray-900">Acción</th>
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
                                            <Input
                                                value={row.razon_social}
                                                placeholder="Ej: ACME S.A."
                                                onChange={(e) => validateFieldChange(row, 'razon_social', e.target.value)}
                                                className={`bg-gray-900 border-gray-700 h-8 text-sm focus:border-emerald-500 ${!row.razon_social ? 'border-red-500/50' : ''}`}
                                            />
                                        </td>

                                        <td className="px-4 py-4">
                                            <Input
                                                value={row.cuit}
                                                placeholder="20123456789"
                                                onChange={(e) => validateFieldChange(row, 'cuit', e.target.value)}
                                                className={`bg-gray-900 border-gray-700 h-8 text-sm font-mono focus:border-emerald-500 ${row.errors?.some((e: string) => e.includes('CUIT')) ? 'border-red-500/50' : ''}`}
                                            />
                                        </td>

                                        <td className="px-4 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-white text-sm font-medium">{row.localidad || 'S/L'}</span>
                                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">{row.provincia || 'S/P'}</span>
                                            </div>
                                            {editingRowId === row.id && (
                                                <div className="flex flex-col gap-2 mt-2">
                                                    {!showLocationPanel ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 text-[10px] text-blue-400 border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 font-bold"
                                                            onClick={() => setShowLocationPanel(true)}
                                                        >
                                                            <MapPin className="h-3 w-3 mr-1" /> EDITAR
                                                        </Button>
                                                    ) : (
                                                        <div className="absolute left-0 top-full mt-2 bg-gray-900 p-5 rounded-2xl border border-blue-500/40 w-[350px] shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                                            <HierarchicalLocationSelector
                                                                formData={{
                                                                    provincia: row.provincia,
                                                                    departamento: row.departamento,
                                                                    localidad: row.localidad
                                                                }}
                                                                onChange={(updates) => handleLocationChange(row, updates)}
                                                            />
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-xs text-gray-500 hover:text-white mt-2 w-full"
                                                                onClick={() => setShowLocationPanel(false)}
                                                            >
                                                                CERRAR
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        <td className="px-4 py-4">
                                            <Input
                                                value={row.cbu_habitual || ''}
                                                placeholder="22 dígitos"
                                                onChange={(e) => handleFieldChange(row, 'cbu_habitual', e.target.value)}
                                                className="h-8 bg-gray-900 border-gray-700 font-mono text-[10px]"
                                            />
                                        </td>

                                        <td className="px-4 py-4">
                                            <Input
                                                value={row.email || ''}
                                                placeholder="email@ejemplo.com"
                                                onChange={(e) => handleFieldChange(row, 'email', e.target.value)}
                                                className="h-8 bg-gray-900 border-gray-700 text-[10px]"
                                            />
                                        </td>

                                        <td className="px-4 py-4">
                                            <Input
                                                value={row.telefono_1 || ''}
                                                placeholder="Teléfono"
                                                onChange={(e) => handleFieldChange(row, 'telefono_1', e.target.value)}
                                                className="h-8 bg-gray-900 border-gray-700 text-[10px]"
                                            />
                                        </td>

                                        <td className="px-4 py-4">
                                            <div className="flex flex-col items-center gap-1.5">
                                                {editingRowId === row.id ? (
                                                    <div className="flex flex-col gap-2">
                                                        <Button
                                                            size="sm"
                                                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-8"
                                                            onClick={() => finishEditing(row)}
                                                        >
                                                            LISTO
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-gray-500 hover:text-white h-6 text-[10px]"
                                                            onClick={() => cancelEditing(row.id)}
                                                        >
                                                            CANCELAR
                                                        </Button>
                                                    </div>
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
                                                                onClick={() => startEditing(row)}
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
                                                            onClick={() => startEditing(row)}
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
