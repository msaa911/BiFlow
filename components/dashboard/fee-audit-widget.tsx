'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, CheckCircle2, FlaskConical, Gavel, ArrowRight, ShieldCheck, Scale } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

interface Finding {
    id: string
    tipo_error: string
    monto_esperado: number
    monto_real: number
    diferencia: number
    estado: string
    notas_ia: string
    created_at: string
    transaccion: {
        fecha: string
        descripcion: string
    }
}

export function FeeAuditWidget() {
    const [findings, setFindings] = useState<Finding[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadFindings()
    }, [])

    async function loadFindings() {
        const supabase = createClient()
        const { data } = await supabase
            .from('hallazgos') // Using 'hallazgos' table based on previously viewed AuditEngine logic
            .select(`
                *,
                transaccion:transacciones (
                    fecha,
                    descripcion
                )
            `)
            .order('created_at', { ascending: false })
            .limit(5)

        if (data) setFindings(data as any)
        setLoading(false)
    }

    if (loading) return null

    return (
        <Card className="bg-gray-900 border-gray-800 overflow-hidden shadow-2xl relative group">
            {/* Glossy gradient effect */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-500 opacity-50" />

            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                        <Gavel className="w-4 h-4" />
                    </div>
                    <div>
                        <CardTitle className="text-sm font-bold text-white uppercase tracking-tighter">Auditoría de Comisiones</CardTitle>
                        <p className="text-[10px] text-gray-500 font-medium">Contraste de acuerdos bancarios</p>
                    </div>
                </div>
                {findings.length === 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        <span className="text-[9px] font-bold text-emerald-500 uppercase">Sin Desvíos</span>
                    </div>
                )}
            </CardHeader>

            <CardContent className="space-y-3">
                {findings.length > 0 ? (
                    <div className="space-y-2">
                        {findings.map((finding) => {
                            const isBCRA = finding.notas_ia?.includes('BCRA 6.5.1');
                            return (
                                <div
                                    key={finding.id}
                                    className={`bg-gray-800/40 border ${isBCRA ? 'border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.05)]' : 'border-gray-700/50'} rounded-xl p-3 hover:border-red-500/30 transition-all group/item`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[9px] font-black ${isBCRA ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'} px-1.5 py-0.5 rounded uppercase tracking-widest flex items-center gap-1`}>
                                                    {isBCRA && <Scale className="w-2.5 h-2.5" />}
                                                    {finding.tipo_error.replace('_', ' ')}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-mono">
                                                    {new Date(finding.transaccion?.fecha).toLocaleDateString('es-AR')}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-white font-bold leading-tight truncate">
                                                {finding.transaccion?.descripcion}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-xs font-black ${isBCRA ? 'text-amber-400' : 'text-red-400'}`}>
                                                -${new Intl.NumberFormat('es-AR').format(finding.diferencia)}
                                            </div>
                                            <div className="text-[9px] text-gray-500 line-through">
                                                Exp: ${new Intl.NumberFormat('es-AR').format(finding.monto_esperado)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between border-t border-gray-700/50 pt-2 opacity-100 md:opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <span className="text-[9px] text-gray-400 italic flex items-center gap-1 overflow-hidden">
                                            <FlaskConical className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">{finding.notas_ia}</span>
                                        </span>
                                        <button className={`text-[9px] font-bold ${isBCRA ? 'text-amber-400' : 'text-white'} flex items-center gap-1 hover:brightness-125 whitespace-nowrap ml-2`}>
                                            {isBCRA ? 'Reclamar BCRA' : 'Reclamar'} <ArrowRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-6 border-2 border-dashed border-gray-800 rounded-2xl">
                        <div className="mx-auto w-10 h-10 bg-emerald-500/5 rounded-full flex items-center justify-center mb-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500/30" />
                        </div>
                        <p className="text-[10px] text-gray-500 px-4">Todas las comisiones detectadas coinciden con tus acuerdos pactados.</p>
                    </div>
                )}

                <Link href="/dashboard/audit" className="block w-full text-center py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-bold rounded-lg border border-gray-700 transition-colors uppercase tracking-widest">
                    Ver Auditoría AI Completa
                </Link>
            </CardContent>
        </Card>
    )
}
