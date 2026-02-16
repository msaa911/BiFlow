import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertCircle, ShieldCheck, TrendingDown, RefreshCcw, Info } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AnalysisPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: findings, error } = await supabase
        .from('hallazgos')
        .select(`
            *,
            transaccion:transacciones(*)
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching findings:', error)
    }

    const typeLabels: any = {
        'duplicado': { label: 'Pago Duplicado', color: 'text-red-400', bg: 'bg-red-500/10', icon: RefreshCcw },
        'fuga_fiscal': { label: 'Fuga Fiscal', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: TrendingDown },
        'anomalia': { label: 'Anomalía Atípica', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Info }
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <ShieldCheck className="h-7 w-7 text-emerald-500" />
                        Auditoría AI
                    </h2>
                    <p className="text-gray-400">Hallazgos y anomalías detectadas en tu flujo financiero.</p>
                </div>
            </div>

            <div className="grid gap-6">
                {findings?.map((finding) => {
                    const style = typeLabels[finding.tipo] || typeLabels.anomalia
                    const Icon = style.icon

                    return (
                        <div key={finding.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-all group">
                            <div className="flex flex-col md:flex-row gap-6 items-start">
                                <div className={`p-4 rounded-xl ${style.bg} ${style.color}`}>
                                    <Icon className="h-6 w-6" />
                                </div>

                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${style.bg} ${style.color}`}>
                                            {style.label}
                                        </span>
                                        <span className="text-gray-500 text-xs">
                                            Detectado el {new Date(finding.created_at).toLocaleDateString('es-AR')}
                                        </span>
                                    </div>

                                    <h3 className="text-lg font-bold text-white">
                                        {finding.detalle.razon || 'Anomalía detectada'}
                                    </h3>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800">
                                            <p className="text-gray-500 text-xs mb-1">Monto Implicado</p>
                                            <p className="font-mono text-white">
                                                {formatCurrency(finding.transaccion.monto)}
                                            </p>
                                        </div>
                                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800">
                                            <p className="text-gray-500 text-xs mb-1">Destinatario / CUIT</p>
                                            <p className="text-white truncate">
                                                {finding.transaccion.cuit_destino || 'No disponible'}
                                            </p>
                                        </div>
                                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800">
                                            <p className="text-gray-500 text-xs mb-1">Severidad</p>
                                            <p className={`font-bold capitalize ${finding.severidad === 'critical' || finding.severidad === 'high' ? 'text-red-400' : 'text-amber-400'
                                                }`}>
                                                {finding.severidad}
                                            </p>
                                        </div>
                                        <div className="bg-black/20 p-3 rounded-lg border border-gray-800">
                                            <p className="text-gray-500 text-xs mb-1">Estado</p>
                                            <p className="text-emerald-400 font-medium capitalize">
                                                {finding.estado}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4 p-4 bg-gray-800/30 rounded-xl border border-gray-800/50">
                                        <p className="text-sm text-gray-300 italic">
                                            "Hallazgo: {finding.detalle.razon}. {finding.detalle.dias_diferencia ? `Se detectó a solo ${finding.detalle.dias_diferencia} días de la transacción original.` : ''}"
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 w-full md:w-auto">
                                    <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors">
                                        Resolver
                                    </button>
                                    <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors">
                                        Ignorar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}

                {(!findings || findings.length === 0) && (
                    <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-20 text-center">
                        <ShieldCheck className="h-16 w-16 text-gray-700 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-300 text-white">Todo bajo control</h3>
                        <p className="text-gray-500 mt-2">No se han detectado nuevas anomalías en tu historial reciente.</p>
                    </div>
                )}
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
