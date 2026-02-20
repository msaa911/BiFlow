'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, ShieldCheck, Landmark, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SuppliersTabProps {
    orgId: string
}

export function SuppliersTab({ orgId }: SuppliersTabProps) {
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const supabase = createClient()

    useEffect(() => {
        async function fetchSuppliers() {
            setLoading(true)
            // Fetch suppliers (entidades) and their trusted CBUs
            const { data: entitiesData, error: entitiesError } = await supabase
                .from('entidades')
                .select('*')
                .eq('organization_id', orgId)
                .eq('categoria', 'proveedor')
                .order('razon_social', { ascending: true })

            const { data: trustData } = await supabase
                .from('trust_ledger')
                .select('cuit, cbu, is_trusted')
                .eq('organization_id', orgId)

            if (entitiesData) {
                const combined = entitiesData.map(ent => ({
                    ...ent,
                    trusted_cbus: trustData?.filter(t => t.cuit === ent.cuit) || []
                }))
                setSuppliers(combined)
            }
            setLoading(false)
        }

        fetchSuppliers()
    }, [orgId])

    const filteredSuppliers = suppliers.filter(s =>
        s.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.cuit.includes(searchTerm)
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Buscar por nombre o CUIT..."
                        className="pl-10 bg-gray-900 border-gray-800 text-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Users className="h-4 w-4" />
                    <span>{suppliers.length} Proveedores detectados</span>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-1">
                {loading ? (
                    <div className="p-12 text-center text-gray-500">Cargando directorio...</div>
                ) : filteredSuppliers.length === 0 ? (
                    <Card className="p-12 text-center bg-gray-900 border-gray-800">
                        <Users className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">No se encontraron proveedores</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            Sube extractos bancarios o facturas para que BiFlow autodetecte y valide a tus proveedores.
                        </p>
                    </Card>
                ) : (
                    filteredSuppliers.map(supplier => (
                        <Card key={supplier.id} className="p-6 bg-gray-900 border-gray-800 hover:border-emerald-500/30 transition-colors">
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-bold text-white">{supplier.razon_social}</h3>
                                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                            Proveedor
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-gray-400">CUIT: {supplier.cuit}</p>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">CBUs / CVUs de Confianza</p>
                                    <div className="space-y-2">
                                        {supplier.trusted_cbus.length > 0 ? (
                                            supplier.trusted_cbus.map((t: any) => (
                                                <div key={t.cbu} className="flex items-center justify-between gap-4 p-2 bg-gray-800/50 rounded-lg border border-gray-800">
                                                    <div className="flex items-center gap-2">
                                                        <Landmark className="h-4 w-4 text-gray-500" />
                                                        <code className="text-xs text-white font-mono">{t.cbu}</code>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase">
                                                        <ShieldCheck className="h-3.5 w-3.5" />
                                                        Validado
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-amber-500/70 italic">Sin CBU detectado aún</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
