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
    Banknote,
    Search,
    RefreshCcw,
    CheckCircle2,
    XCircle,
    ArrowUpRight,
    Filter
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface CheckPortfolioProps {
    orgId: string
}

export function CheckPortfolio({ orgId }: CheckPortfolioProps) {
    const [checks, setChecks] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<'pendiente' | 'depositado' | 'rechazado' | 'endosado' | 'all'>('pendiente')
    const supabase = createClient()

    async function fetchChecks() {
        setLoading(true)
        let query = supabase
            .from('instrumentos_pago')
            .select(`
                *,
                movimientos_tesoreria!inner (
                    fecha,
                    entidades (razon_social)
                )
            `)
            .eq('movimientos_tesoreria.organization_id', orgId)
            .eq('metodo', 'cheque_terceros')
            .order('fecha_disponibilidad', { ascending: true })

        if (statusFilter !== 'all') {
            query = query.eq('estado', statusFilter)
        }

        const { data, error } = await query

        if (error) {
            console.error('Error fetching checks:', error)
            toast.error('Error al cargar la cartera de cheques')
        } else {
            setChecks(data || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchChecks()
    }, [orgId, statusFilter])

    const filteredChecks = checks.filter(c =>
        c.movimientos_tesoreria?.entidades?.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.referencia || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.banco || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleUpdateStatus = async (checkId: string, newStatus: string) => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('instrumentos_pago')
                .update({ estado: newStatus })
                .eq('id', checkId)

            if (error) throw error

            toast.success(`Cheque actualizado a ${newStatus}`)
            fetchChecks()
        } catch (err: any) {
            console.error('Error updating check status:', err)
            toast.error('Error al actualizar cheque')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="p-6 bg-gray-950 border-gray-800 text-white min-h-[500px]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400">
                        <Banknote className="w-5 h-5" />
                        Cartera de Cheques
                    </h2>
                    <p className="text-sm text-gray-500">Gestión de cheques de terceros en cartera y su estado.</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1">
                        <Button
                            variant={statusFilter === 'pendiente' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="text-[10px] h-7 px-3 uppercase font-bold"
                            onClick={() => setStatusFilter('pendiente')}
                        >
                            En Cartera
                        </Button>
                        <Button
                            variant={statusFilter === 'depositado' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="text-[10px] h-7 px-3 uppercase font-bold"
                            onClick={() => setStatusFilter('depositado')}
                        >
                            Depositados
                        </Button>
                        <Button
                            variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="text-[10px] h-7 px-3 uppercase font-bold"
                            onClick={() => setStatusFilter('all')}
                        >
                            Todos
                        </Button>
                    </div>
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                        <Input
                            placeholder="Buscar cheques..."
                            className="bg-gray-900 border-gray-800 pl-9 text-xs"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" size="icon" onClick={fetchChecks} className="border-gray-800 bg-gray-900">
                        <RefreshCcw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/50">
                <Table>
                    <TableHeader className="bg-gray-900">
                        <TableRow className="hover:bg-transparent border-gray-800">
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Vto / Disponib.</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Número / Banco</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px]">Origen (Cliente)</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px] text-right">Importe</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px] text-center">Estado</TableHead>
                            <TableHead className="text-gray-400 font-bold uppercase text-[10px] text-center">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-gray-500">Cargando cartera...</TableCell>
                            </TableRow>
                        ) : filteredChecks.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-gray-500">No hay cheques que coincidan con los criterios.</TableCell>
                            </TableRow>
                        ) : filteredChecks.map(check => (
                            <TableRow key={check.id} className="border-gray-800 hover:bg-gray-800/30 transition-colors">
                                <TableCell className="font-mono text-xs">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-200">{new Date(check.fecha_disponibilidad).toLocaleDateString('es-AR')}</span>
                                        <span className="text-[10px] text-gray-500 italic">
                                            {new Date(check.fecha_disponibilidad) > new Date() ? 'Diferido' : 'Al día'}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-white uppercase">{check.referencia || 'S/N'}</span>
                                        <span className="text-[10px] text-gray-500 uppercase">{check.banco || 'Varios'}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-xs text-gray-300">
                                    {check.movimientos_tesoreria?.entidades?.razon_social}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-emerald-400 text-sm">
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(check.monto)}
                                </TableCell>
                                <TableCell className="text-center">
                                    <Badge className={`uppercase text-[9px] font-bold ${check.estado === 'pendiente' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                            check.estado === 'depositado' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                check.estado === 'endosado' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                    check.estado === 'rechazado' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                        'bg-gray-500/10 text-gray-400'
                                        }`}>
                                        {check.estado === 'pendiente' ? 'En Cartera' : check.estado}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex justify-center gap-1">
                                        {check.estado === 'pendiente' && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                                                    title="Marcar como Depositado"
                                                    onClick={() => handleUpdateStatus(check.id, 'depositado')}
                                                >
                                                    <ArrowUpRight className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                                    title="Marcar como Rechazado"
                                                    onClick={() => handleUpdateStatus(check.id, 'rechazado')}
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </Button>
                                            </>
                                        )}
                                        {check.estado === 'depositado' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"
                                                title="Acreditar"
                                                onClick={() => handleUpdateStatus(check.id, 'acreditado')}
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </Card>
    )
}
