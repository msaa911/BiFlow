import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertCircle, ShieldCheck, TrendingDown, RefreshCcw, Info } from 'lucide-react'
import { AuditCard } from '@/components/dashboard/audit-card'

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
                {findings?.map((finding) => (
                    <AuditCard key={finding.id} finding={finding} />
                ))}

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
