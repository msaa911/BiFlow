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
    Filter,
    Calendar,
    AlertTriangle,
    Wallet,
    Ban,
    History,
    Download
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { KPICard } from '@/components/ui/kpi-card'
import { CheckDepositModal } from './check-deposit-modal'
import { CheckRejectionModal } from './check-rejection-modal'
import { CheckHistoryModal } from './check-history-modal'

interface CheckPortfolioProps {
    orgId: string
}

export function CheckPortfolio({ orgId }: CheckPortfolioProps) {
    const [checks, setChecks] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<'pendiente' | 'depositado' | 'rechazado' | 'endosado' | 'all'>('all')
    const [selectedChecks, setSelectedChecks] = useState<string[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(100)

    // Modals state
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false)
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false)
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
    const [selectedCheckForHistory, setSelectedCheckForHistory] = useState<any | null>(null)
    const [checkToReject, setCheckToReject] = useState<any | null>(null)

    const supabase = createClient()

    async function fetchChecks() {
        setLoading(true)
        setSelectedChecks([]) // Reset selection on fetch
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
        (c.movimientos_tesoreria?.entidades?.razon_social || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.detalle_referencia || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.banco || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalPages = Math.ceil(filteredChecks.length / itemsPerPage)
    const paginatedChecks = filteredChecks.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )

    // KPI Calculations
    const today = new Date()
    const seventhDay = new Date()
    seventhDay.setDate(today.getDate() + 7)

    const totalInPortfolio = checks
        .filter(c => c.estado === 'pendiente')
        .reduce((acc, curr) => acc + Number(curr.monto), 0)

    const toExpireSoon = checks
        .filter(c => c.estado === 'pendiente' && new Date(c.fecha_disponibilidad) <= seventhDay)
        .reduce((acc, curr) => acc + Number(curr.monto), 0)

    const totalRejected = checks
        .filter(c => c.estado === 'rechazado')
        .reduce((acc, curr) => acc + Number(curr.monto), 0)

    // Selection Calculations
    const selectedAmount = checks
        .filter(c => selectedChecks.includes(c.id))
        .reduce((acc, curr) => acc + Number(curr.monto), 0)

    const handleUpdateStatus = async (checkId: string, newStatus: string) => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('instrumentos_pago')
                .update({ estado: newStatus })
                .eq('id', checkId)

            if (error) throw error
            toast.success(`Estado actualizado a ${newStatus}`)
            fetchChecks()
        } catch (error) {
            console.error('Error updating status:', error)
            toast.error("Error al actualizar estado")
        } finally {
            setLoading(false)
        }
    }

    const handleRejectClick = (check: any) => {
        setCheckToReject(check)
        setIsRejectionModalOpen(true)
    }

    const handleHistoryClick = (check: any) => {
        setSelectedCheckForHistory(check)
        setIsHistoryModalOpen(true)
    }

    const downloadCSV = () => {
        if (checks.length === 0) return

        const headers = ["Nro Cheque", "Banco", "Monto", "Fecha Emision", "Fecha Disponib.", "Estado", "Socio"]
        const csvContent = [
            headers.join(","),
            ...checks.map(c => [
                c.detalle_referencia,
                c.banco,
                c.monto,
                c.fecha_emision,
                c.fecha_disponibilidad,
                c.estado,
                c.movimientos_tesoreria?.entidades?.razon_social || "N/A"
            ].join(","))
        ].join("\n")

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement("a")
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        link.setAttribute("download", `cartera_cheques_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success("Cartera exportada correctamente")
    }

    const toggleSelectAll = () => {
        if (selectedChecks.length === filteredChecks.length) {
            setSelectedChecks([])
        } else {
            setSelectedChecks(filteredChecks.map(c => c.id))
        }
    }

    const toggleSelectCheck = (id: string) => {
        if (selectedChecks.includes(id)) {
            setSelectedChecks(prev => prev.filter(cId => cId !== id))
        } else {
            setSelectedChecks(prev => [...prev, id])
        }
    }

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPICard
                    title="Total en Cartera"
                    value={new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalInPortfolio)}
                    icon={<Wallet className="w-5 h-5 text-emerald-400" />}
                    description="Cheques pendientes de depósito"
                    trend="up"
                    trendValue="Activo"
                    trendColor="emerald"
                />
                <KPICard
                    title="A Vencer (7 días)"
                    value={new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(toExpireSoon)}
                    icon={<Calendar className="w-5 h-5 text-amber-400" />}
                    description="Impacto inmediato en liquidez"
                    trend="neutral"
                    trendValue="Atención"
                    trendColor="amber"
                />
                <KPICard
                    title="Total Rechazados"
                    value={new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalRejected)}
                    icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
                    description="Créditos a recuperar"
                    trend="down"
                    trendValue="Riesgo"
                    trendColor="red"
                />
            </div>

            <Card className="p-6 bg-gray-950 border-gray-800 text-white min-h-[500px]">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400">
                            <Banknote className="w-5 h-5" />
                            Detalle de Cartera
                        </h2>
                        <p className="text-sm text-gray-500">
                            {selectedChecks.length > 0
                                ? `${selectedChecks.length} cheques seleccionados (${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(selectedAmount)})`
                                : 'Gestión de valores individuales y acciones masivas.'
                            }
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-gray-900 border-gray-800 hover:bg-gray-800 text-gray-300 font-bold text-xs"
                            onClick={downloadCSV}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Exportar CSV
                        </Button>
                        {selectedChecks.length > 0 && (
                            <Button
                                variant="default"
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20"
                                onClick={() => setIsDepositModalOpen(true)}
                            >
                                <ArrowUpRight className="w-4 h-4 mr-2" />
                                Depositar Lote ({selectedChecks.length})
                            </Button>
                        )}
                        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1">
                            <Button
                                variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="text-[10px] h-7 px-3 uppercase font-bold"
                                onClick={() => setStatusFilter('all')}
                            >
                                Todos
                            </Button>
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
                                variant={statusFilter === 'rechazado' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="text-[10px] h-7 px-3 uppercase font-bold"
                                onClick={() => setStatusFilter('rechazado')}
                            >
                                Rechazados
                            </Button>
                        </div>
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                            <Input
                                placeholder="Buscar cheques..."
                                className="bg-gray-900 border-gray-800 pl-9 text-xs h-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" size="icon" onClick={fetchChecks} className="border-gray-800 bg-gray-900 h-9 w-9">
                            <RefreshCcw className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/50 shadow-2xl">
                    <div className="max-h-[600px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-emerald-500/20 hover:scrollbar-thumb-emerald-500/40 scrollbar-track-transparent">
                        <Table>
                            <TableHeader className="bg-gray-800 sticky top-0 z-10">
                                <TableRow className="hover:bg-transparent border-gray-800 text-white/50">
                                    <TableHead className="w-[40px] px-4">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-700 bg-gray-800 text-emerald-500 checked:bg-emerald-500"
                                            checked={selectedChecks.length === filteredChecks.length && filteredChecks.length > 0}
                                            onChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] text-gray-400 tracking-widest">Vto / Disponib.</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] text-gray-400 tracking-widest">Número / Banco</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] text-gray-400 tracking-widest">Origen (Cliente)</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] text-gray-400 tracking-widest text-right">Importe</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] text-gray-400 tracking-widest text-center">Estado</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] text-gray-400 tracking-widest text-center">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-gray-500 italic">Cargando cartera escalable...</TableCell>
                                    </TableRow>
                                ) : filteredChecks.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-gray-500 italic">No se encontraron valores en los criterios actuales.</TableCell>
                                    </TableRow>
                                ) : paginatedChecks.map(check => (
                                    <TableRow
                                        key={check.id}
                                        className={`border-gray-800 hover:bg-white/5 transition-colors ${selectedChecks.includes(check.id) ? 'bg-emerald-500/10' : ''}`}
                                    >
                                        <TableCell className="px-4">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-700 bg-gray-800 text-emerald-500 focus:ring-emerald-500"
                                                checked={selectedChecks.includes(check.id)}
                                                onChange={() => toggleSelectCheck(check.id)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-200">{new Date(check.fecha_disponibilidad).toLocaleDateString('es-AR')}</span>
                                                <span className="text-[10px] text-gray-500 italic">
                                                    {new Date(check.fecha_disponibilidad) > today ? 'Diferido' : 'Al día'}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-white uppercase">{check.detalle_referencia || 'S/N'}</span>
                                                <span className="text-[10px] text-gray-400/70 uppercase">{check.banco || 'Varios'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-gray-400">
                                            {check.movimientos_tesoreria?.entidades?.razon_social}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-emerald-400 text-sm">
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(check.monto)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge className={`uppercase text-[9px] font-bold border ${check.estado === 'pendiente' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                check.estado === 'depositado' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                    check.estado === 'endosado' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                        check.estado === 'rechazado' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                            check.estado === 'acreditado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                'bg-gray-500/10 text-gray-400 border-gray-800'
                                                }`}>
                                                {check.estado === 'pendiente' ? 'En Cartera' : check.estado}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 transition-all rounded-lg"
                                                    title="Ver Historial"
                                                    onClick={() => handleHistoryClick(check)}
                                                >
                                                    <History className="w-4 h-4" />
                                                </Button>
                                                {check.estado === 'pendiente' && (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 transition-all rounded-lg"
                                                            title="Marcar como Depositado"
                                                            onClick={() => {
                                                                setSelectedChecks([check.id])
                                                                setIsDepositModalOpen(true)
                                                            }}
                                                        >
                                                            <ArrowUpRight className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-all rounded-lg"
                                                            title="Gestionar Rechazo"
                                                            onClick={() => {
                                                                setCheckToReject(check)
                                                                setIsRejectionModalOpen(true)
                                                            }}
                                                        >
                                                            <Ban className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                                {check.estado === 'depositado' && (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 transition-all rounded-lg"
                                                            title="Acreditar"
                                                            onClick={() => handleUpdateStatus(check.id, 'acreditado')}
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-all rounded-lg"
                                                            title="Marcar como Rechazado"
                                                            onClick={() => {
                                                                setCheckToReject(check)
                                                                setIsRejectionModalOpen(true)
                                                            }}
                                                        >
                                                            <Ban className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Paginación */}
                    <div className="p-4 border-t border-gray-800 bg-gray-900/40 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-[11px] text-gray-500 font-medium flex items-center gap-4">
                            <span>
                                Mostrando <span className="text-gray-300">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-gray-300">{Math.min(currentPage * itemsPerPage, filteredChecks.length)}</span> de <span className="text-gray-300">{filteredChecks.length}</span> registros
                            </span>

                            <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
                                <span className="text-gray-600">Ver:</span>
                                {[20, 25, 50, 100, 200].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => {
                                            setItemsPerPage(size)
                                            setCurrentPage(1)
                                        }}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${itemsPerPage === size ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-600 hover:text-gray-400'}`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 px-3 border-gray-800 bg-gray-900 hover:bg-gray-800 text-gray-300 text-[10px] font-bold uppercase transition-all"
                                >
                                    Anterior
                                </Button>
                                <div className="flex items-center gap-1 px-3">
                                    <span className="text-[10px] font-bold text-emerald-500">{currentPage}</span>
                                    <span className="text-[10px] font-bold text-gray-600">/</span>
                                    <span className="text-[10px] font-bold text-gray-400">{totalPages}</span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 px-3 border-gray-800 bg-gray-900 hover:bg-gray-800 text-gray-300 text-[10px] font-bold uppercase transition-all"
                                >
                                    Siguiente
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* Modals */}
            <CheckDepositModal
                open={isDepositModalOpen}
                onOpenChange={setIsDepositModalOpen}
                orgId={orgId}
                selectedCheckIds={selectedChecks}
                totalAmount={selectedAmount || (checkToReject?.monto || 0)} // fallback logic for single
                onSuccess={fetchChecks}
            />

            <CheckRejectionModal
                open={isRejectionModalOpen}
                onOpenChange={setIsRejectionModalOpen}
                orgId={orgId}
                check={checkToReject}
                onSuccess={fetchChecks}
            />

            <CheckHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                checkId={selectedCheckForHistory?.id}
                checkNumero={selectedCheckForHistory?.detalle_referencia}
            />
        </div>
    )
}
