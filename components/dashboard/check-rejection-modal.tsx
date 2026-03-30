'use client'

import { useState, useEffect } from 'react'
import { getBankAccountsAction, rejectCheckAction } from '@/app/actions/banks'
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
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { AlertCircle, Ban, Landmark, Receipt } from 'lucide-react'

interface CheckRejectionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    orgId: string
    check: any | null
    onSuccess: () => void
    transactionId?: string // Link to the bank debit if coming from reconciliation
}

export function CheckRejectionModal({
    open,
    onOpenChange,
    orgId,
    check,
    onSuccess,
    transactionId
}: CheckRejectionModalProps) {
    const [loading, setLoading] = useState(false)
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [selectedAccountId, setSelectedAccountId] = useState<string>('')
    const [feeAmount, setFeeAmount] = useState<string>('0')

    useEffect(() => {
        if (open && orgId) {
            fetchBankAccounts()
        }
    }, [open, orgId])

    async function fetchBankAccounts() {
        const { data, error } = await getBankAccountsAction()

        if (error) {
            console.error('Error fetching bank accounts:', error)
            toast.error('Error al cargar cuentas bancarias')
        } else {
            setBankAccounts(data || [])
            if (data && data.length > 0) {
                // Default to the bank that was used for deposit if available in metadata
                const lastBankId = check?.metadata?.deposito_banco_id
                setSelectedAccountId(lastBankId || data[0].id)
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
            const { data, error } = await rejectCheckAction({
                checkId: check.id,
                feeAmount: Number(feeAmount) || 0,
                transactionId: transactionId || null
            })

            if (error) throw new Error(error)
            if (!data.success) throw new Error(data.error || 'Error desconocido')

            toast.success(`Cheque rechazado con éxito. Se reactivaron ${data.affected_invoices} facturas y se registró el circuito administrativo.`)
            onSuccess()
            onOpenChange(false)
        } catch (err: any) {
            console.error('Error rejecting check:', err)
            toast.error('Error al procesar el rechazo: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    if (!check) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-gray-950/95 backdrop-blur-2xl border-white/10 text-white sm:max-w-[440px] p-0 overflow-hidden shadow-2xl shadow-red-500/10">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-transparent pointer-events-none" />
                
                <div className="relative p-8 space-y-8">
                    <DialogHeader className="space-y-2">
                        <DialogTitle className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-lg shadow-red-500/10">
                                <Ban className="w-5 h-5 text-red-500" />
                            </div>
                            Gestión de Rechazo
                        </DialogTitle>
                        <DialogDescription className="text-gray-400 text-sm leading-relaxed">
                            Registre el rechazo bancario y asocie los gastos administrativos correspondientes.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/10 p-6 group transition-all hover:bg-white/[0.05]">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl -mr-16 -mt-16 pointer-events-none" />
                            <div className="flex justify-between items-end relative z-10">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="text-[10px] uppercase font-black tracking-widest text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]">Monto Rechazado</p>
                                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-gray-400 font-mono">#{check.detalle_referencia}</span>
                                    </div>
                                    <p className="text-3xl font-black text-white tracking-tight">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(check.monto)}
                                    </p>
                                </div>
                                <div className="h-10 w-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                                    <Receipt className="w-5 h-5 text-red-500" />
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/5 text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                <Landmark className="w-3 h-3" />
                                {check.banco || 'Banco No Especificado'}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-3">
                                <Label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Comisión Bancaria / Gasto ($)</Label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                        <span className="text-sm font-bold">$</span>
                                    </div>
                                    <Input
                                        type="number"
                                        value={feeAmount}
                                        onChange={(e) => setFeeAmount(e.target.value)}
                                        className="bg-white/5 border-white/10 text-white h-12 pl-8 rounded-xl focus:ring-red-500/40 focus:border-red-500/50 hover:bg-white/[0.08] transition-all font-mono text-lg"
                                        placeholder="0.00"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 italic ml-1">Se generará un egreso de tesorería por este valor.</p>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Cuenta de Cargo</Label>
                                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl focus:ring-red-500/40 hover:bg-white/[0.08] transition-all">
                                        <SelectValue placeholder="Seleccione una cuenta" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-900/95 backdrop-blur-xl border-white/10 text-white">
                                        {bankAccounts.map((acc) => (
                                            <SelectItem key={acc.id} value={acc.id} className="focus:bg-red-500/10 focus:text-red-400 py-3 rounded-lg mx-1 my-0.5 transition-colors cursor-pointer">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-black text-xs uppercase tracking-tight">{acc.banco_nombre}</span>
                                                    <span className="text-[10px] font-bold text-gray-500">{acc.moneda}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl relative overflow-hidden group">
                            <div className="absolute inset-0 bg-amber-500/5 translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 relative z-10" />
                            <p className="text-[10px] text-amber-200/70 font-medium leading-relaxed relative z-10 uppercase tracking-tighter">
                                El cheque saldrá de la liquidez proyectada. Deberá gestionar el recupero manual con el librador.
                            </p>
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
                            className="flex-[1.5] h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-red-500/20 active:scale-[0.98] disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    <span>Procesando</span>
                                </div>
                            ) : (
                                'Confirmar Rechazo'
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
