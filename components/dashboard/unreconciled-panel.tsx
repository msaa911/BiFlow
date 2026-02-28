'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Search, ExternalLink, Tag, FileDown } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Transaction {
    id: string
    fecha: string
    descripcion: string
    monto: number
    estado: string
    cuit_origen?: string
    cuit_destino?: string
}

interface UnreconciledPanelProps {
    transactions: Transaction[]
    onRefresh?: () => void
}

export function UnreconciledPanel({ transactions, onRefresh }: UnreconciledPanelProps) {
    const [searchTerm, setSearchTerm] = useState('')

    const filtered = transactions.filter(t =>
        t.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.monto.toString().includes(searchTerm)
    )

    const handleExport = () => {
        const dataToExport = filtered.map(t => ({
            Fecha: new Date(t.fecha).toLocaleDateString('es-AR'),
            Descripción: t.descripcion,
            Monto: t.monto,
            Estado: 'Pendiente',
            'CUIT Origen': t.cuit_origen || 'No Identificado',
            'CUIT Destino': t.cuit_destino || 'No Identificado'
        }))

        const ws = XLSX.utils.json_to_sheet(dataToExport)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Cuarentena")
        XLSX.writeFile(wb, `BiFlow_Cuarentena_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    return (
        <Card className="bg-gray-900 border-gray-800 animate-in fade-in duration-500">
            <CardHeader className="flex flex-row items-center justify-between border-b border-gray-800 px-6 py-4">
                <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        Transacciones en Cuarentena ({transactions.length})
                    </CardTitle>
                    <p className="text-xs text-gray-400 mt-1">Movimientos bancarios sin respaldo documental identificado.</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    className="border-gray-700 text-gray-300 hover:bg-gray-800 flex items-center gap-2"
                >
                    <FileDown className="w-4 h-4" />
                    Exportar Excel
                </Button>
            </CardHeader>
            <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar por descripción o monto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    {filtered.length > 0 ? (
                        filtered.map(tx => (
                            <div key={tx.id} className="group flex items-center justify-between p-4 bg-gray-950 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${tx.monto < 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                        {tx.monto < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-white truncate max-w-[400px]">{tx.descripcion}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-gray-500">{new Date(tx.fecha).toLocaleDateString('es-AR')}</span>
                                            <span className="text-[10px] text-gray-500">•</span>
                                            <span className="text-[10px] text-gray-500 uppercase">{tx.cuit_origen || 'CUIT no Identificado'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className={`text-sm font-black ${tx.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(tx.monto)}
                                        </p>
                                        <Badge variant="outline" className="text-[10px] font-bold uppercase border-amber-500/40 text-amber-400 bg-amber-500/10 px-2 mt-1">
                                            Pendiente
                                        </Badge>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-3 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 flex items-center gap-2 bg-emerald-500/5"
                                            onClick={() => { }}
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-bold uppercase">Conciliar</span>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-9 px-3 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500 flex items-center gap-2 bg-blue-500/5"
                                            onClick={() => { }}
                                        >
                                            <Tag className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-bold uppercase">Categorizar</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-12 text-center text-gray-600 border border-dashed border-gray-800 rounded-xl">
                            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                            No se encontraron transacciones en esta vista.
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

function TrendingUp(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
        </svg>
    )
}

function TrendingDown(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
            <polyline points="16 17 22 17 22 11" />
        </svg>
    )
}
