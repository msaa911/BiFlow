'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { LiquidityEngine, StressTestResponse } from '@/lib/liquidity-engine'

interface StressTestModalProps {
    isOpen: boolean
    onClose: () => void
    currentBalance: number
    initialBatch?: { descripcion: string, monto: number, fecha: string }[]
}

export function StressTestModal({ isOpen, onClose, currentBalance, initialBatch }: StressTestModalProps) {
    const [payments, setPayments] = useState<{ id: string, description: string, amount: number, date: string }[]>(
        initialBatch?.map(t => ({
            id: Math.random().toString(36).substr(2, 9),
            description: t.descripcion,
            amount: t.monto,
            date: t.fecha
        })) || [
            { id: '1', description: 'Pago Sueldos', amount: 0, date: new Date().toISOString().split('T')[0] }
        ]
    )
    const [overdraftLimit, setOverdraftLimit] = useState(0)
    const [inflation, setInflation] = useState(0) // Monthly inflation %
    const [result, setResult] = useState<StressTestResponse | null>(null)

    const addPayment = () => {
        setPayments([...payments, {
            id: Math.random().toString(36).substr(2, 9),
            description: '',
            amount: 0,
            date: new Date().toISOString().split('T')[0]
        }])
    }

    const removePayment = (id: string) => {
        setPayments(payments.filter(p => p.id !== id))
    }

    const updatePayment = (id: string, field: string, value: any) => {
        setPayments(payments.map(p => p.id === id ? { ...p, [field]: value } : p))
    }

    const runSimulation = () => {
        const res = LiquidityEngine.simulateStressTest(currentBalance, payments, overdraftLimit, inflation / 100)
        setResult(res)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl bg-gray-950 border-gray-800 text-white">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black italic tracking-tighter">SIMULADOR DE STRESS TEST</DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Proyecta el impacto de tus próximos pagos masivos en la liquidez de tu empresa.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    {/* Input Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Pagos Planificados</Label>
                            <Button variant="outline" size="sm" onClick={addPayment} className="h-7 px-2 border-gray-700 bg-gray-900 text-[10px] font-bold uppercase tracking-tighter">
                                <Plus className="w-3 h-3 mr-1" /> Agregar Pago
                            </Button>
                        </div>

                        <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {payments.map((p) => (
                                <div key={p.id} className="flex gap-2 items-end">
                                    <div className="flex-1 space-y-1">
                                        <Input
                                            placeholder="Descripción"
                                            value={p.description}
                                            onChange={(e) => updatePayment(p.id, 'description', e.target.value)}
                                            className="bg-gray-900 border-gray-800 h-9 text-sm"
                                        />
                                    </div>
                                    <div className="w-24 space-y-1">
                                        <Input
                                            type="number"
                                            placeholder="Monto"
                                            value={p.amount || ''}
                                            onChange={(e) => updatePayment(p.id, 'amount', Number(e.target.value) || 0)}
                                            className="bg-gray-900 border-gray-800 h-9 text-sm text-right"
                                        />
                                    </div>
                                    <div className="w-32 space-y-1">
                                        <Input
                                            type="date"
                                            value={p.date}
                                            onChange={(e) => updatePayment(p.id, 'date', e.target.value)}
                                            className="bg-gray-900 border-gray-800 h-9 text-sm"
                                        />
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => removePayment(p.id)} className="h-9 w-9 text-gray-500 hover:text-red-400 hover:bg-red-400/10">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Límite Descubierto ($)</Label>
                            <Input
                                type="number"
                                value={overdraftLimit}
                                onChange={(e) => setOverdraftLimit(parseFloat(e.target.value))}
                                className="bg-gray-900 border-gray-800"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">Inflación Mensual (%)</Label>
                            <Input
                                type="number"
                                step="0.1"
                                value={inflation}
                                onChange={(e) => setInflation(parseFloat(e.target.value))}
                                className="bg-gray-900 border-gray-800"
                            />
                        </div>
                        <div className="flex items-end">
                            <Button onClick={runSimulation} className="w-full bg-blue-600 hover:bg-blue-500 font-bold uppercase tracking-tighter">
                                Simular
                            </Button>
                        </div>
                    </div>

                    {/* Result Section */}
                    {result && (
                        <div className={`rounded-2xl p-4 border transition-all duration-500 ${result.alertLevel === 'high' ? 'bg-red-500/10 border-red-500/50' :
                            result.alertLevel === 'medium' ? 'bg-amber-500/10 border-amber-500/50' :
                                'bg-emerald-500/10 border-emerald-500/50'
                            }`}>
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-xl ${result.alertLevel === 'high' ? 'bg-red-500/20 text-red-400' :
                                    result.alertLevel === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                                        'bg-emerald-500/20 text-emerald-400'
                                    }`}>
                                    {result.alertLevel === 'high' ? <TrendingDown className="w-6 h-6" /> :
                                        result.alertLevel === 'medium' ? <AlertTriangle className="w-6 h-6" /> :
                                            <CheckCircle2 className="w-6 h-6" />}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-lg mb-1">
                                        {result.alertLevel === 'high' ? 'ALERTA: Riesgo de Descubierto' :
                                            result.alertLevel === 'medium' ? 'Atención: Saldo Ajustado' :
                                                'Liquidez Garantizada'}
                                    </h4>
                                    <p className="text-sm opacity-80 mb-3">
                                        {result.alertLevel === 'high'
                                            ? `Tu saldo caería a $${result.lowestBalance.toLocaleString()} superando tu límite de descubierto.`
                                            : `Tu saldo mínimo proyectado es de $${result.lowestBalance.toLocaleString()}.`}
                                    </p>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-black/20 rounded-lg p-2 text-center">
                                            <div className="text-[10px] uppercase font-bold text-gray-400">Días de supervivencia</div>
                                            <div className="text-xl font-black">
                                                {result.survivalDays >= 30 ? '∞' : `${result.survivalDays} Días`}
                                            </div>
                                        </div>
                                        <div className="bg-black/20 rounded-lg p-2 text-center">
                                            <div className="text-[10px] uppercase font-bold text-gray-400">Saldo Final</div>
                                            <div className="text-xl font-black">
                                                ${result.projection[result.projection.length - 1]?.balance?.toLocaleString() || '0'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                        <Button
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent('biflow-add-multiple-projections', {
                                                    detail: result.projection.map((p, i) => {
                                                        const original = result.projection[i - 1]?.balance || currentBalance
                                                        return {
                                                            descripcion: `Simulación Stress: ${payments[i]?.description || 'Pago'}`,
                                                            monto: p.balance - original,
                                                            fecha: p.date
                                                        }
                                                    })
                                                }));
                                                onClose();
                                            }}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold uppercase h-8"
                                        >
                                            Aplicar a Proyecciones
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white">Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
