'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, Filter, TrendingDown, TrendingUp, ArrowRight, AlertCircle, Info, Plus, Edit2, Trash2, FileDown, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TreasuryEngine } from '@/lib/treasury-engine'
import { InvoiceFormModal } from './invoice-form-modal'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRef } from 'react'
import { downloadInvoiceTemplate, parseInvoiceExcel } from '@/lib/excel-utils'
import { InvoiceImportPreviewModal } from './invoice-import-preview-modal'

interface InvoicePanelProps {
    orgId: string
    invoices: any[]
    loading: boolean
    defaultView?: 'AR' | 'AP'
    onRefresh: () => void
}

export function InvoicePanel({ orgId, invoices, loading, defaultView = 'AR', onRefresh }: InvoicePanelProps) {
    const [view, setView] = useState<'AR' | 'AP'>(defaultView)
    const [searchTerm, setSearchTerm] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
    const [importData, setImportData] = useState<any[]>([])
    const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que desea eliminar este comprobante?')) return
        const supabase = createClient()
        const { error } = await supabase.from('comprobantes').delete().eq('id', id)
        if (error) {
            toast.error('Error al eliminar: ' + error.message)
        } else {
            toast.success('Comprobante eliminado')
            onRefresh()
        }
    }

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
                        Ingresos (Ventas)
                    </button>
                    <button
                        onClick={() => setView('AP')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'AP' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Egresos (Compras)
                    </button>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                        onClick={() => downloadInvoiceTemplate(view === 'AR' ? 'factura_venta' : 'factura_compra')}
                    >
                        <FileDown className="w-4 h-4 mr-2" />
                        Plantilla
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        Importar
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".xlsx,.csv"
                        onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const loadingToast = toast.loading('Analizando comprobantes...')
                            try {
                                const { data: parsed, errors } = await parseInvoiceExcel(file)
                                if (errors.length > 0) throw new Error(errors[0])

                                // Match with existing entities
                                const { data: entities } = await supabase
                                    .from('entidades')
                                    .select('id, razon_social, cuit')
                                    .eq('organization_id', orgId)

                                const enriched = parsed.map(inv => {
                                    const match = entities?.find(e =>
                                        e.cuit === inv.cuit_socio ||
                                        e.razon_social.toLowerCase() === inv.razon_social_socio.toLowerCase()
                                    )
                                    return {
                                        ...inv,
                                        entidad_id: match?.id,
                                        razon_social_socio: match?.razon_social || inv.razon_social_socio,
                                        cuit_socio: match?.cuit || inv.cuit_socio,
                                        isValid: inv.isValid && !!match,
                                        errors: !match ? [...(inv.errors || []), 'Socio no registrado'] : inv.errors
                                    }
                                })

                                setImportData(enriched)
                                setIsImportPreviewOpen(true)
                            } catch (err: any) {
                                toast.error('Error: ' + err.message)
                            } finally {
                                toast.dismiss(loadingToast)
                                e.target.value = ''
                            }
                        }}
                    />
                    <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        onClick={() => {
                            setSelectedInvoice(null)
                            setIsModalOpen(true)
                        }}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nuevo {view === 'AR' ? 'Ingreso' : 'Egreso'}
                    </Button>
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                            placeholder="Buscar cliente o factura..."
                            className="pl-10 bg-gray-900 border-gray-800 text-sm h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-800/50 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                        <tr>
                            <th className="px-6 py-4">F. Vencimiento</th>
                            <th className="px-6 py-4">Socio / CUIT</th>
                            <th className="px-6 py-4">Concepto / Condición</th>
                            <th className="px-6 py-4">M. Pago</th>
                            <th className="px-6 py-4 text-right">Monto</th>
                            <th className="px-6 py-4 text-center">Estado</th>
                            <th className="px-6 py-4 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-24 text-center text-gray-500">Cargando comprobantes...</td></tr>
                        ) : filteredInvoices.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-24 text-center text-gray-500 text-xl font-bold">No hay comprobantes cargados.</td></tr>
                        ) : filteredInvoices.map(inv => (
                            <tr key={inv.id} className="hover:bg-gray-800/20 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold">{new Date(inv.fecha_vencimiento).toLocaleDateString('es-AR')}</span>
                                        <span className="text-[10px] text-gray-500">Emisión: {new Date(inv.fecha_emision).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-white font-semibold">{inv.razon_social_socio}</span>
                                        <span className="text-xs text-gray-400 font-mono tracking-tighter">{inv.cuit_socio}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-white font-medium truncate max-w-[200px]">{inv.concepto || (inv.numero || 'Operación')}</span>
                                        <Badge variant="outline" className={`w-fit text-[9px] mt-1 ${inv.condicion === 'contado' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-gray-800 text-gray-400'}`}>
                                            {inv.condicion?.replace('_', ' ').toUpperCase() || 'CTA CTE'}
                                        </Badge>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-xs text-gray-400 uppercase font-medium">
                                        {inv.metodo_pago?.replace('_', ' ') || '---'}
                                    </span>
                                </td>
                                <td className={`px-6 py-4 text-right font-bold ${view === 'AR' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_total)}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <Badge className={
                                        inv.estado === 'reconciliado' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                            inv.estado === 'vencido' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                                    }>
                                        {inv.estado === 'reconciliado' ? 'COBRADO' : inv.estado?.toUpperCase()}
                                    </Badge>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-gray-500 hover:text-white"
                                            onClick={() => {
                                                setSelectedInvoice(inv)
                                                setIsModalOpen(true)
                                            }}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-gray-500 hover:text-red-500"
                                            onClick={() => handleDelete(inv.id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

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

            <InvoiceFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                orgId={orgId}
                type={view === 'AR' ? 'factura_venta' : 'factura_compra'}
                invoice={selectedInvoice}
                onSuccess={onRefresh}
            />
            <InvoiceImportPreviewModal
                isOpen={isImportPreviewOpen}
                onClose={() => setIsImportPreviewOpen(false)}
                data={importData}
                orgId={orgId}
                type={view === 'AR' ? 'factura_venta' : 'factura_compra'}
                onRowUpdate={(upd) => setImportData(prev => prev.map(r => r.id === upd.id ? upd : r))}
                onConfirm={async (validData) => {
                    const loadingToast = toast.loading(`Importando ${validData.length} comprobantes...`)
                    try {
                        const payload = validData.map(v => ({
                            organization_id: orgId,
                            entidad_id: v.entidad_id,
                            tipo: view === 'AR' ? 'factura_venta' : 'factura_compra',
                            numero: v.numero,
                            monto_total: v.monto_total,
                            monto_pendiente: v.monto_total,
                            fecha_emision: v.fecha_emision,
                            fecha_vencimiento: v.fecha_vencimiento,
                            banco: v.banco,
                            numero_cheque: v.numero_cheque,
                            razon_social_socio: v.razon_social_socio,
                            cuit_socio: v.cuit_socio,
                            estado: 'pendiente'
                        }))
                        const { error } = await supabase.from('comprobantes').insert(payload)
                        if (error) throw error
                        toast.success('Comprobantes importados con éxito')
                        onRefresh()
                    } catch (err: any) {
                        toast.error('Error: ' + err.message)
                        throw err
                    } finally {
                        toast.dismiss(loadingToast)
                    }
                }}
            />
        </Card>
    )
}
