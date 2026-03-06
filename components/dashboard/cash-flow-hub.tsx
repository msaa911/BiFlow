'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Calculator, Save, AlertCircle } from 'lucide-react'
import { TreasuryEngine, ProjectedMovement, Invoice } from '@/lib/treasury-engine'
import { CashFlowChart } from './cash-flow-chart'

interface CashFlowHubProps {
    invoices: Invoice[]
    currentBalance: number
    liquidityCushion?: number
}

export function CashFlowHub({ invoices, currentBalance, liquidityCushion = 0 }: CashFlowHubProps) {
    const [projections, setProjections] = useState<ProjectedMovement[]>([])
    const [excludedInvoices, setExcludedInvoices] = useState<string[]>([])
    const [isAdding, setIsAdding] = useState(false)
    const [newProjected, setNewProjected] = useState<Partial<ProjectedMovement>>({
        descripcion: '',
        monto: 0,
        fecha: new Date().toISOString().split('T')[0]
    })

    // Listen for AI Suggestions
    useEffect(() => {
        const handleAISuggestion = (e: any) => {
            const { descripcion, monto, fecha } = e.detail;
            const movement: ProjectedMovement = {
                id: Math.random().toString(36).substr(2, 9),
                descripcion,
                monto,
                fecha,
                isProjected: true
            };
            setProjections(prev => [...prev, movement]);

            // UI feedback toast/scroll could go here
        };

        window.addEventListener('biflow-add-projection', handleAISuggestion);

        const handleMultipleSuggestions = (e: any) => {
            const movements = e.detail.map((m: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                descripcion: m.descripcion,
                monto: m.monto,
                fecha: m.fecha,
                isProjected: true
            }));
            setProjections(prev => [...prev, ...movements]);
        };

        window.addEventListener('biflow-add-multiple-projections', handleMultipleSuggestions);

        const handleExclusion = (e: any) => {
            const { invoiceId, ids } = e.detail;
            if (ids && Array.isArray(ids)) {
                setExcludedInvoices(prev => [...new Set([...prev, ...ids])]);
            } else if (invoiceId) {
                setExcludedInvoices(prev => [...new Set([...prev, invoiceId])]);
            }
        };

        window.addEventListener('biflow-simulate-exclusion', handleExclusion);

        return () => {
            window.removeEventListener('biflow-add-projection', handleAISuggestion);
            window.removeEventListener('biflow-add-multiple-projections', handleMultipleSuggestions);
            window.removeEventListener('biflow-simulate-exclusion', handleExclusion);
        };
    }, []);

    const projection = TreasuryEngine.projectDailyBalance(
        currentBalance,
        invoices.filter(i => !excludedInvoices.includes(i.id)),
        projections,
        liquidityCushion
    )

    const addProjection = () => {
        if (!newProjected.descripcion || !newProjected.monto || !newProjected.fecha) return

        const movement: ProjectedMovement = {
            id: Math.random().toString(36).substr(2, 9),
            descripcion: newProjected.descripcion,
            monto: newProjected.monto,
            fecha: newProjected.fecha,
            isProjected: true
        }

        setProjections([...projections, movement])
        setIsAdding(false)
        setNewProjected({ descripcion: '', monto: 0, fecha: new Date().toISOString().split('T')[0] })
    }

    const removeProjection = (id: string) => {
        setProjections(projections.filter(d => d.id !== id))
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 space-y-6">
                    <CashFlowChart data={projection} />

                    <Card className="bg-gray-900 border-gray-800">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-800 px-6 py-4">
                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-emerald-500" />
                                Papeles de Trabajo (Proyecciones)
                            </CardTitle>
                            <Button
                                onClick={() => setIsAdding(true)}
                                variant="outline"
                                size="sm"
                                className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                            >
                                <Plus className="w-4 h-4 mr-1" /> Nueva Proyección
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-800 text-xs font-medium text-gray-400 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-6 py-3 sticky top-0 z-20 bg-gray-800">Fecha</th>
                                            <th className="px-6 py-3 sticky top-0 z-20 bg-gray-800">Descripción</th>
                                            <th className="px-6 py-3 text-right sticky top-0 z-20 bg-gray-800">Monto</th>
                                            <th className="px-6 py-3 text-right sticky top-0 z-20 bg-gray-800">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {isAdding && (
                                            <tr className="bg-emerald-500/5 transition-colors">
                                                <td className="px-4 py-3">
                                                    <Input
                                                        type="date"
                                                        value={newProjected.fecha}
                                                        onChange={e => setNewProjected({ ...newProjected, fecha: e.target.value })}
                                                        className="bg-gray-950 border-gray-800 h-8 text-xs text-white [color-scheme:dark]"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Input
                                                        placeholder="Ej: Inversión en Stock"
                                                        value={newProjected.descripcion}
                                                        onChange={e => setNewProjected({ ...newProjected, descripcion: e.target.value })}
                                                        className="bg-gray-950 border-gray-800 h-8 text-xs text-white placeholder:text-gray-600"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={newProjected.monto || ''}
                                                        onChange={e => setNewProjected({ ...newProjected, monto: Number(e.target.value) })}
                                                        className="bg-gray-950 border-gray-800 h-8 text-xs text-right text-white"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button onClick={addProjection} size="sm" className="h-8 px-2 bg-emerald-600 hover:bg-emerald-500">
                                                            <Save className="w-3 h-3" />
                                                        </Button>
                                                        <Button onClick={() => setIsAdding(false)} variant="ghost" size="sm" className="h-8 px-2 text-gray-500">
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {projections.map(d => (
                                            <tr key={d.id} className="hover:bg-gray-800/50 transition-colors">
                                                <td className="px-6 py-4 text-gray-400">
                                                    {new Date(d.fecha).toLocaleDateString('es-AR')}
                                                </td>
                                                <td className="px-6 py-4 text-white font-medium italic">
                                                    {d.descripcion}
                                                    <span className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase tracking-tighter border border-blue-500/20">Proyectado</span>
                                                </td>
                                                <td className={`px-6 py-4 text-right font-bold ${d.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(d.monto)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Button onClick={() => removeProjection(d.id)} variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:text-red-400">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                        {projections.length === 0 && !isAdding && (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-gray-600">
                                                    <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                                    No hay papeles de trabajo registrados. <br /> Agrega una proyección para ver el impacto en tu flujo de caja.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="bg-gray-900 border-gray-800 p-6">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Análisis de Estrés</h4>
                        <div className="space-y-4">
                            <div className="p-3 bg-gray-950 rounded-xl border border-gray-800">
                                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Saldo Final Proyectado</p>
                                <p className={`text-xl font-black ${projection.length > 0 && projection[projection.length - 1].balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {projection.length > 0 ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(projection[projection.length - 1].balance) : '$0'}
                                </p>
                            </div>
                            <div className="p-3 bg-gray-950 rounded-xl border border-gray-800">
                                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Punto más bajo</p>
                                <p className={`text-xl font-black ${Math.min(...projection.map(p => p.balance)) < 0 ? 'text-red-400' : 'text-white'}`}>
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Math.min(...projection.map(p => p.balance)))}
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="bg-gray-900 border-gray-800 overflow-hidden">
                        <div className="p-4 border-b border-gray-800 bg-gray-800/20">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center justify-between">
                                SIMULACIÓN: EXCLUSIONES
                                {excludedInvoices.length > 0 && (
                                    <button
                                        onClick={() => setExcludedInvoices([])}
                                        className="text-emerald-500 hover:text-emerald-400 normal-case font-bold"
                                    >
                                        Restaurar todo
                                    </button>
                                )}
                            </h4>
                        </div>
                        <div className="p-2 space-y-1 max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                            {invoices
                                .filter(i => i.monto_pendiente > 0)
                                .sort((a, b) => b.monto_pendiente - a.monto_pendiente)
                                .map(inv => {
                                    const isExcluded = excludedInvoices.includes(inv.id)
                                    return (
                                        <div
                                            key={inv.id}
                                            onClick={() => setExcludedInvoices(prev =>
                                                isExcluded ? prev.filter(id => id !== inv.id) : [...prev, inv.id]
                                            )}
                                            className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between gap-2 ${isExcluded
                                                ? 'bg-red-500/5 border-red-500/20 opacity-50'
                                                : 'bg-gray-950 border-gray-800 hover:border-emerald-500/30'
                                                }`}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-bold text-gray-200 truncate">{inv.razon_social_entidad}</p>
                                                <p className="text-[9px] text-gray-500">Vence: {new Date(inv.fecha_vencimiento).toLocaleDateString('es-AR')}</p>
                                            </div>
                                            <p className={`text-[10px] font-black whitespace-nowrap ${isExcluded ? 'text-gray-500 line-through' : 'text-white'}`}>
                                                ${inv.monto_pendiente.toLocaleString('es-AR')}
                                            </p>
                                        </div>
                                    )
                                })}
                        </div>
                    </Card>

                    <Card className="bg-emerald-600/5 border-emerald-500/20 p-6">
                        <h4 className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            BiFLOW Advice
                        </h4>
                        <p className="text-sm text-gray-300 leading-relaxed italic">
                            "Tu liquidez proyectada muestra estabilidad. Sin embargo, las proyecciones agregadas podrían reducir tu margen de seguridad operativo en la tercera semana."
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    )
}
