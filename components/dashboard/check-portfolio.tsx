'use client'

import { useState, useEffect, useCallback } from 'react'
import { getBankPortfolioAction, updateCheckStatusAction } from '@/app/actions/banks'
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
    Download,
    ArrowDownRight,
    FileSpreadsheet,
    FileText,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    MoreHorizontal,
    CheckIcon
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
    accountId?: string
}

export function CheckPortfolio({ orgId, accountId }: CheckPortfolioProps) {
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

    const fetchChecks = useCallback(async () => {
        setLoading(true)
        setSelectedChecks([]) // Reset selection on fetch
        
        const { data, error } = await getBankPortfolioAction()

        if (error) {
            console.error('Error fetching checks:', error)
            // No disparar toast.error si el error es solo por datos vacíos o similar
        } else {
            // Aplicar filtros locales si es necesario (accountId y statusFilter)
            let result = data || []
            
            // Nota: El filtro de orgId ya se aplica en la Server Action
            if (accountId && accountId !== 'all') {
                result = result.filter(c => c.movimientos_tesoreria?.cuenta_id === accountId)
            }
            
            if (statusFilter !== 'all') {
                result = result.filter(c => c.estado === statusFilter)
            }
            
            setChecks(result)
        }
        setLoading(false)
    }, [orgId, statusFilter, accountId])

    useEffect(() => {
        fetchChecks()
    }, [fetchChecks])

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
            const { success, error } = await updateCheckStatusAction(checkId, newStatus)

            if (!success) throw new Error(error || 'Error al actualizar estado')
            
            toast.success(`Estado actualizado a ${newStatus}`)
            fetchChecks()
        } catch (err: any) {
            console.error('Error updating status:', err)
            toast.error(err.message || "Error al actualizar estado")
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

        const headers = ["Nro Cheque", "Banco", "Monto", "Fecha Emision", "Fecha Disponib.", "Estado", "Entidad"]
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

            <div className="glass-card p-8 rounded-3xl text-white min-h-[500px] shimmer">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-black flex items-center gap-3 text-white tracking-tighter">
                            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                <Banknote className="w-6 h-6 text-emerald-400" />
                            </div>
                            Detalle de Cartera
                        </h2>
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {selectedChecks.length > 0
                                ? `${selectedChecks.length} seleccionados • ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(selectedAmount)}`
                                : 'Gestión de valores y tesorería'
                            }
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-white/5 border-white/10 hover:bg-white/10 text-gray-400 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all h-9"
                            onClick={downloadCSV}
                        >
                            <Download className="w-3.5 h-3.5 mr-2" />
                            Exportar
                        </Button>
                        {selectedChecks.length > 0 && (
                            <Button
                                variant="default"
                                size="sm"
                                className="bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all h-9"
                                onClick={() => setIsDepositModalOpen(true)}
                            >
                                <ArrowUpRight className="w-3.5 h-3.5 mr-2" />
                                Depositar Lote ({selectedChecks.length})
                            </Button>
                        )}
                        <div className="flex bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-1 shadow-inner h-9">
                            {(['all', 'pendiente', 'depositado', 'rechazado'] as const).map((filter) => (
                                <Button
                                    key={filter}
                                    variant="ghost"
                                    size="sm"
                                    className={`text-[9px] h-full px-4 uppercase font-black tracking-widest transition-all rounded-lg ${
                                        statusFilter === filter 
                                        ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 active:scale-95' 
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                    }`}
                                    onClick={() => setStatusFilter(filter)}
                                >
                                    {filter === 'all' ? 'Ver Todos' : filter === 'pendiente' ? 'Cartera' : filter}
                                </Button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                                <Input
                                    placeholder="Buscar por emisor, banco o nro..."
                                    className="pl-9 h-8 bg-gray-900 border-gray-800 text-[11px] focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all rounded-lg"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                                    >
                                        <XCircle className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                            <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-8 w-8 bg-white/5 border-white/10 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all rounded-lg"
                                onClick={fetchChecks}
                            >
                                <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="relative glass-card rounded-2xl overflow-hidden shimmer p-[1px] bg-gradient-to-b from-white/10 via-transparent to-transparent">
                    <div className="max-h-[600px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-emerald-500/10 hover:scrollbar-thumb-emerald-500/20 scrollbar-track-transparent rounded-2xl">
                        <Table>
                            <TableHeader className="bg-gray-900/80 backdrop-blur-xl sticky top-0 z-10 border-b border-white/10 shadow-lg">
                                <TableRow className="hover:bg-transparent border-white/5">
                                    <TableHead className="w-[40px] px-4 sticky top-0 z-20 bg-transparent">
                                        <input
                                            type="checkbox"
                                            className="rounded border-white/10 bg-white/5 text-emerald-500 checked:bg-emerald-500 transition-all cursor-pointer"
                                            checked={selectedChecks.length === filteredChecks.length && filteredChecks.length > 0}
                                            onChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-gray-500 sticky top-0 z-20 bg-transparent">Vto / Disponib.</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-gray-500 sticky top-0 z-20 bg-transparent">Número / Banco</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-gray-500 sticky top-0 z-20 bg-transparent">Origen (Cliente)</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-gray-500 text-right sticky top-0 z-20 bg-transparent">Importe</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-gray-500 text-center sticky top-0 z-20 bg-transparent">Estado</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-widest text-gray-500 text-center sticky top-0 z-20 bg-transparent">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-gray-500 italic">Cargando datos...</TableCell>
                                    </TableRow>
                                ) : filteredChecks.length === 0 ? (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={7} className="h-[400px] text-center">
                                            <div className="flex flex-col items-center justify-center p-8 text-gray-500 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                                                <div className="bg-white/5 p-8 rounded-full mb-8 border border-white/10 group-hover:scale-110 transition-transform duration-500 shadow-2xl relative">
                                                    <Search className="h-12 w-12 text-gray-700" />
                                                    <div className="absolute inset-0 bg-emerald-500/5 blur-2xl rounded-full" />
                                                </div>
                                                <h3 className="text-2xl font-black text-white/90 mb-3 tracking-tighter uppercase italic">Silencio en la bóveda</h3>
                                                <p className="text-[11px] max-w-[320px] leading-extraloose text-gray-500 font-bold uppercase tracking-widest">
                                                    No localizamos cheques que coincidan con la frecuencia captada. Refiná tus filtros o ajustá la búsqueda.
                                                </p>
                                                {searchTerm && (
                                                    <Button 
                                                        variant="ghost" 
                                                        className="mt-8 text-emerald-500 hover:text-emerald-400 font-black text-[10px] uppercase tracking-[0.2em] border border-emerald-500/20 hover:bg-emerald-500/5 rounded-full px-8 transition-all"
                                                        onClick={() => setSearchTerm('')}
                                                    >
                                                        Resetear Bóveda
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedChecks.map((check) => (
                                        <TableRow 
                                            key={check.id} 
                                            className={`
                                                group transition-all duration-300 border-white/5
                                                hover:bg-emerald-500/5 hover:backdrop-blur-sm
                                                ${selectedChecks.includes(check.id) ? 'bg-emerald-500/10' : ''}
                                            `}
                                        >
                                        <TableCell className="px-4">
                                            <input
                                                type="checkbox"
                                                className="rounded border-white/10 bg-white/5 text-emerald-500 transition-all cursor-pointer focus:ring-emerald-500/50"
                                                checked={selectedChecks.includes(check.id)}
                                                onChange={() => toggleSelectCheck(check.id)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-gray-400">
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
                                            <Badge className={`
                                                px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                                                ${check.estado === 'pendiente' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]' : 
                                                  check.estado === 'depositado' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]' : 
                                                  check.estado === 'rechazado' ? 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 
                                                  'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]'}
                                            `}>
                                                {check.estado === 'pendiente' ? 'En Cartera' : check.estado}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                )))}
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
                                        className={`px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all ${
                                            itemsPerPage === size 
                                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 active:scale-95' 
                                            : 'text-gray-600 hover:text-gray-300 hover:bg-white/5'
                                        }`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 h-9 items-center overflow-hidden">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-full px-4 text-gray-500 hover:text-white hover:bg-white/5 text-[9px] font-black uppercase tracking-[0.15em] transition-all disabled:opacity-30 rounded-lg"
                                >
                                    Anterior
                                </Button>
                                <div className="flex items-center gap-1.5 px-4 h-full border-x border-white/5">
                                    <span className="text-[10px] font-black text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">{currentPage}</span>
                                    <span className="text-[9px] font-black text-gray-700">/</span>
                                    <span className="text-[10px] font-black text-gray-500">{totalPages}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-full px-4 text-gray-500 hover:text-white hover:bg-white/5 text-[9px] font-black uppercase tracking-[0.15em] transition-all disabled:opacity-30 rounded-lg"
                                >
                                    Siguiente
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

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
