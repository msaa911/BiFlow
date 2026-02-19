'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Calculator, Save, AlertCircle } from 'lucide-react'
import { TreasuryEngine, ProjectedMovement, Invoice } from '@/lib/treasury-engine'
import { CashFlowChart } from './cash-flow-chart'

interface CashFlowHubProps {
    invoices: Invoice[]
    currentBalance: number
}

export function CashFlowHub({ invoices, currentBalance }: CashFlowHubProps) {
    const [projections, setProjections] = useState<ProjectedMovement[]>([])
    const [isAdding, setIsAdding] = useState(false)
    const [newProjected, setNewProjected] = useState<Partial<ProjectedMovement>>({
        descripcion: '',
        monto: 0,
        fecha: new Date().toISOString().split('T')[0]
    })

    const projection = TreasuryEngine.projectDailyBalance(currentBalance, invoices, projections)

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
        <div className="space-y-6 animate-in fade-in duration-500">
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
                                    <thead className="bg-gray-800/50 text-xs uppercase font-medium text-gray-500">
                                        <tr>
                                            <th className="px-6 py-3">Fecha</th>
                                            <th className="px-6 py-3">Descripción</th>
                                            <th className="px-6 py-3 text-right">Monto</th>
                                            <th className="px-6 py-3 text-right">Acción</th>
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
                                                        className="bg-gray-950 border-gray-800 h-8 text-xs"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Input
                                                        placeholder="Ej: Inversión en Stock"
                                                        value={newProjected.descripcion}
                                                        onChange={e => setNewProjected({ ...newProjected, descripcion: e.target.value })}
                                                        className="bg-gray-950 border-gray-800 h-8 text-xs text-white"
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
                                <p className={`text-xl font-black ${projection[29].balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(projection[29].balance)}
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
