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
            <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2 text-blue-400">
                        <Building2 className="w-5 h-5" />
                        Depósito Masivo de Cheques
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Confirme la cuenta bancaria donde se depositará el lote.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex justify-between items-center">
                        <div>
                            <p className="text-[10px] uppercase font-bold text-blue-400">Total a Depositar</p>
                            <p className="text-2xl font-bold text-white">
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalAmount)}
                            </p>
                        </div>
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <Wallet className="w-6 h-6 text-blue-400" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-gray-400 uppercase">Cuenta Bancaria Destino</Label>
                        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                            <SelectTrigger className="bg-gray-900 border-gray-800 text-white h-11">
                                <SelectValue placeholder="Seleccione una cuenta" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 border-gray-800 text-white">
                                {bankAccounts.map((acc) => (
                                    <SelectItem key={acc.id} value={acc.id} className="focus:bg-gray-800 focus:text-white">
                                        <div className="flex flex-col">
                                            <span>{acc.banco_nombre}</span>
                                            <span className="text-[10px] text-gray-500">{acc.moneda} - {acc.id.slice(0, 8)}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-gray-400 uppercase">Fecha de Operación</Label>
                        <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm text-gray-300">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            {new Date().toLocaleDateString('es-AR', { dateStyle: 'long' })}
                        </div>
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
                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 h-10 font-bold"
                    >
                        {loading ? 'Procesando...' : 'Confirmar Depósito'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
