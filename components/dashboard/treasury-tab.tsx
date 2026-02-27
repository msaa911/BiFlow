'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { InvoicePanel } from './invoice-panel'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wallet, TrendingUp, TrendingDown, Calculator, Briefcase, Users } from 'lucide-react'
import { TreasuryEngine } from '@/lib/treasury-engine'
import { CashFlowHub } from './cash-flow-hub'
import { SuppliersTab } from './suppliers-tab'
import { TreasuryHistory } from './treasury-history'
import { Shield, BookUser, History, Landmark } from 'lucide-react'
import { CheckPortfolio } from './check-portfolio'

interface TreasuryTabProps {
    orgId: string
    liquidityCushion?: number
}

export function TreasuryTab({ orgId, liquidityCushion = 0 }: TreasuryTabProps) {
    const [invoices, setInvoices] = useState<any[]>([])
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [reconciling, setReconciling] = useState(false)
    const supabase = createClient()

    async function fetchData() {
        setLoading(true)
        const [invRes, bankRes] = await Promise.all([
            supabase
                .from('comprobantes')
                .select('*')
                .eq('organization_id', orgId)
                .order('fecha_vencimiento', { ascending: true }),
            supabase
                .from('cuentas_bancarias')
                .select('saldo_inicial')
                .eq('organization_id', orgId)
        ])

        if (invRes.data) setInvoices(invRes.data)
        if (bankRes.data) setBankAccounts(bankRes.data)
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [orgId])

    const handleReconcile = async () => {
        setReconciling(true)
        try {
            const res = await fetch('/api/reconcile/auto', { method: 'POST' })
            const data = await res.json()
            if (data.matched > 0) {
                alert(`¡Éxito! Se conciliaron ${data.matched} comprobantes automáticamente.`)
                await fetchData()
            } else {
                alert('No se encontraron nuevos matches para conciliar.')
            }
        } catch (error) {
            console.error('Reconciliation failed:', error)
            alert('Error al ejecutar la conciliación.')
        } finally {
            setReconciling(false)
        }
    }

    const initialBalancesSum = bankAccounts.reduce((acc: number, curr: any) => acc + (Number(curr.saldo_inicial) || 0), 0)

    const totalAR = invoices
        .filter(i => i.tipo === 'factura_venta' && i.estado !== 'pagado')
        .reduce((acc, curr) => acc + Number(curr.monto_pendiente), 0)

    const totalAP = invoices
        .filter(i => i.tipo === 'factura_compra' && i.estado !== 'pagado')
        .reduce((acc, curr) => acc + Number(curr.monto_pendiente), 0)

    // Valuation Logic
    const valuation = TreasuryEngine.calculateEnterpriseValuation(0, totalAR, totalAP) // Mock balance 0 for now

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-6 bg-gray-900 border-gray-800">
                    <div className="flex flex-col flex-1 gap-4 justify-center h-full">
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Wallet className="w-6 h-6 text-emerald-400 shrink-0" />
                            Centro de Inteligencia Financiera
                        </h1>
                        <button
                            onClick={handleReconcile}
                            disabled={reconciling}
                            className={`flex items-center justify-center w-full xl:w-max gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${reconciling
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20 active:scale-95'
                                }`}
                        >
                            <TrendingUp className={`w-4 h-4 ${reconciling ? 'animate-spin' : ''}`} />
                            {reconciling ? 'Cruzando Datos...' : '✨ Cruzar Extractos vs Ingresos/Egresos'}
                        </button>
                    </div>
                </Card>

                <Card className="p-6 bg-gray-900 border-gray-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl">
                            <TrendingUp className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ventas (A Cobrar)</p>
                            <h3 className="text-2xl font-bold text-white">
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalAR)}
                            </h3>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-gray-900 border-gray-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-500/10 rounded-xl">
                            <TrendingDown className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Compras (A Pagar)</p>
                            <h3 className="text-2xl font-bold text-white">
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalAP)}
                            </h3>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-emerald-600/10 border-emerald-500/20">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/20 rounded-xl">
                            <Briefcase className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-emerald-500/70 uppercase tracking-wider">Valuación Real BiFlow</p>
                            <h3 className="text-2xl font-bold text-emerald-400">
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(valuation)}
                            </h3>
                        </div>
                    </div>
                </Card>
            </div>

            <Tabs defaultValue="cashflow" className="w-full">
                <TabsList className="bg-gray-900 border border-gray-800 p-1 rounded-xl mb-6">
                    <TabsTrigger value="cashflow" className="rounded-lg">
                        <Calculator className="w-3.5 h-3.5 mr-2" />
                        Tesorería
                    </TabsTrigger>
                    <TabsTrigger value="ingresos" className="rounded-lg">
                        <TrendingUp className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                        Ingresos
                    </TabsTrigger>
                    <TabsTrigger value="egresos" className="rounded-lg">
                        <TrendingDown className="w-3.5 h-3.5 mr-2 text-red-400" />
                        Egresos
                    </TabsTrigger>
                    <TabsTrigger value="clientes" className="rounded-lg">
                        <Users className="w-3.5 h-3.5 mr-2 text-blue-400" />
                        Clientes
                    </TabsTrigger>
                    <TabsTrigger value="proveedores" className="rounded-lg text-emerald-400">
                        <BookUser className="w-3.5 h-3.5 mr-2" />
                        Proveedores
                    </TabsTrigger>
                    <TabsTrigger value="recibos" className="rounded-lg">
                        <History className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                        Recibos
                    </TabsTrigger>
                    <TabsTrigger value="ordenes" className="rounded-lg">
                        <History className="w-3.5 h-3.5 mr-2 text-red-400" />
                        Órdenes de Pago
                    </TabsTrigger>
                    <TabsTrigger value="cartera" className="rounded-lg">
                        <Landmark className="w-3.5 h-3.5 mr-2 text-blue-400" />
                        Cartera
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="cashflow">
                    <CashFlowHub invoices={invoices} currentBalance={initialBalancesSum} liquidityCushion={liquidityCushion} />
                </TabsContent>

                <TabsContent value="cartera">
                    <CheckPortfolio orgId={orgId} />
                </TabsContent>

                <TabsContent value="ingresos" className="space-y-6">
                    <InvoicePanel orgId={orgId} invoices={invoices} loading={loading} defaultView="AR" onRefresh={fetchData} hideViewSelector={true} />
                </TabsContent>

                <TabsContent value="egresos" className="space-y-6">
                    <InvoicePanel orgId={orgId} invoices={invoices} loading={loading} defaultView="AP" onRefresh={fetchData} hideViewSelector={true} />
                </TabsContent>

                <TabsContent value="clientes">
                    <SuppliersTab orgId={orgId} category="cliente" />
                </TabsContent>

                <TabsContent value="proveedores">
                    <SuppliersTab orgId={orgId} category="proveedor" />
                </TabsContent>

                <TabsContent value="recibos">
                    <TreasuryHistory orgId={orgId} typeFilter="cobro" />
                </TabsContent>

                <TabsContent value="ordenes">
                    <TreasuryHistory orgId={orgId} typeFilter="pago" />
                </TabsContent>

                <TabsContent value="advisor">
                    <Card className="p-12 text-center bg-gray-900 border-gray-800">
                        <Shield className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">Próximamente: Auditoría Estratégica AI</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            El cerebro de BiFlow analizará tus plazos de cobro y pago para optimizar tu rentabilidad real.
                        </p>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
