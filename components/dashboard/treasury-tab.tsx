'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { InvoicePanel } from './invoice-panel'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wallet, TrendingUp, TrendingDown, Calculator, Briefcase } from 'lucide-react'
import { TreasuryEngine } from '@/lib/treasury-engine'
import { CashFlowHub } from './cash-flow-hub'
import { Shield } from 'lucide-react'

interface TreasuryTabProps {
    orgId: string
}

export function TreasuryTab({ orgId }: TreasuryTabProps) {
    const [invoices, setInvoices] = useState<any[]>([])
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
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

        fetchData()
    }, [orgId])

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
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                <Wallet className="w-6 h-6 text-emerald-400" />
                                Treasury Hub
                            </h1>
                            <p className="text-gray-400 text-sm mt-1">
                                Gestión profesional de Cuentas por Cobrar (AR) y Pagar (AP).
                            </p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 bg-gray-900 border-gray-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl">
                            <TrendingUp className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total por Cobrar (AR)</p>
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
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total por Pagar (AP)</p>
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

            <Tabs defaultValue="invoices" className="w-full">
                <TabsList className="bg-gray-900 border border-gray-800 p-1 rounded-xl mb-6">
                    <TabsTrigger value="invoices" className="rounded-lg">Panel de Comprobantes</TabsTrigger>
                    <TabsTrigger value="cashflow" className="rounded-lg">Cash Flow Proyectado</TabsTrigger>
                    <TabsTrigger value="advisor" className="rounded-lg">AI Strategy Advisor</TabsTrigger>
                </TabsList>

                <TabsContent value="invoices" className="space-y-6">
                    <InvoicePanel invoices={invoices} loading={loading} />
                </TabsContent>

                <TabsContent value="cashflow">
                    <CashFlowHub invoices={invoices} currentBalance={initialBalancesSum} />
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
