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
import { AlertCircle, CheckCircle2, Info, Loader2, Edit2, Check, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HierarchicalLocationSelector } from './location-selector'

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
            const validData = data.filter(d => !d.errors || d.errors.length === 0)
            await onConfirm(validData)
            onClose()
        } catch (error) {
            console.error('Error confirming import:', error)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleLocationChange = (row: any, updates: any) => {
        const updatedRow = {
            ...row,
            ...updates,
            // Clear warnings if we are manually setting the location
            warnings: [],
            isValid: true // Assume valid if they manually choose from the list
        }
        onRowUpdate(updatedRow)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl bg-gray-900 border-gray-800 text-white max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
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
                                <p className="text-xs text-amber-500/70">Ubicación no oficial o por corregir</p>
                            </div>
                        </div>
                    )}
                    {errorCount > 0 && (
                        <div className="flex-1 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <div>
                                <p className="text-sm font-bold text-red-400">{errorCount} Errores</p>
                                <p className="text-xs text-red-500/70">Se omitirán</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="border border-gray-800 rounded-lg overflow-hidden flex-1">
                    <ScrollArea className="h-[400px]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-800 text-gray-400 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Fila</th>
                                    <th className="px-4 py-3 font-medium">Razón Social</th>
                                    <th className="px-4 py-3 font-medium">CUIT</th>
                                    <th className="px-4 py-3 font-medium">Localidad / Provincia</th>
                                    <th className="px-4 py-3 font-medium text-center">Estado / Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {data.map((row) => (
                                    <tr key={row.id} className={`${row.isValid ? 'hover:bg-gray-800/50' : 'bg-red-500/5 hover:bg-red-500/10'} ${editingRowId === row.id ? 'bg-emerald-500/5' : ''}`}>
                                        <td className="px-4 py-3 text-gray-500 tabular-nums">#{row.rowNum}</td>
                                        <td className="px-4 py-3 font-medium">
                                            {row.razon_social || <span className="text-red-400 italic">Sin nombre</span>}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-gray-400">{row.cuit}</td>
                                        <td className="px-4 py-3 text-gray-400">
                                            {editingRowId === row.id ? (
                                                <div className="bg-gray-950 p-4 rounded-lg border border-emerald-500/30 w-80">
                                                    <HierarchicalLocationSelector
                                                        formData={{
                                                            provincia: row.provincia,
                                                            departamento: row.departamento,
                                                            localidad: row.localidad
                                                        }}
                                                        onChange={(updates) => handleLocationChange(row, updates)}
                                                    />
                                                    <Button
                                                        size="sm"
                                                        className="w-full mt-3 bg-emerald-600 h-8"
                                                        onClick={() => setEditingRowId(null)}
                                                    >
                                                        Listo
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span>{row.localidad}</span>
                                                    <span className="text-[10px] text-gray-500 uppercase">{row.departamento && `${row.departamento}, `}{row.provincia}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col items-center gap-1">
                                                {row.isValid ? (
                                                    <>
                                                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                            OK
                                                        </Badge>
                                                        {row.warnings?.length > 0 && (
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] text-amber-500 flex items-center gap-1 font-bold">
                                                                    <Info className="h-2.5 w-2.5" /> NO OFICIAL
                                                                </span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 text-[10px] text-blue-400 hover:text-blue-300 px-1 mt-1"
                                                                    onClick={() => setEditingRowId(row.id)}
                                                                >
                                                                    <Edit2 className="h-3 w-3 mr-1" /> CORREGIR
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-1">
                                                        {row.errors.map((err: string, i: number) => (
                                                            <span key={i} className="text-[10px] text-red-400 font-bold whitespace-nowrap">
                                                                {err}
                                                            </span>
                                                        ))}
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

                <DialogFooter className="mt-4 gap-2">
                    <Button variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={validCount === 0 || isProcessing}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
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
