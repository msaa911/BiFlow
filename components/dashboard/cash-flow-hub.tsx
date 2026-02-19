'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Calculator, Save, AlertCircle } from 'lucide-react'
import { TreasuryEngine, SimulationMovement, Invoice } from '@/lib/treasury-engine'
import { CashFlowChart } from './cash-flow-chart'

interface CashFlowHubProps {
    invoices: Invoice[]
    currentBalance: number
}

export function CashFlowHub({ invoices, currentBalance }: CashFlowHubProps) {
    const [drafts, setDrafts] = useState<SimulationMovement[]>([])
    const [isAdding, setIsAdding] = useState(false)
    const [newDraft, setNewDraft] = useState<Partial<SimulationMovement>>({
        descripcion: '',
        monto: 0,
        fecha: new Date().toISOString().split('T')[0]
    })

    const projection = TreasuryEngine.projectDailyBalance(currentBalance, invoices, drafts)

    const addDraft = () => {
        if (!newDraft.descripcion || !newDraft.monto || !newDraft.fecha) return

        const movement: SimulationMovement = {
            id: Math.random().toString(36).substr(2, 9),
            descripcion: newDraft.descripcion,
            monto: newDraft.monto,
            fecha: newDraft.fecha,
            isDraft: true
        }

        setDrafts([...drafts, movement])
        setIsAdding(false)
        setNewDraft({ descripcion: '', monto: 0, fecha: new Date().toISOString().split('T')[0] })
    }

    const removeDraft = (id: string) => {
        setDrafts(drafts.filter(d => d.id !== id))
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
                                Movimientos Simulados (Draft Mode)
                            </CardTitle>
                            <Button
                                onClick={() => setIsAdding(true)}
                                variant="outline"
                                size="sm"
                                className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                            >
                                <Plus className="w-4 h-4 mr-1" /> Simular Movimiento
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
                                                        value={newDraft.fecha}
                                                        onChange={e => setNewDraft({ ...newDraft, fecha: e.target.value })}
                                                        className="bg-gray-950 border-gray-800 h-8 text-xs"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Input
                                                        placeholder="Ej: Inversión en Stock"
                                                        value={newDraft.descripcion}
                                                        onChange={e => setNewDraft({ ...newDraft, descripcion: e.target.value })}
                                                        className="bg-gray-950 border-gray-800 h-8 text-xs text-white"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={newDraft.monto || ''}
                                                        onChange={e => setNewDraft({ ...newDraft, monto: Number(e.target.value) })}
                                                        className="bg-gray-950 border-gray-800 h-8 text-xs text-right text-white"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button onClick={addDraft} size="sm" className="h-8 px-2 bg-emerald-600 hover:bg-emerald-500">
                                                            <Save className="w-3 h-3" />
                                                        </Button>
                                                        <Button onClick={() => setIsAdding(false)} variant="ghost" size="sm" className="h-8 px-2 text-gray-500">
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {drafts.map(d => (
                                            <tr key={d.id} className="hover:bg-gray-800/50 transition-colors">
                                                <td className="px-6 py-4 text-gray-400">
                                                    {new Date(d.fecha).toLocaleDateString('es-AR')}
                                                </td>
                                                <td className="px-6 py-4 text-white font-medium italic">
                                                    {d.descripcion}
                                                    <span className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase tracking-tighter border border-blue-500/20">Draft</span>
                                                </td>
                                                <td className={`px-6 py-4 text-right font-bold ${d.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(d.monto)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Button onClick={() => removeDraft(d.id)} variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:text-red-400">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                        {drafts.length === 0 && !isAdding && (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-gray-600">
                                                    <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                                    No hay movimientos simulados. <br /> Agrega uno para ver el impacto en tu flujo de caja.
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
                            "Tu liquidez proyectada muestra estabilidad. Sin embargo, los borradores agregados podrían reducir tu margen de seguridad operativo en la tercera semana."
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    )
}
