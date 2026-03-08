'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, Calculator, Save, AlertCircle, ShieldCheck, Zap, TrendingDown, TrendingUp, Target, CalendarDays, BarChart3 } from 'lucide-react'
import { TreasuryEngine, ProjectedMovement, Invoice } from '@/lib/treasury-engine'
import { CashFlowChart } from './cash-flow-chart'
import { MonthlyCashFlow } from './monthly-cash-flow'

interface CashFlowHubProps {
    invoices: Invoice[]
    currentBalance: number
    liquidityCushion?: number
}

export function CashFlowHub({ invoices, currentBalance, liquidityCushion = 0 }: CashFlowHubProps) {
    const [projections, setProjections] = useState<ProjectedMovement[]>([])
    const [excludedInvoices, setExcludedInvoices] = useState<string[]>([])
    const [isAdding, setIsAdding] = useState(false)
    const [horizon, setHorizon] = useState<'30' | '60' | '90' | 'mensual'>('30')
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

    const dailyProjection = useMemo(() => {
        if (horizon === 'mensual') return [];
        return TreasuryEngine.projectDailyBalance(
            currentBalance,
            invoices.filter(i => !excludedInvoices.includes(i.id)),
            projections,
            liquidityCushion,
            parseInt(horizon)
        )
    }, [currentBalance, invoices, excludedInvoices, projections, liquidityCushion, horizon]);

    const gridData = useMemo(() => {
        const isMonthly = horizon === 'mensual';
        const granularity = isMonthly ? 'monthly' : 'daily';
        const hValue = isMonthly ? 12 : parseInt(horizon);

        return TreasuryEngine.getCashFlowGrid(
            currentBalance,
            invoices.filter(i => !excludedInvoices.includes(i.id)),
            [],
            projections,
            granularity,
            hValue
        );
    }, [currentBalance, invoices, excludedInvoices, projections, horizon]);

    // --- Financial Health Analytics (based on daily projection for the selected horizon) ---
    const lowestPoint = dailyProjection.length > 0 ? Math.min(...dailyProjection.map(p => p.balance)) : currentBalance;
    const isBelowBufferAtAnyPoint = dailyProjection.some(p => p.balance < liquidityCushion);
    const criticalDate = dailyProjection.find(p => p.balance < liquidityCushion)?.date;

    let daysOfCoverage = dailyProjection.length;
    const firstLowIndex = dailyProjection.findIndex(p => p.balance < liquidityCushion);
    if (firstLowIndex !== -1) {
        daysOfCoverage = firstLowIndex;
    }

    const safetyMargin = liquidityCushion > 0 ? (currentBalance / liquidityCushion) : 100;

    const riskLevel = isBelowBufferAtAnyPoint
        ? (lowestPoint < 0 ? 'CRÍTICO' : 'MEDIO')
        : 'BAJO';

    const riskColor = riskLevel === 'CRÍTICO' ? 'text-red-500' : riskLevel === 'MEDIO' ? 'text-amber-500' : 'text-emerald-500';
    const riskBg = riskLevel === 'CRÍTICO' ? 'bg-red-500/10' : riskLevel === 'MEDIO' ? 'bg-amber-500/10' : 'bg-emerald-500/10';

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

    const renderExclusionList = (list: Invoice[], excluded: string[], setExcluded: any, isStress: boolean) => {
        return list
            .filter(i => i.monto_pendiente > 0)
            .sort((a, b) => b.monto_pendiente - a.monto_pendiente)
            .map(inv => {
                const isExcluded = excluded.includes(inv.id)
                return (
                    <div
                        key={inv.id}
                        onClick={() => setExcluded((prev: string[]) =>
                            isExcluded ? prev.filter(id => id !== inv.id) : [...prev, inv.id]
                        )}
                        className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between gap-2 mb-1 ${isExcluded
                            ? (isStress ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30')
                            : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                            }`}
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                                <span className={`text-[11px] font-bold truncate ${isExcluded ? (isStress ? 'text-red-400' : 'text-emerald-400') : 'text-white'}`}>
                                    {inv.razon_social_entidad || inv.razon_social_socio}
                                </span>
                                {isExcluded && (
                                    <span className="shrink-0 animate-pulse">
                                        {isStress ? <TrendingDown className="w-2.5 h-2.5 text-red-500" /> : <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />}
                                    </span>
                                )}
                            </div>
                            <p className="text-[9px] text-gray-500">Vence: {new Date(inv.fecha_vencimiento).toLocaleDateString('es-AR')}</p>
                        </div>
                        <div className="text-right">
                            <p className={`text-[10px] font-black whitespace-nowrap ${isExcluded ? 'text-gray-400 line-through' : 'text-white'}`}>
                                ${inv.monto_pendiente.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                            </p>
                            {isExcluded && (
                                <p className={`text-[8px] font-bold uppercase tracking-tighter ${isStress ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {isStress ? '- Estrés' : '+ Alivio'}
                                </p>
                            )}
                        </div>
                    </div>
                )
            })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-gray-950 border border-gray-800 p-2 rounded-xl">
                <div className="flex items-center gap-2 pl-2">
                    <CalendarDays className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Horizonte Temporal</span>
                </div>
                <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1">
                    {(['30', '60', '90', 'mensual'] as const).map((h) => (
                        <button
                            key={h}
                            onClick={() => setHorizon(h)}
                            className={`
                                px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all
                                ${horizon === h
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                                }
                            `}
                        >
                            {h === 'mensual' ? 'Mensual' : `${h} Días`}
                        </button>
                    ))}
                </div>
            </div>

            {horizon === 'mensual' ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <MonthlyCashFlow data={gridData} />
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-3 animate-in fade-in duration-500">
                    <div className="md:col-span-2 space-y-6">
                        <CashFlowChart data={dailyProjection} />

                        <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                            <MonthlyCashFlow data={gridData} />
                        </div>

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
                        <Card className="bg-gray-900 border-gray-800 p-6 overflow-hidden relative">
                            <div className={`absolute top-0 right-0 p-3 ${riskBg} rounded-bl-2xl border-l border-b border-gray-800 animate-pulse`}>
                                <p className={`text-[9px] font-black tracking-tighter ${riskColor}`}>{riskLevel}</p>
                            </div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Salud Financiera</h4>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 bg-gray-950 rounded-xl border border-gray-800">
                                    <div className={`p-2 rounded-lg ${riskBg}`}>
                                        <ShieldCheck className={`w-4 h-4 ${riskColor}`} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Cobertura ({horizon}d)</p>
                                        <p className="text-lg font-black text-white">{daysOfCoverage} Días</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-gray-950 rounded-xl border border-gray-800">
                                        <p className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
                                            <Target className="w-2.5 h-2.5" />
                                            Mínimo
                                        </p>
                                        <p className={`text-md font-black ${lowestPoint < liquidityCushion ? 'text-red-400' : 'text-white'}`}>
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(lowestPoint)}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-gray-950 rounded-xl border border-gray-800">
                                        <p className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
                                            <Zap className="w-2.5 h-2.5" />
                                            Margen
                                        </p>
                                        <p className="text-md font-black text-white">
                                            {safetyMargin.toFixed(1)}x
                                        </p>
                                    </div>
                                </div>

                                {isBelowBufferAtAnyPoint && (
                                    <div className="p-3 bg-red-500/5 rounded-xl border border-red-500/20 flex items-center gap-2 animate-in slide-in-from-top-2">
                                        <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                                        <p className="text-[10px] text-red-300">
                                            Riesgo de tocar fondo el <span className="font-bold">{new Date(criticalDate!).toLocaleDateString('es-AR')}</span>.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card className="bg-gray-900 border-gray-800 overflow-hidden min-h-[400px]">
                            <Tabs defaultValue="egresos" className="w-full">
                                <div className="p-4 border-b border-gray-800 bg-gray-800/20 flex items-center justify-between">
                                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest shrink-0">
                                        Simulación: Exclusiones
                                    </h4>
                                    <TabsList className="bg-gray-950 border border-gray-800 p-0.5 h-7">
                                        <TabsTrigger value="ingresos" className="text-[9px] px-2 h-6 rounded-md data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">Ventas</TabsTrigger>
                                        <TabsTrigger value="egresos" className="text-[9px] px-2 h-6 rounded-md data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">Compras</TabsTrigger>
                                    </TabsList>
                                </div>

                                <TabsContent value="ingresos" className="m-0 p-2 space-y-1 max-h-[350px] overflow-y-auto custom-scrollbar">
                                    <div className="px-2 py-1 mb-2 bg-red-500/5 rounded border border-red-500/10">
                                        <p className="text-[9px] text-red-300 italic">Estresa el flujo: ¿Qué pasa si no cobras esto?</p>
                                    </div>
                                    {renderExclusionList(invoices.filter(i => i.tipo === 'factura_venta'), excludedInvoices, setExcludedInvoices, true)}
                                </TabsContent>

                                <TabsContent value="egresos" className="m-0 p-2 space-y-1 max-h-[350px] overflow-y-auto custom-scrollbar">
                                    <div className="px-2 py-1 mb-2 bg-emerald-500/5 rounded border border-emerald-500/10">
                                        <p className="text-[9px] text-emerald-300 italic">Alivia el flujo: ¿Qué pasa si postergas esto?</p>
                                    </div>
                                    {renderExclusionList(invoices.filter(i => i.tipo === 'factura_compra'), excludedInvoices, setExcludedInvoices, false)}
                                </TabsContent>
                            </Tabs>

                            {excludedInvoices.length > 0 && (
                                <div className="p-2 border-t border-gray-800 bg-gray-950">
                                    <Button
                                        onClick={() => setExcludedInvoices([])}
                                        variant="ghost"
                                        className="w-full text-[10px] h-7 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/5 font-bold"
                                    >
                                        Restaurar todas las simulaciones
                                    </Button>
                                </div>
                            )}
                        </Card>

                        <Card className={`${riskBg} border-emerald-500/20 p-6`}>
                            <h4 className={`text-xs font-bold ${riskColor} uppercase tracking-widest mb-2 flex items-center gap-2`}>
                                BiFLOW Advice
                            </h4>
                            <p className="text-sm text-gray-300 leading-relaxed italic">
                                {riskLevel === 'BAJO' && `"Tu liquidez proyectada es excelente. Tienes una cobertura de ${daysOfCoverage} días y un margen de seguridad de ${safetyMargin.toFixed(1)} veces sobre tu colchón."`}
                                {riskLevel === 'MEDIO' && `"Atención: Tu flujo de caja se acercará a la zona de estrés el día ${new Date(criticalDate!).toLocaleDateString('es-AR')}. Considera postergar egresos no esenciales."`}
                                {riskLevel === 'CRÍTICO' && `"ALERTA: Se proyecta un déficit de caja para el día ${new Date(criticalDate!).toLocaleDateString('es-AR')}. Es urgente revisar facturas por cobrar o inyectar capital."`}
                            </p>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    )
}
