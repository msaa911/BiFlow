'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PiggyBank, Save, Landmark, Plus, Loader2, CheckCircle2, Trash2, Brain, AlertTriangle, RotateCcw } from 'lucide-react'

// Interfaces actualizadas
interface BankAccount {
    id?: string
    banco_nombre: string
    cbu: string
    saldo_inicial: number
}

interface CompanyConfig {
    tna: number
    limite_descubierto: number
    modo_tasa: 'AUTOMATICO' | 'MANUAL'
    colchon_liquidez: number
}

interface TaxRule {
    id: string
    patron_busqueda: string
    es_recuperable: boolean
    omitir_siempre: boolean
    estado: string
}

interface BankAgreement {
    mantenimiento_mensual_pactado: number
    comision_cheque_porcentaje: number
}

export function CompanySettingsTab({ organizationId }: { organizationId: string }) {
    const [config, setConfig] = useState<CompanyConfig>({
        tna: 0.70,
        limite_descubierto: 0,
        modo_tasa: 'AUTOMATICO',
        colchon_liquidez: 0
    })

    const [agreement, setAgreement] = useState<BankAgreement>({
        mantenimiento_mensual_pactado: 0,
        comision_cheque_porcentaje: 0
    })

    // Estado para Cuentas Bancarias
    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [taxRules, setTaxRules] = useState<TaxRule[]>([])

    const [marketRate, setMarketRate] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [success, setSuccess] = useState(false)

    const supabase = createClient()

    useEffect(() => {
        async function loadData() {
            setLoading(true)

            // 1. Cargar Configuración General
            const { data: conf } = await supabase.from('configuracion_empresa').select('*').eq('organization_id', organizationId).maybeSingle()
            if (conf) {
                setConfig({
                    tna: conf.tna,
                    limite_descubierto: conf.limite_descubierto,
                    modo_tasa: conf.modo_tasa || 'AUTOMATICO',
                    colchon_liquidez: conf.colchon_liquidez || 0
                })
            }

            // 2. Cargar Acuerdos
            const { data: agree } = await supabase.from('convenios_bancarios').select('*').eq('organization_id', organizationId).maybeSingle()
            if (agree) {
                setAgreement({
                    mantenimiento_mensual_pactado: Number(agree.mantenimiento_mensual_pactado) || 0,
                    comision_cheque_porcentaje: Number(agree.comision_cheque_porcentaje) || 0
                })
            }

            // 3. CARGAR CUENTAS BANCARIAS
            const { data: accs } = await supabase.from('cuentas_bancarias').select('*').eq('organization_id', organizationId)
            if (accs && accs.length > 0) {
                setAccounts(accs)
            } else {
                setAccounts([{ banco_nombre: 'Banco Principal', cbu: '', saldo_inicial: 0 }])
            }

            // 4. Cargar Tasas Mercado
            const { data: market } = await supabase.from('indices_mercado').select('tasa_plazo_fijo_30d, tasa_plazo_fijo').order('fecha', { ascending: false }).limit(1).maybeSingle()
            if (market) {
                setMarketRate(market.tasa_plazo_fijo_30d || market.tasa_plazo_fijo)
            }

            // 5. Cargar Reglas de Impuestos
            const { data: rules } = await supabase
                .from('tax_intelligence_rules')
                .select('*')
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: false })

            if (rules) setTaxRules(rules)

            setLoading(false)
        }

        if (organizationId) loadData()
    }, [organizationId, supabase])

    const toggleTaxRule = async (ruleId: string, currentStatus: boolean) => {
        // We use the same API as the widget to ensure tags are synced
        const rule = taxRules.find(r => r.id === ruleId)
        if (!rule) return

        setSaving(true)
        try {
            const res = await fetch('/api/taxes/classify', {
                method: 'POST',
                body: JSON.stringify({
                    id: ruleId,
                    organization_id: organizationId,
                    es_recuperable: !currentStatus,
                    omitir_siempre: rule.omitir_siempre,
                    action: !currentStatus ? 'YES' : 'NO'
                })
            })

            if (res.ok) {
                setTaxRules(prev => prev.map(r => r.id === ruleId ? { ...r, es_recuperable: !currentStatus, estado: 'CLASIFICADO' } : r))
            }
        } catch (err) {
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    const deleteTaxRule = async (ruleId: string) => {
        const { error } = await supabase.from('tax_intelligence_rules').delete().eq('id', ruleId)
        if (!error) {
            setTaxRules(prev => prev.filter(r => r.id !== ruleId))
        }
    }

    const handlePurge = async () => {
        if (!confirm('¿Estás seguro de que deseas REINICIAR todo el entorno? Se borrarán transacciones, facturas y reglas de aprendizaje. Esta acción NO se puede deshacer.')) return
        if (!confirm('ÚLTIMA ADVERTENCIA: Se perderán todos los datos cargados. ¿Confirmar reinicio total?')) return

        setSaving(true)
        try {
            const res = await fetch('/api/data/purge', { method: 'DELETE' })
            if (res.ok) {
                alert('Entorno reiniciado con éxito. La página se recargará.')
                window.location.reload()
            } else {
                const err = await res.json()
                alert('Error al reiniciar: ' + (err.details || err.error))
            }
        } catch (err) {
            alert('Error de conexión al purgar datos.')
        } finally {
            setSaving(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        setSuccess(false)

        try {
            console.log("Iniciando guardado de configuración para organización:", organizationId)

            // 1. Guardar Config General
            const { error: errorConfig } = await supabase.from('configuracion_empresa').upsert({
                organization_id: organizationId,
                tna: config.tna,
                limite_descubierto: config.limite_descubierto,
                modo_tasa: config.modo_tasa,
                colchon_liquidez: config.colchon_liquidez,
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id' })

            if (errorConfig) throw new Error("Error en Configuración Empresa: " + errorConfig.message)

            // 2. Guardar Convenios
            const { error: errorAgree } = await supabase.from('convenios_bancarios').upsert({
                organization_id: organizationId,
                mantenimiento_mensual_pactado: agreement.mantenimiento_mensual_pactado,
                comision_cheque_porcentaje: agreement.comision_cheque_porcentaje,
                banco_nombre: 'General',
                is_active: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id' })

            if (errorAgree) throw new Error("Error en Convenios Bancarios: " + errorAgree.message)

            // 3. GUARDAR CUENTAS
            const accountsToUpsert = accounts
                .filter(acc => acc.banco_nombre.trim() !== '')
                .map(acc => {
                    const payload: any = {
                        organization_id: organizationId,
                        banco_nombre: acc.banco_nombre,
                        cbu: acc.cbu,
                        saldo_inicial: acc.saldo_inicial,
                        updated_at: new Date().toISOString()
                    }
                    if (acc.id) payload.id = acc.id
                    return payload
                })

            if (accountsToUpsert.length > 0) {
                console.log("Upserting accounts:", accountsToUpsert)
                const { data, error: errorAccounts } = await supabase
                    .from('cuentas_bancarias')
                    .upsert(accountsToUpsert)
                    .select()

                if (errorAccounts) throw new Error("Error en Cuentas Bancarias: " + errorAccounts.message)

                if (data) {
                    console.log("Cuentas guardadas:", data)
                    setAccounts(data)
                }
            }

            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
        } catch (err: any) {
            console.error("Error crítico durante el guardado:", err)
            alert(err.message || "Ocurrió un error inesperado al guardar.")
        } finally {
            setSaving(false)
        }
    }

    const updateAccount = (index: number, field: keyof BankAccount, value: any) => {
        const newAccounts = [...accounts]
        newAccounts[index] = { ...newAccounts[index], [field]: value }
        setAccounts(newAccounts)
    }

    const removeAccount = async (index: number) => {
        const accountToDelete = accounts[index]
        if (accountToDelete.id) {
            setSaving(true)
            const { error } = await supabase.from('cuentas_bancarias').delete().eq('id', accountToDelete.id)
            setSaving(false)
            if (error) {
                console.error("Error eliminando cuenta:", error)
                return
            }
        }
        const newAccounts = accounts.filter((_, i) => i !== index)
        // No permitir quedar con 0 cuentas visualmente si el usuario quiere agregar luego
        if (newAccounts.length === 0) {
            setAccounts([{ banco_nombre: '', cbu: '', saldo_inicial: 0 }])
        } else {
            setAccounts(newAccounts)
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-500 mb-4" />
        Cargando configuración...
    </div>

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-white uppercase italic">Configuración Financiera</h2>
                <p className="text-gray-400">Define tus saldos iniciales y parámetros para que la IA calcule correctamente.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">

                {/* NUEVA TARJETA: SALDOS INICIALES */}
                <Card className="bg-gray-900 border-gray-800 md:col-span-2 border-l-4 border-l-emerald-500">
                    <CardHeader className="bg-emerald-500/5">
                        <CardTitle className="flex items-center gap-2 text-white font-black italic tracking-tighter">
                            <Landmark className="h-5 w-5 text-emerald-500" />
                            CUENTAS BANCARIAS & SALDOS INICIALES
                        </CardTitle>
                        <CardDescription className="text-gray-400">
                            Ingresa el saldo real de tus cuentas al día de hoy para arrancar la conciliación.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        {accounts.map((acc, idx) => (
                            <div key={idx} className="relative grid grid-cols-1 md:grid-cols-3 gap-4 items-end p-4 bg-gray-950/50 rounded-lg border border-gray-800 transition-all hover:border-emerald-500/30 group">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeAccount(idx)}
                                    className="absolute -right-2 -top-2 h-8 w-8 rounded-full bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white border border-red-500/20 z-10"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase text-gray-500">Banco / Alias</Label>
                                    <Input
                                        value={acc.banco_nombre}
                                        onChange={(e) => updateAccount(idx, 'banco_nombre', e.target.value)}
                                        className="bg-gray-900 border-gray-700 focus:border-emerald-500/50 text-white"
                                        placeholder="Ej: Galicia Cta Cte"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] text-emerald-400 font-bold uppercase">Saldo Inicial (Arranque)</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-500 font-bold">$</span>
                                        <Input
                                            type="number"
                                            value={acc.saldo_inicial}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value)
                                                updateAccount(idx, 'saldo_inicial', isNaN(val) ? 0 : val)
                                            }}
                                            className="pl-8 bg-gray-900 border-gray-700 text-white font-mono text-lg"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase text-gray-500">CBU (Opcional)</Label>
                                    <Input
                                        value={acc.cbu}
                                        onChange={(e) => updateAccount(idx, 'cbu', e.target.value)}
                                        className="bg-gray-900 border-gray-700 focus:border-emerald-500/50 text-white"
                                        placeholder="22 dígitos"
                                    />
                                </div>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => setAccounts([...accounts, { banco_nombre: '', cbu: '', saldo_inicial: 0 }])} className="w-full border-dashed border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 hover:border-emerald-500/50 transition-all">
                            <Plus className="h-4 w-4 mr-2" /> AGREGAR OTRA CUENTA
                        </Button>
                    </CardContent>
                </Card>

                {/* PARÁMETROS DE MERCADO (Existente) */}
                <Card className="bg-gray-900 border-gray-800 border-l-4 border-l-blue-500">
                    <CardHeader className="bg-blue-500/5">
                        <CardTitle className="flex items-center gap-2 text-white font-black italic tracking-tighter">
                            <PiggyBank className="h-5 w-5 text-blue-500" />
                            COSTO DE OPORTUNIDAD
                        </CardTitle>
                        <CardDescription className="text-gray-400">Parámetros para calcular dinero ocioso.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-xs font-bold uppercase text-gray-400">Tasa Nominal Anual (TNA)</Label>
                                <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800">
                                    <button onClick={() => setConfig({ ...config, modo_tasa: 'AUTOMATICO' })} className={`px-3 py-1 text-[10px] font-black rounded transition-all ${config.modo_tasa === 'AUTOMATICO' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500'}`}>AUTO</button>
                                    <button onClick={() => setConfig({ ...config, modo_tasa: 'MANUAL' })} className={`px-3 py-1 text-[10px] font-black rounded transition-all ${config.modo_tasa === 'MANUAL' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500'}`}>MANUAL</button>
                                </div>
                            </div>
                            <div className="relative">
                                <Input
                                    type="number"
                                    value={config.modo_tasa === 'AUTOMATICO' ? ((marketRate || 0) * 100).toFixed(2) : (config.tna * 100).toFixed(2)}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value)
                                        setConfig({ ...config, tna: (isNaN(val) ? 0 : val) / 100 })
                                    }}
                                    disabled={config.modo_tasa === 'AUTOMATICO'}
                                    className="bg-gray-950 border-gray-800 text-lg font-mono pl-4 pr-12 focus:border-blue-500/50 text-white"
                                />
                                <span className="absolute right-4 top-3 text-gray-500 font-bold">%</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-gray-400">Colchón de Liquidez</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-3 text-gray-500 font-bold">$</span>
                                <Input
                                    type="number"
                                    value={config.colchon_liquidez}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value)
                                        setConfig({ ...config, colchon_liquidez: isNaN(val) ? 0 : val })
                                    }}
                                    className="pl-8 bg-gray-950 border-gray-800 text-lg font-mono focus:border-emerald-500/50 text-white"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 italic">Monto mínimo a mantener en cuenta (no se considera ocioso).</p>
                        </div>
                    </CardContent>
                </Card>

                {/* ACUERDOS (Existente) */}
                <Card className="bg-gray-900 border-gray-800 border-l-4 border-l-red-500">
                    <CardHeader className="bg-red-500/5">
                        <CardTitle className="flex items-center gap-2 text-white font-black italic tracking-tighter uppercase">Acuerdos Bancarios</CardTitle>
                        <CardDescription className="text-gray-400">Para auditar comisiones y descubiertos.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-gray-400">Límite Descubierto Total</Label>
                            <Input
                                type="number"
                                value={config.limite_descubierto}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value)
                                    setConfig({ ...config, limite_descubierto: isNaN(val) ? 0 : val })
                                }}
                                className="bg-gray-950 border-gray-800 text-lg font-mono focus:border-red-500/50 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-gray-400">Mantenimiento Pactado ($/mes)</Label>
                            <Input
                                type="number"
                                value={agreement.mantenimiento_mensual_pactado}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value)
                                    setAgreement({ ...agreement, mantenimiento_mensual_pactado: isNaN(val) ? 0 : val })
                                }}
                                className="bg-gray-950 border-gray-800 text-lg font-mono focus:border-red-500/50 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-gray-400">Comisión Cheque (%)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={agreement.comision_cheque_porcentaje}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value)
                                    setAgreement({ ...agreement, comision_cheque_porcentaje: isNaN(val) ? 0 : val })
                                }}
                                className="bg-gray-950 border-gray-800 text-lg font-mono focus:border-red-500/50 text-white"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* NUEVA TARJETA: REGLAS DE IMPUESTOS */}
                <Card className="bg-gray-900 border-gray-800 md:col-span-2 border-l-4 border-l-purple-500">
                    <CardHeader className="bg-purple-500/5">
                        <CardTitle className="flex items-center gap-2 text-white font-black italic tracking-tighter uppercase">
                            <Brain className="h-5 w-5 text-purple-500" />
                            Reglas de Impuestos (Aprendizaje)
                        </CardTitle>
                        <CardDescription className="text-gray-400">
                            Gestiona cómo BiFlow clasifica los impuestos detectados en tus extractos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {taxRules.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-800 text-[10px] uppercase text-gray-500 font-bold">
                                            <th className="pb-3 pl-2">Concepto Detectado</th>
                                            <th className="pb-3">Estado</th>
                                            <th className="pb-3">¿Es Recuperable?</th>
                                            <th className="pb-3 text-right pr-2">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {taxRules.map((rule: any) => (
                                            <tr key={rule.id} className="group hover:bg-white/5 transition-colors">
                                                <td className="py-4 pl-2 font-mono text-xs text-white max-w-[300px] truncate">
                                                    <div className="flex flex-col">
                                                        <span>{rule.patron_busqueda}</span>
                                                        <span className="text-[9px] text-gray-500 uppercase">{rule.categoria || 'impuesto'}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 text-[10px] font-bold">
                                                    <span className={`px-2 py-0.5 rounded-full ${rule.estado === 'PENDIENTE' ? 'bg-amber-500/10 text-amber-500 animate-pulse' : rule.omitir_siempre ? 'bg-gray-800 text-gray-400' : 'bg-purple-500/10 text-purple-400'}`}>
                                                        {rule.estado === 'PENDIENTE' ? 'NUEVO' : rule.omitir_siempre ? 'IGNORADO' : 'CLASIFICADO'}
                                                    </span>
                                                </td>
                                                <td className="py-4">
                                                    <button
                                                        onClick={() => toggleTaxRule(rule.id, rule.es_recuperable)}
                                                        className={`px-3 py-1 rounded text-[10px] font-black transition-all ${rule.es_recuperable ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-500'}`}
                                                    >
                                                        {rule.es_recuperable ? 'SÍ (RECO)' : rule.categoria === 'servicio' ? 'NO (GASTO)' : 'NO (COSTO)'}
                                                    </button>
                                                </td>
                                                <td className="py-4 text-right pr-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => deleteTaxRule(rule.id)}
                                                        className="h-8 w-8 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500 italic text-sm">
                                No hay reglas guardadas aún. El sistema aprenderá a medida que clasifiques impuestos en el Centro de Auditoría.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ZONA DE PELIGRO / REINICIO */}
            <Card className="bg-red-500/5 border-red-500/20 md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-red-500 font-black italic tracking-tighter uppercase flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Zona de Peligro
                    </CardTitle>
                    <CardDescription className="text-red-400/70">
                        Acciones destructivas para mantenimiento y pruebas.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                        <div className="space-y-1">
                            <p className="text-white font-bold">Reiniciar Entorno de Prueba</p>
                            <p className="text-xs text-red-400/80">Borra todos los extractos, facturas, hallazgos y el aprendizaje de la IA para esta organización.</p>
                        </div>
                        <Button
                            variant="destructive"
                            onClick={handlePurge}
                            disabled={saving}
                            className="bg-red-600 hover:bg-red-500 font-black uppercase tracking-tighter"
                        >
                            {saving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            Reiniciar Todo
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
                <Button onClick={handleSave} disabled={saving} size="lg" className={`h-14 px-8 text-lg font-black uppercase tracking-tighter shadow-2xl transition-all duration-500 ${success ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                    {saving ? <Loader2 className="animate-spin mr-2 h-6 w-6" /> : success ? <CheckCircle2 className="mr-2 h-6 w-6" /> : <Save className="mr-2 h-6 w-6" />}
                    {saving ? 'Guardando...' : success ? '¡GUARDADO!' : 'GUARDAR CONFIGURACIÓN'}
                </Button>
            </div>
        </div>
    )
}
