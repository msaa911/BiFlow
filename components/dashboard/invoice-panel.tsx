'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, Filter, TrendingDown, TrendingUp, ArrowRight, AlertCircle, Info } from 'lucide-react'
import { TreasuryEngine } from '@/lib/treasury-engine'

interface InvoicePanelProps {
    invoices: any[]
    loading: boolean
}

export function InvoicePanel({ invoices, loading }: InvoicePanelProps) {
    const [view, setView] = useState<'AR' | 'AP'>('AR')
    const [searchTerm, setSearchTerm] = useState('')

    const filteredInvoices = invoices.filter(inv => {
        const typeMatch = view === 'AR' ? inv.tipo === 'factura_venta' : inv.tipo === 'factura_compra'
        const searchMatch = (inv.razon_social_socio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.numero || '').toLowerCase().includes(searchTerm.toLowerCase())
        return typeMatch && searchMatch
    })

    const nettingOps = TreasuryEngine.detectNettingOpportunities(invoices)

    return (
        <Card className="bg-gray-900 border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex bg-gray-800 p-1 rounded-lg">
                    <button
                        onClick={() => setView('AR')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'AR' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Ventas (A Cobrar)
                    </button>
                    <button
                        onClick={() => setView('AP')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'AP' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Compras (A Pagar)
                    </button>
                </div>

                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                        placeholder="Buscar cliente o factura..."
                        className="pl-10 bg-gray-800 border-gray-700 text-sm h-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-800/50 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Socio / CUIT</th>
                            <th className="px-6 py-4">Emisión / Vto.</th>
                            <th className="px-6 py-4">Banco / Cheque</th>
                            <th className="px-6 py-4">Estado / Salud</th>
                            <th className="px-6 py-4 text-right">Monto</th>
                            <th className="px-6 py-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500 animate-pulse">Cargando comprobantes...</td>
                            </tr>
                        ) : filteredInvoices.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No se encontraron comprobantes.</td>
                            </tr>
                        ) : filteredInvoices.map((inv) => {
                            const isOverdue = new Date(inv.fecha_vencimiento) < new Date() && inv.estado !== 'pagado'
                            const adjustedMonto = TreasuryEngine.calculateAdjustedMonto(inv.monto_total)
                            const inflationLoss = TreasuryEngine.calculateInflationLoss(inv.monto_pendiente)
                            const ratingInfo = TreasuryEngine.getClientRating(inv.cuit_socio, inv.razon_social_socio)

                            return (
                                <tr key={inv.id} className="hover:bg-gray-800/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-white">{inv.nombre_entidad || inv.razon_social_socio}</div>
                                        <div className="text-xs text-gray-500">{inv.cuit_socio || '00-00000000-0'}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        <div>{new Date(inv.fecha_emision).toLocaleDateString('es-AR')}</div>
                                        <div className={`text-xs ${isOverdue ? 'text-red-500 font-bold' : ''}`}>
                                            Vence: {new Date(inv.fecha_vencimiento).toLocaleDateString('es-AR')}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        <div className="text-white font-medium">{inv.banco || 'S/B'}</div>
                                        <div className="text-[10px]">{inv.numero_cheque ? `CH: ${inv.numero_cheque}` : 'S/CH'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1.5">
                                            <Badge variant="outline" className={`${inv.estado === 'pagado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                inv.estado === 'pendiente' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                                    'bg-gray-500/10 text-gray-400'
                                                } text-[10px] w-fit font-bold uppercase flex items-center gap-1`}>
                                                {inv.estado === 'pagado' && <TrendingUp className="w-3 h-3" />}
                                                {inv.estado}
                                            </Badge>
                                            {inv.estado === 'pagado' && (
                                                <div className="text-[9px] text-emerald-500/70 flex items-center gap-1">
                                                    <Info className="w-2.5 h-2.5" />
                                                    Conciliado automáticamente
                                                </div>
                                            )}
                                            {inv.estado !== 'pagado' && (
                                                <div className={`flex items-center gap-1 text-[10px] ${ratingInfo.color}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${inv.monto_pendiente > 500000 ? 'animate-pulse' : ''}`}></span>
                                                    Rating: {ratingInfo.rating}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-white">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_total)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-500 hover:text-white">
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Netting Intelligence Alert */}
            {nettingOps.length > 0 && (
                <div className="p-4 bg-emerald-600/5 border-t border-gray-800 flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-full">
                        <AlertCircle className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-emerald-200/60 leading-relaxed">
                            <strong className="text-emerald-400">Netting Inteligente Detectado:</strong> Tenemos un cruce de saldos con <span className="text-white font-semibold">{nettingOps[0].socio}</span>.
                            A cobrar: <span className="text-emerald-400">${new Intl.NumberFormat('es-AR').format(nettingOps[0].pendingAR)}</span> |
                            A pagar: <span className="text-red-400">${new Intl.NumberFormat('es-AR').format(nettingOps[0].pendingAP)}</span>.
                        </p>
                    </div>
                    <button className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline underline-offset-4">Generar Compensación</button>
                </div>
            )}
        </Card>
    )
}
