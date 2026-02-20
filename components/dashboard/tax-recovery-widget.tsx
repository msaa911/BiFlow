
import { ArrowUpRight, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TaxRecoveryWidgetProps {
    totalRecoverable: number
    taxItems: any[]
}

export function TaxRecoveryWidget({ totalRecoverable, taxItems }: TaxRecoveryWidgetProps) {
    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-200">
                    Recupero Impositivo
                </CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-white">
                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalRecoverable)}
                </div>
                <p className="text-xs text-emerald-400 flex items-center mt-1">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    Crédito Fiscal Potencial
                </p>

                <div className="mt-4 space-y-2">
                    {taxItems.slice(0, 3).map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                            <span className="text-gray-400 truncate max-w-[150px]">{item.descripcion}</span>
                            <span className="text-white font-medium">
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.monto)}
                            </span>
                        </div>
                    ))}
                    {taxItems.length === 0 && (
                        <p className="text-xs text-gray-500">No se encontraron retenciones recuperables.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
