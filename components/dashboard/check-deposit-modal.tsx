'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Building2, Calendar, Wallet } from 'lucide-react'

interface CheckDepositModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    orgId: string
    selectedCheckIds: string[]
    totalAmount: number
    onSuccess: () => void
}

export function CheckDepositModal({
    open,
    onOpenChange,
    orgId,
    selectedCheckIds,
    totalAmount,
    onSuccess
}: CheckDepositModalProps) {
    const [loading, setLoading] = useState(false)
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [selectedAccountId, setSelectedAccountId] = useState<string>('')
    const supabase = createClient()

    useEffect(() => {
        if (open && orgId) {
            fetchBankAccounts()
        }
    }, [open, orgId])

    async function fetchBankAccounts() {
        const { data, error } = await supabase
            .from('cuentas_bancarias')
            .select('*')
            .eq('organization_id', orgId)

        if (error) {
            console.error('Error fetching bank accounts:', error)
            toast.error('Error al cargar cuentas bancarias')
        } else {
            setBankAccounts(data || [])
            if (data && data.length > 0) {
                setSelectedAccountId(data[0].id)
            }
        }
    }

    const handleConfirm = async () => {
        if (!selectedAccountId) {
            toast.error('Por favor seleccione una cuenta bancaria')
            return
        }

        setLoading(true)
        try {
            // Update all selected checks to 'depositado'
            // We store the bank account ID in metadata if no column exists
            const { error } = await supabase
                .from('instrumentos_pago')
                .update({
                    estado: 'depositado',
                    metadata: {
                        deposito_banco_id: selectedAccountId,
                        fecha_deposito: new Date().toISOString()
                    }
                })
                .in('id', selectedCheckIds)

            if (error) throw error

            toast.success(`Lote de ${selectedCheckIds.length} cheques depositado con éxito`)
            onSuccess()
            onOpenChange(false)
        } catch (err: any) {
            console.error('Error depositing checks:', err)
            toast.error('Error al procesar el depósito')
        } finally {
            setLoading(false)
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-gray-950/95 backdrop-blur-2xl border-white/10 text-white sm:max-w-[440px] p-0 overflow-hidden shadow-2xl shadow-emerald-500/10">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
                
                <div className="relative p-8 space-y-8">
                    <DialogHeader className="space-y-2">
                        <DialogTitle className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                                <Building2 className="w-5 h-5 text-emerald-500" />
                            </div>
                            Depósito de Cheques
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 text-sm leading-relaxed">
                            Confirme la cuenta bancaria donde se acreditarán los fondos del lote seleccionado.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/10 p-6 group transition-all hover:bg-white/[0.05]">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16 pointer-events-none" />
                            <div className="flex justify-between items-end relative z-10">
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">Total a Depositar</p>
                                    <p className="text-3xl font-black text-white tracking-tight">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalAmount)}
                                    </p>
                                </div>
                                <div className="h-10 w-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
                                    <Wallet className="w-5 h-5 text-emerald-500" />
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                <span className="text-white bg-white/5 px-2 py-0.5 rounded-md border border-white/10">{selectedCheckIds.length}</span>
                                Cheques Seleccionados
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Cuenta Bancaria Destino</Label>
                            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus:ring-emerald-500/50 hover:bg-white/[0.08] transition-all">
                                    <SelectValue placeholder="Seleccione una cuenta" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900/95 backdrop-blur-xl border-white/10 text-white">
                                    {bankAccounts.map((acc) => (
                                        <SelectItem key={acc.id} value={acc.id} className="focus:bg-emerald-500/10 focus:text-emerald-400 py-3 rounded-lg mx-1 my-0.5 transition-colors cursor-pointer">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-black text-xs uppercase tracking-tight">{acc.banco_nombre}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-gray-500">{acc.moneda}</span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-700" />
                                                    <span className="text-[10px] font-mono text-gray-400">ID: {acc.id.slice(0, 8)}</span>
                                                </div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Fecha de Operación</Label>
                            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-gray-300 transition-all hover:bg-white/[0.08]">
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 text-gray-400">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                <span className="font-bold uppercase tracking-wider">
                                    {new Date().toLocaleDateString('es-AR', { dateStyle: 'long' })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pt-4 border-t border-white/5">
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 h-12 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 font-black uppercase text-[10px] tracking-widest transition-all"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={loading || !selectedAccountId}
                            className="flex-[1.5] h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                    <span>Procesando</span>
                                </div>
                            ) : (
                                'Confirmar Depósito'
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
