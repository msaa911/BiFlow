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
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ImportPreviewModalProps {
    isOpen: boolean
    onClose: () => void
    data: any[]
    category: 'cliente' | 'proveedor' | 'ambos'
    onConfirm: (validData: any[]) => Promise<void>
}

export function ImportPreviewModal({ isOpen, onClose, data, category, onConfirm }: ImportPreviewModalProps) {
    const [isProcessing, setIsProcessing] = useState(false)

    const validCount = data.filter(d => d.isValid).length
    const errorCount = data.length - validCount

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

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-5xl bg-gray-900 border-gray-800 text-white max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                        Previsualización de Importación ({category === 'cliente' ? 'Clientes' : 'Proveedores'})
                    </DialogTitle>
                </DialogHeader>

                <div className="flex gap-4 mb-4">
                    <div className="flex-1 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <div>
                            <p className="text-sm font-bold text-emerald-400">{validCount} Registros Válidos</p>
                            <p className="text-xs text-emerald-500/70 text-balance opacity-50 whitespace-nowrap overflow-hidden text-ellipsis">Listos para importar</p>
                        </div>
                    </div>
                    {errorCount > 0 && (
                        <div className="flex-1 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <div>
                                <p className="text-sm font-bold text-red-400">{errorCount} Registros con Error</p>
                                <p className="text-xs text-red-500/70 text-balance opacity-50 whitespace-nowrap overflow-hidden text-ellipsis">Se omitirán en la carga</p>
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
                                    <th className="px-4 py-3 font-medium">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {data.map((row) => (
                                    <tr key={row.id} className={`${row.isValid ? 'hover:bg-gray-800/50' : 'bg-red-500/5 hover:bg-red-500/10'}`}>
                                        <td className="px-4 py-3 text-gray-500 tabular-nums">#{row.rowNum}</td>
                                        <td className="px-4 py-3 font-medium">
                                            {row.razon_social || <span className="text-red-400 italic">Sin nombre</span>}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-gray-400">{row.cuit}</td>
                                        <td className="px-4 py-3 text-gray-400">
                                            {row.localidad} {row.provincia && `(${row.provincia})`}
                                        </td>
                                        <td className="px-4 py-3">
                                            {row.isValid ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                    Válido
                                                </Badge>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    {row.errors.map((err: string, i: number) => (
                                                        <span key={i} className="text-[10px] text-red-400 font-bold whitespace-nowrap">
                                                            {err}
                                                        </span>
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
