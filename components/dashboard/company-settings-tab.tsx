'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PiggyBank, TrendingDown, Save, Loader2, CheckCircle2 } from 'lucide-react'

interface CompanyConfig {
    tna: number
    limite_descubierto: number
    modo_tasa: 'AUTOMATICO' | 'MANUAL'
}

export function CompanySettingsTab({ organizationId }: { organizationId: string }) {
    const [config, setConfig] = useState<CompanyConfig>({ tna: 0.70, limite_descubierto: 0, modo_tasa: 'AUTOMATICO' })
    const [marketRate, setMarketRate] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [success, setSuccess] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        async function loadConfig() {
            setLoading(true)
            const { data, error } = await supabase
                .from('configuracion_empresa')
                .select('*')
                .eq('organization_id', organizationId)
                .single()

            if (data) {
                setConfig({
                    tna: data.tna,
                    limite_descubierto: data.limite_descubierto,
                    modo_tasa: data.modo_tasa || 'AUTOMATICO'
                })
            }

            // Load latest market rate
            const { data: marketData } = await supabase
                .from('indices_mercado')
                .select('tasa_plazo_fijo')
                .order('fecha', { ascending: false })
                .limit(1)
                .single()

            if (marketData) setMarketRate(marketData.tasa_plazo_fijo)

            setLoading(false)
        }

        if (organizationId) loadConfig()
    }, [organizationId, supabase])

    const handleSave = async () => {
        setSaving(true)
        setSuccess(false)

        const { error } = await supabase
            .from('configuracion_empresa')
            .upsert({
                organization_id: organizationId,
                tna: config.tna,
                limite_descubierto: config.limite_descubierto,
                modo_tasa: config.modo_tasa,
                updated_at: new Date().toISOString()
            })

        if (error) {
            console.error('Error saving config:', error)
        } else {
            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
        }
        setSaving(false)
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
        )
    }

    return (
        <Card className="bg-gray-900 border-gray-800 text-white shadow-2xl overflow-hidden border-l-4 border-l-emerald-500">
            <CardHeader className="bg-emerald-500/5">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <PiggyBank className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div>
                        <CardTitle className="text-xl font-black italic tracking-tighter">FINANZAS DE EMPRESA</CardTitle>
                        <CardDescription className="text-gray-400">
                            Configura los parámetros financieros para el cálculo de costos y salud de caja.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
                <div className="grid md:grid-cols-2 gap-8">
                    {/* TNA Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">TASA NOMINAL ANUAL (TNA %)</Label>
                            <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800">
                                <button
                                    onClick={() => setConfig({ ...config, modo_tasa: 'AUTOMATICO' })}
                                    className={`px-3 py-1 text-[9px] uppercase font-bold rounded-md transition-all ${config.modo_tasa === 'AUTOMATICO' ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    Auto (BCRA)
                                </button>
                                <button
                                    onClick={() => setConfig({ ...config, modo_tasa: 'MANUAL' })}
                                    className={`px-3 py-1 text-[9px] uppercase font-bold rounded-md transition-all ${config.modo_tasa === 'MANUAL' ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    Manual
                                </button>
                            </div>
                        </div>

                        <div className="relative group">
                            <Input
                                type="number"
                                step="0.01"
                                disabled={config.modo_tasa === 'AUTOMATICO'}
                                value={config.modo_tasa === 'AUTOMATICO' ? (marketRate ? marketRate * 100 : 75) : (config.tna * 100)}
                                onChange={(e) => setConfig({ ...config, tna: parseFloat(e.target.value) / 100 })}
                                className={`bg-gray-950 border-gray-800 transition-all h-12 text-lg font-mono pl-4 pr-12 ${config.modo_tasa === 'AUTOMATICO' ? 'opacity-50 cursor-not-allowed' : 'focus:border-emerald-500/50'}`}
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</div>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-tight">
                            {config.modo_tasa === 'AUTOMATICO'
                                ? `Usando tasa de referencia BCRA (Actualizada hoy).`
                                : `Tasa personalizada definida por el usuario.`
                            } Usada para calcular el <span className="text-emerald-500 font-bold underline">Costo de Oportunidad</span>.
                        </p>
                    </div>

                    {/* Overdraft Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">LÍMITE DE DESCUBIERTO (ARS)</Label>
                        </div>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</div>
                            <Input
                                type="number"
                                value={config.limite_descubierto}
                                onChange={(e) => setConfig({ ...config, limite_descubierto: parseFloat(e.target.value) })}
                                className="bg-gray-950 border-gray-800 focus:border-red-500/50 transition-all h-12 text-lg font-mono pl-8"
                            />
                        </div>
                        <p className="text-[10px] text-gray-500 leading-tight">
                            Define el <span className="text-red-400 font-bold underline">Acuerdo Bancario</span>.
                            Afecta las alertas de Stress Test y el Score de Salud de Caja.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
                        <TrendingDown className="h-5 w-5 text-emerald-400" />
                        <div>
                            <div className="text-[9px] uppercase font-bold text-gray-500 tracking-tighter">Impacto Estimado</div>
                            <div className="text-sm font-bold text-emerald-400">Alta Precisión</div>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="bg-black/20 border-t border-gray-800 py-6 flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className={`h-11 px-8 font-black uppercase tracking-tighter transition-all duration-500 ${success
                        ? 'bg-emerald-500 hover:bg-emerald-400 ring-4 ring-emerald-500/20'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                >
                    {saving ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : success ? (
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                    ) : (
                        <Save className="h-5 w-5 mr-2" />
                    )}
                    {saving ? 'Guardando...' : success ? '¡Guardado!' : 'Guardar Configuración'}
                </Button>
            </CardFooter>
        </Card>
    )
}
