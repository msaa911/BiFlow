'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, Plus, Edit2, Trash2, FileDown, Upload, Bell, CheckCircle2, TrendingUp, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TreasuryEngine } from '@/lib/treasury-engine'
import { InvoiceFormModal } from './invoice-form-modal'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRef } from 'react'
import { downloadInvoiceTemplate, parseInvoiceExcel } from '@/lib/excel-utils'
import { InvoiceImportPreviewModal } from './invoice-import-preview-modal'
import { PaymentWizard } from './payment-wizard'

interface InvoicePanelProps {
    orgId: string
    invoices: any[]
    loading: boolean
    defaultView?: 'AR' | 'AP'
    onRefresh: () => void
    hideViewSelector?: boolean
}

export function InvoicePanel({ orgId, invoices, loading, defaultView = 'AR', onRefresh, hideViewSelector = false }: InvoicePanelProps) {
    const [view, setView] = useState<'AR' | 'AP'>(defaultView)
    const [searchTerm, setSearchTerm] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isPaymentWizardOpen, setIsPaymentWizardOpen] = useState(false)
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
    const [importData, setImportData] = useState<any[]>([])
    const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que desea eliminar este comprobante?')) return
        const { error } = await supabase.from('comprobantes').delete().eq('id', id)
        if (error) {
            toast.error('Error al eliminar: ' + error.message)
        } else {
            toast.success('Comprobante eliminado')
            onRefresh()
        }
    }

    const filteredInvoices = invoices.filter(inv => {
        let typeMatch = false
        if (view === 'AR') {
            if (inv.tipo === 'factura_venta') typeMatch = true
            // NC/ND: mostrar en AR si está vinculada a una factura_venta, o si la entidad es cliente
            else if (['nota_credito', 'nota_debito'].includes(inv.tipo)) {
                const vinculado = inv.vinculado_id ? invoices.find(i => i.id === inv.vinculado_id) : null
                typeMatch = vinculado ? vinculado.tipo === 'factura_venta' : !inv.tipo.includes('compra')
            }
        } else {
            if (inv.tipo === 'factura_compra') typeMatch = true
            else if (['nota_credito', 'nota_debito'].includes(inv.tipo)) {
                const vinculado = inv.vinculado_id ? invoices.find(i => i.id === inv.vinculado_id) : null
                typeMatch = vinculado ? vinculado.tipo === 'factura_compra' : !inv.tipo.includes('venta')
            }
        }

        const searchMatch = (inv.razon_social_socio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.numero || '').toLowerCase().includes(searchTerm.toLowerCase())
        return typeMatch && searchMatch
    })

    const nettingOps = TreasuryEngine.detectNettingOpportunities(invoices)

    return (
        <Card className="bg-gray-900 border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                {!hideViewSelector && (
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
                )}

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
                                const { data: entities } = await supabase.from('entidades').select('id, razon_social, cuit').eq('organization_id', orgId)
                                const enriched = parsed.map(inv => {
                                    const match = entities?.find(e => e.cuit === inv.cuit_socio || e.razon_social.toLowerCase() === inv.razon_social_socio.toLowerCase())
                                    return { ...inv, entidad_id: match?.id, razon_social_socio: match?.razon_social || inv.razon_social_socio, cuit_socio: match?.cuit || inv.cuit_socio, isValid: inv.isValid && !!match, errors: !match ? [...(inv.errors || []), 'Socio no registrado'] : inv.errors }
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
                </div>
            </div>

            <div className="p-4 bg-gray-900 flex items-center justify-between border-b border-gray-800">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                        placeholder="Buscar por cliente, CUIT o factura..."
                        className="pl-10 bg-gray-950 border-gray-800 text-sm h-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-800/50 text-xs uppercase font-semibold text-gray-500 tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Fecha (Emisión)</th>
                            <th className="px-6 py-4">CUIT / Entidad</th>
                            <th className="px-6 py-4">Concepto / Condición</th>
                            <th className="px-6 py-4 text-right">Monto Total</th>
                            <th className="px-6 py-4 text-right">Saldo Pendiente</th>
                            <th className="px-6 py-4 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-24 text-center text-gray-500">Cargando comprobantes...</td></tr>
                        ) : filteredInvoices.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-24 text-center text-gray-500">No hay comprobantes registrados.</td></tr>
                        ) : filteredInvoices.map(inv => (
                            <tr key={inv.id} className="hover:bg-gray-800/20 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold">{new Date(inv.fecha_emision).toLocaleDateString('es-AR')}</span>
                                        <span className="text-[10px] text-gray-500 uppercase">Vence: {new Date(inv.fecha_vencimiento).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-white font-semibold">{inv.razon_social_socio}</span>
                                        <span className="text-xs text-gray-400 font-mono">{inv.cuit_socio}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-white truncate max-w-[180px]">{inv.concepto || (inv.numero || 'Sin Número')}</span>
                                            {inv.tipo === 'nota_credito' && <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px]">NC</Badge>}
                                            {inv.tipo === 'nota_debito' && <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-[9px]">ND</Badge>}
                                        </div>
                                        <Badge variant="outline" className={`w-fit text-[9px] mt-1 ${inv.condicion === 'contado' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-gray-800 text-gray-400'}`}>
                                            {inv.condicion?.toUpperCase() || 'CTA CTE'}
                                        </Badge>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-gray-400">
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_total)}
                                </td>
                                <td className={`px-6 py-4 text-right font-bold ${inv.monto_pendiente > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {inv.monto_pendiente > 0 ? (
                                        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(inv.monto_pendiente)
                                    ) : (
                                        inv.metadata?.reconciled_v2 ? (
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center justify-end gap-1 text-emerald-400 text-xs">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    AUTO-CONCILIADO
                                                </div>
                                                <span className="text-[9px] text-gray-500 font-normal max-w-[150px] truncate" title={inv.metadata?.desc_transaccion}>
                                                    {inv.metadata?.banco_transaccion ? `${inv.metadata.banco_transaccion} • ` : ''} {inv.metadata?.desc_transaccion || 'Transacción Bancaria'}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-1 text-emerald-400 text-xs font-bold">
                                                <CheckCircle2 className="w-3 h-3" />
                                                {view === 'AR' ? 'COBRADO' : 'PAGADO'}
                                            </div>
                                        )
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center gap-2">
                                        <Button
                                            size="sm"
                                            className={`h-8 font-bold ${view === 'AR' ? 'bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20' : 'bg-red-600/10 text-red-500 hover:bg-red-600/20'}`}
                                            disabled={inv.monto_pendiente <= 0}
                                            onClick={() => {
                                                setSelectedInvoice(inv)
                                                setIsPaymentWizardOpen(true)
                                            }}
                                        >
                                            {view === 'AR' ? 'Cobrar' : 'Pagar'}
                                        </Button>
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
                                            className="h-8 w-8 text-gray-500 hover:text-red-400"
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
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-emerald-200/60 leading-relaxed">
                            <strong className="text-emerald-400">Netting Inteligente Detectado:</strong> Tenemos un cruce de saldos para <span className="text-white font-semibold">{nettingOps[0].socio}</span>.
                            A cobrar: <span className="text-emerald-400">${new Intl.NumberFormat('es-AR').format(nettingOps[0].pendingAR)}</span> |
                            A pagar: <span className="text-red-400">${new Intl.NumberFormat('es-AR').format(nettingOps[0].pendingAP)}</span>.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                        Compensar Ahora
                        <ArrowRight className="w-3 h-3 ml-2" />
                    </Button>
                </div>
            )}

            <InvoiceFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                orgId={orgId}
                invoice={selectedInvoice}
                type={view === 'AR' ? 'factura_venta' : 'factura_compra'}
                onSuccess={onRefresh}
            />

            <InvoiceImportPreviewModal
                isOpen={isImportPreviewOpen}
                onClose={() => setIsImportPreviewOpen(false)}
                data={importData}
                orgId={orgId}
                type={view === 'AR' ? 'factura_venta' : 'factura_compra'}
                onConfirm={async (validData) => {
                    const loadingToast = toast.loading('Guardando comprobantes...')
                    try {
                        const safeDate = (val: any) => {
                            if (!val) return new Date().toISOString().split('T')[0]
                            if (typeof val === 'number') {
                                return new Date(Math.round((val - 25569) * 864e5)).toISOString().split('T')[0]
                            }
                            return String(val)
                        }

                        const tipoLabel = view === 'AR' ? 'ingresos' : 'egresos'

                        // Send everything to server-side endpoint (service role handles all DB ops)
                        const res = await fetch('/api/invoice-import', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                tipoLabel,
                                comprobantes: validData.map(inv => ({
                                    entidad_id: inv.entidad_id,
                                    tipo: inv.tipo_documento === 'factura' ? (view === 'AR' ? 'factura_venta' : 'factura_compra') : inv.tipo_documento,
                                    fecha_emision: safeDate(inv.fecha_emision),
                                    fecha_vencimiento: safeDate(inv.fecha_vencimiento || inv.fecha_emision),
                                    numero: inv.numero,
                                    monto_total: inv.monto_total,
                                    monto_pendiente: inv.condicion === 'contado' ? 0 : inv.monto_total,
                                    estado: inv.condicion === 'contado' ? 'pagado' : 'pendiente',
                                    condicion: inv.condicion,
                                    moneda: inv.moneda || 'ARS',
                                    razon_social_socio: inv.razon_social_socio,
                                    cuit_socio: inv.cuit_socio
                                }))
                            })
                        })

                        if (!res.ok) {
                            const err = await res.json()
                            throw new Error(err.error || 'Error al importar')
                        }

                        const result = await res.json()
                        toast.success(`${result.count} comprobantes importados`)
                        onRefresh()
                    } catch (err: any) {
                        toast.error('Error al importar: ' + err.message)
                        throw err
                    } finally {
                        toast.dismiss(loadingToast)
                    }
                }}
                onRowUpdate={(updatedRow) => {
                    setImportData(prev => prev.map(row => row.rowNum === updatedRow.rowNum ? updatedRow : row))
                }}
                onSuccess={() => {
                    setIsImportPreviewOpen(false)
                    onRefresh()
                }}
            />

            <PaymentWizard
                isOpen={isPaymentWizardOpen}
                onClose={() => setIsPaymentWizardOpen(false)}
                orgId={orgId}
                entidadId={selectedInvoice?.entidad_id}
                razonSocial={selectedInvoice?.razon_social_socio}
                tipo={view === 'AR' ? 'cobro' : 'pago'}
                onSuccess={onRefresh}
            />
        </Card>
    )
}
