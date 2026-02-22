
import { AlertTriangle, TrendingUp, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

interface ExpenseGuardWidgetProps {
    anomalies: any[]
}

export function ExpenseGuardWidget({ anomalies }: ExpenseGuardWidgetProps) {
    const anomalyCount = anomalies.length

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-200">
                    Guardián de Gastos
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-white">
                    {anomalyCount}
                </div>
                <p className="text-xs text-amber-500 flex items-center mt-1">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Alertas de Precio ({'>'}15%)
                </p>

                <div className="mt-4 space-y-3">
                    {anomalies.slice(0, 3).map((item, i) => {
                        const metadata = item.metadata || {}
                        const increase = metadata.anomaly_score
                            ? `+${(metadata.anomaly_score * 100).toFixed(0)}%`
                            : 'Alta'

                        return (
                            <div key={i} className="flex justify-between items-center text-xs border-b border-gray-800 pb-2 last:border-0 last:pb-0">
                                <div>
                                    <p className="text-white font-medium truncate max-w-[120px]">{item.descripcion}</p>
                                    <p className="text-gray-500">{new Date(item.fecha).toLocaleDateString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-amber-400 font-bold">{increase}</p>
                                    <p className="text-gray-400">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.monto)}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                    {anomalies.length === 0 && (
                        <p className="text-xs text-gray-500">No se detectaron aumentos inusuales.</p>
                    )}
                </div>
                <div className="mt-6 pt-4 border-t border-gray-800">
                    <Link
                        href="/dashboard/audit"
                        className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-bold rounded-lg border border-gray-700 transition-colors flex items-center justify-center gap-2 uppercase tracking-widest group"
                    >
                        Ver Auditoría AI <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
}
