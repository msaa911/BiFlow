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
}

export function CheckRejectionModal({
    open,
    onOpenChange,
    orgId,
    check,
    onSuccess
}: CheckRejectionModalProps) {
    const [loading, setLoading] = useState(false)
    const [bankAccounts, setBankAccounts] = useState<any[]>([])
    const [selectedAccountId, setSelectedAccountId] = useState<string>('')
    const [feeAmount, setFeeAmount] = useState<string>('0')
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
            // 1. Update check status to 'rechazado'
            const { error: checkError } = await supabase
                .from('instrumentos_pago')
                .update({
                    estado: 'rechazado',
                    metadata: {
                        ...check?.metadata,
                        fecha_rechazo: new Date().toISOString(),
                        banco_rechazo_id: selectedAccountId,
                        comision_rechazo: Number(feeAmount)
                    }
                })
                .eq('id', check.id)

            if (checkError) throw checkError

            // 2. Create Bank Expense (movimientos_tesoreria) if fee > 0
            if (Number(feeAmount) > 0) {
                const { error: movementError } = await supabase
                    .from('movimientos_tesoreria')
                    .insert({
                        organization_id: orgId,
                        tipo: 'egreso',
                        monto: Number(feeAmount),
                        moneda: 'ARS',
                        fecha: new Date().toISOString().split('T')[0],
                        descripcion: `Gasto Bancario: Rechazo Cheque ${check.referencia || 'S/N'}`,
                        categoria: 'Gastos Bancarios',
                        metodo_pago: 'transferencia',
                        estado: 'completado',
                        metadata: {
                            check_id: check.id,
                            tipo_gasto: 'comision_rechazo',
                            cuenta_bancaria_id: selectedAccountId
                        }
                    })

                if (movementError) throw movementError
            }

            toast.success(`Cheque marcado como RECHAZADO. Se registró el gasto bancario.`)
            onSuccess()
            onOpenChange(false)
        } catch (err: any) {
            console.error('Error rejecting check:', err)
            toast.error('Error al procesar el rechazo')
        } finally {
            setLoading(false)
        }
    }

    if (!check) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-500">
                        <Ban className="w-5 h-5" />
                        Gestionar Rechazo de Cheque
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Se marcará el cheque como rechazado y se podrá imputar el gasto bancario.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] uppercase font-bold text-red-400">Valor a Recuperar</span>
                            <span className="text-xs font-mono text-gray-500">#{check.referencia}</span>
                        </div>
                        <p className="text-2xl font-bold text-white">
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(check.monto)}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1 uppercase">{check.banco || 'Banco No Especificado'}</p>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-400 uppercase">Gasto Bancario / Comisión ($)</Label>
                            <div className="relative">
                                <Landmark className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                                <Input
                                    type="number"
                                    value={feeAmount}
                                    onChange={(e) => setFeeAmount(e.target.value)}
                                    className="bg-gray-900 border-gray-800 pl-9 text-sm h-11"
                                    placeholder="0.00"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 italic">Este monto se restará del saldo de la cuenta seleccionada.</p>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-gray-400 uppercase">Cuenta de Cargo</Label>
                            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                                <SelectTrigger className="bg-gray-900 border-gray-800 text-white h-11">
                                    <SelectValue placeholder="Seleccione una cuenta" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900 border-gray-800 text-white">
                                    {bankAccounts.map((acc) => (
                                        <SelectItem key={acc.id} value={acc.id} className="focus:bg-gray-800 focus:text-white">
                                            {acc.banco_nombre}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                        <p className="text-[10px] text-amber-200/70">
                            El cheque quedará fuera de la liquidez proyectada hasta que se registre un nuevo movimiento de recupero o refinanciación.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-gray-400 hover:text-white hover:bg-gray-800"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={loading || !selectedAccountId}
                        className="bg-red-600 hover:bg-red-500 text-white px-8 h-10 font-bold"
                    >
                        {loading ? 'Procesando...' : 'Confirmar Rechazo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
