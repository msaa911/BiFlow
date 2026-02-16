import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { List, Search, Filter, Download } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function TransactionsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: transactions, error } = await supabase
        .from('transacciones')
        .select('*')
        .order('fecha', { ascending: false })

    if (error) {
        console.error('Error fetching transactions:', error)
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <List className="h-7 w-7 text-blue-500" />
                        Historial de Transacciones
                    </h2>
                    <p className="text-gray-400">Listado completo de movimientos bancarios procesados.</p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <button className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2.5 rounded-xl border border-gray-700 transition-all font-medium text-sm">
                        <Download className="h-4 w-4" />
                        Exportar
                    </button>
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-gray-800 bg-gray-800/30 flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar por descripción o monto..."
                            className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                        />
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <button className="flex items-center gap-2 bg-gray-800 text-gray-300 px-3 py-2 rounded-lg border border-gray-700 text-xs font-medium">
                            <Filter className="h-3.5 w-3.5" />
                            Filtrar por Fecha
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-800/50 text-xs uppercase font-medium text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Descripción</th>
                                <th className="px-6 py-4">CUIT Destino</th>
                                <th className="px-6 py-4">Origen</th>
                                <th className="px-6 py-4 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {transactions?.map((t) => (
                                <tr key={t.id} className="hover:bg-gray-800/50 transition-all group">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                                        {new Date(t.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4 text-white font-medium max-w-[300px] truncate">
                                        {t.descripcion}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs">
                                        {t.cuit_destino || '---'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-[10px] uppercase font-bold">
                                            {t.origen_dato}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 text-right font-bold tabular-nums ${t.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {formatCurrency(t.monto)}
                                    </td>
                                </tr>
                            ))}
                            {(!transactions || transactions.length === 0) && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="p-3 bg-gray-800 rounded-full mb-3">
                                                <List className="h-6 w-6 text-gray-600" />
                                            </div>
                                            <p className="text-gray-500 font-medium">No se encontraron transacciones.</p>
                                            <p className="text-gray-600 text-xs mt-1">Sube un extracto CSV para comenzar.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-gray-800 bg-gray-800/20 text-xs text-gray-500 text-right">
                    Mostrando {transactions?.length || 0} movimientos
                </div>
            </div>
        </div>
    )
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
    }).format(amount)
}
