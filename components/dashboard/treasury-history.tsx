'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import {
    FileText,
    ChevronDown,
    ChevronUp,
    Trash2,
    Download,
    Clock,
    ArrowUpCircle,
    ArrowDownCircle,
    Search,
    RefreshCcw
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface TreasuryHistoryProps {
    orgId: string
}

export function TreasuryHistory({ orgId }: TreasuryHistoryProps) {
    const [movements, setMovements] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedMov, setExpandedMov] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const supabase = createClient()

    async function fetchMovements() {
        setLoading(true)
        const { data, error } = await supabase
            .from('movimientos_tesoreria')
            .select(`
                *,
                entidades (razon_social),
                instrumentos_pago (*),
                aplicaciones_pago (
                    monto_aplicado,
                    comprobantes (numero, tipo)
                )
            `)
            .eq('organization_id', orgId)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching movements:', error)
            toast.error('Error al cargar el historial')
        } else {
            setMovements(data || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchMovements()
    }, [orgId])

    const filteredMovements = movements.filter(m =>
        m.entidades?.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.observaciones?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleVoid = async (movId: string) => {
        if (!confirm('¿Estás seguro de que quieres anular este movimiento? Esta acción no se puede deshacer y liberará los saldos de las facturas.')) return

        setLoading(true)
        try {
            // Logic for voiding:
            // 1. Get the movement details
            const mov = movements.find(m => m.id === movId)
            if (!mov) return

            // 2. Update invoice balances
            for (const app of mov.aplicaciones_pago) {
                const { data: inv } = await supabase.from('comprobantes').select('monto_pendiente, monto_total').eq('id', app.comprobante_id).single()
                if (inv) {
                    const newMonto = Number(inv.monto_pendiente) + Number(app.monto_aplicado)
                    await supabase.from('comprobantes')
                        .update({
                            monto_pendiente: newMonto,
                            estado: newMonto >= inv.monto_total ? 'pendiente' : 'parcial'
                        })
                        .eq('id', app.comprobante_id)
                }
            }

            // 3. Delete or Update Movement Status
            // For now, let's just delete it to keep it simple, or we could add an 'estado' column
            const { error: delErr } = await supabase.from('movimientos_tesoreria').delete().eq('id', movId)

            if (delErr) throw delErr

            toast.success('Movimiento anulado correctamente')
            fetchMovements()
        } catch (err: any) {
            console.error('Error voiding movement:', err)
            toast.error('Error al anular: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="p-6 bg-gray-950 border-gray-800 text-white min-h-[500px]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-emerald-400" />
                        Historial de Tesorería
                    </h2>
                    <p className="text-sm text-gray-500">Consulta y gestiona tus Recibos y Órdenes de Pago.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                        <Input
                            placeholder="Buscar por entidad..."
                            className="bg-gray-900 border-gray-800 pl-9 text-xs"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" size="icon" onClick={fetchMovements} className="border-gray-800 bg-gray-900">
                        <RefreshCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/50">
                <Table>
                    <TableHeader className="bg-gray-900">
                        <TableRow className="hover:bg-transparent border-gray-800">
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Fecha</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Tipo</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Entidad</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px] text-right">Monto Total</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Detalle</TableHead>
                            <TableHead className="w-10"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-gray-500">Cargando movimientos...</TableCell>
                            </TableRow>
                        ) : filteredMovements.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-gray-500">No se encontraron movimientos.</TableCell>
                            </TableRow>
                        ) : filteredMovements.map(mov => (
                            <>
                                <TableRow key={mov.id} className="border-gray-800 hover:bg-gray-800/30 transition-colors">
                                    <TableCell className="font-mono text-xs">
                                        {new Date(mov.fecha).toLocaleDateString('es-AR')}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`uppercase text-[10px] font-bold ${mov.tipo === 'cobro' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                                            {mov.tipo === 'cobro' ? <ArrowDownCircle className="w-3 h-3 mr-1" /> : <ArrowUpCircle className="w-3 h-3 mr-1" />}
                                            {mov.tipo === 'cobro' ? 'Recibo' : 'Orden Pago'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-bold text-gray-200 text-xs">
                                        {mov.entidades?.razon_social}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-white text-xs">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(mov.monto_total)}
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            onClick={() => setExpandedMov(expandedMov === mov.id ? null : mov.id)}
                                            className="text-[10px] uppercase font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                                        >
                                            {expandedMov === mov.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                            {expandedMov === mov.id ? 'Cerrar' : 'Ver Detalle'}
                                        </button>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleVoid(mov.id)} className="text-gray-600 hover:text-red-500 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                {expandedMov === mov.id && (
                                    <TableRow className="bg-gray-900/80 border-gray-800">
                                        <TableCell colSpan={6} className="p-0">
                                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-2 duration-300">
                                                {/* Instrumentos */}
                                                <div>
                                                    <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-3 tracking-widest">Valores / Instrumentos</h4>
                                                    <div className="space-y-2">
                                                        {mov.instrumentos_pago.map((ins: any) => (
                                                            <div key={ins.id} className="flex justify-between items-center p-3 bg-gray-950 border border-gray-800 rounded-lg text-xs">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
                                                                        <FileText className="w-4 h-4 text-emerald-500" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-bold text-gray-300 uppercase">{ins.metodo.replace('_', ' ')}</p>
                                                                        <p className="text-[10px] text-gray-500">Disp: {new Date(ins.fecha_disponibilidad).toLocaleDateString('es-AR')} {ins.referencia ? ` | Ref: ${ins.referencia}` : ''}</p>
                                                                    </div>
                                                                </div>
                                                                <p className="font-mono font-bold text-emerald-400">
                                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(ins.monto)}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Aplicaciones */}
                                                <div>
                                                    <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-3 tracking-widest">Facturas Canceladas / Imputadas</h4>
                                                    <div className="space-y-2">
                                                        {mov.aplicaciones_pago.map((app: any, idx: number) => (
                                                            <div key={idx} className="flex justify-between items-center p-3 bg-gray-950 border border-gray-800 rounded-lg text-xs">
                                                                <div>
                                                                    <p className="font-bold text-gray-300">{app.comprobantes?.numero}</p>
                                                                    <p className="text-[10px] text-gray-500 uppercase">{app.comprobantes?.tipo.replace('_', ' ')}</p>
                                                                </div>
                                                                <p className="font-mono font-bold text-blue-400">
                                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(app.monto_aplicado)}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </Card>
    )
}
