'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PiggyBank, Save, Landmark, Plus, Loader2, CheckCircle2, Trash2, Brain, AlertTriangle, RotateCcw, RefreshCw, User, Settings } from 'lucide-react'
// Eliminados Dialog imports ya que no se usan más en esta pestaña

// Interfaces actualizadas
interface BankAccount {
    id?: string
    banco_nombre: string
    cbu: string
    saldo_inicial: number
    colchon_liquidez?: number
    limite_descubierto?: number
    mantenimiento_pactado?: number
    comision_cheque?: number
}

interface CompanyConfig {
    tna: number
    limite_descubierto: number
    modo_tasa: 'AUTOMATICO' | 'MANUAL'
    tasa_referencia_auto: 'PLAZO_FIJO' | 'BADLAR' | string
    colchon_liquidez: number
}

interface TaxRule {
    id: string
    patron_busqueda: string
    es_recuperable: boolean
    omitir_siempre: boolean
    estado: string
}

// interface BankAgreement deprecated in favor of BankAccount fields

export function CompanySettingsTab({ organizationId }: { organizationId: string }) {
    const [config, setConfig] = useState<CompanyConfig>({
        tna: 0.70,
        limite_descubierto: 0,
        modo_tasa: 'AUTOMATICO',
        tasa_referencia_auto: 'PLAZO_FIJO',
        colchon_liquidez: 0
    })

    // Removed global agreement state

    // Estado para Cuentas Bancarias
    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [editingAccountIndex, setEditingAccountIndex] = useState<number | null>(null)
    const [taxRules, setTaxRules] = useState<TaxRule[]>([])

    const [marketRates, setMarketRates] = useState<{ PLAZO_FIJO: number, BADLAR: number, bancos: Record<string, number>, updatedAt?: string }>({ PLAZO_FIJO: 0, BADLAR: 0, bancos: {} })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [success, setSuccess] = useState(false)
    const [syncingRate, setSyncingRate] = useState(false)

    // Estado para equipo
    const [members, setMembers] = useState<any[]>([])
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviting, setInviting] = useState(false)

    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        async function loadData() {
            if (!organizationId) {
                console.warn("CompanySettingsTab: No organizationId provided")
                setLoading(false)
                return
            }

            setLoading(true)

            try {
                // Ejecutar todas las consultas en paralelo
                const [
                    confRes,
                    accsRes,
                    marketRes,
                    rulesRes,
                    teamRes
                ] = await Promise.all([
                    supabase.from('configuracion_empresa').select('*').eq('organization_id', organizationId).maybeSingle(),
                    supabase.from('cuentas_bancarias').select('*').eq('organization_id', organizationId),
                    supabase.from('indices_mercado').select('tasa_plazo_fijo_30d, tasa_plazo_fijo, tasa_badlar, tasas_bancos, updated_at').order('fecha', { ascending: false }).limit(1).maybeSingle(),
                    supabase.from('tax_intelligence_rules').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
                    supabase.from('organization_members').select('id, role, user_id, created_at').eq('organization_id', organizationId)
                ])

                if (confRes.data) {
                    setConfig({
                        tna: confRes.data.tna,
                        limite_descubierto: confRes.data.limite_descubierto,
                        modo_tasa: confRes.data.modo_tasa || 'AUTOMATICO',
                        tasa_referencia_auto: confRes.data.tasa_referencia_auto || 'PLAZO_FIJO',
                        colchon_liquidez: confRes.data.colchon_liquidez || 0
                    })
                }

                // 3. Procesar Cuentas Bancarias
                if (accsRes.data && accsRes.data.length > 0) {
                    setAccounts(accsRes.data)
                } else {
                    setAccounts([{ banco_nombre: 'Banco Principal', cbu: '', saldo_inicial: 0, colchon_liquidez: 0, limite_descubierto: 0, mantenimiento_pactado: 0, comision_cheque: 0 }])
                }

                if (marketRes.data) {
                    setMarketRates({
                        PLAZO_FIJO: (marketRes.data.tasa_plazo_fijo_30d || marketRes.data.tasa_plazo_fijo || 0) > 1 ? (marketRes.data.tasa_plazo_fijo_30d || marketRes.data.tasa_plazo_fijo || 0) / 100 : (marketRes.data.tasa_plazo_fijo_30d || marketRes.data.tasa_plazo_fijo || 0),
                        BADLAR: (marketRes.data.tasa_badlar || 0) > 1 ? (marketRes.data.tasa_badlar || 0) / 100 : (marketRes.data.tasa_badlar || 0),
                        bancos: Object.fromEntries(
                            Object.entries(marketRes.data.tasas_bancos || {}).map(([b, t]: [string, any]) => [b, (t > 1 ? t / 100 : t)])
                        ),
                        updatedAt: marketRes.data.updated_at
                    })
                }

                // 5. Procesar Reglas de Impuestos
                if (rulesRes.data) {
                    setTaxRules(rulesRes.data)
                }

                // 6. Procesar Miembros del Equipo
                if (teamRes.data) {
                    setMembers(teamRes.data)
                }

            } catch (err) {
                console.error("Error loading settings data:", err)
            } finally {
                setLoading(false)
            }
        }

        loadData()
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
        if (!confirm('¿Seguro que quieres eliminar esta regla? El sistema volverá a detectarla si las transacciones siguen presentes.')) return

        setSaving(true)
        try {
            const { error } = await supabase.from('tax_intelligence_rules').delete().eq('id', ruleId)
            if (error) {
                console.error("Error eliminando regla:", error)
                alert("No se pudo eliminar la regla: " + error.message)
                return
            }
            setTaxRules(prev => prev.filter(r => r.id !== ruleId))
        } catch (err: any) {
            console.error(err)
            alert("Error de conexión al eliminar la regla.")
        } finally {
            setSaving(false)
        }
    }

    const handleSyncMarketRate = async () => {
        setSyncingRate(true)
        try {
            const res = await fetch('/api/market/sync', { method: 'POST' })
            const data = await res.json()
            if (data.success) {
                setMarketRates({
                    PLAZO_FIJO: data.tasa,
                    BADLAR: data.tasa_badlar || 0,
                    bancos: data.tasas_bancos || {},
                    updatedAt: data.updated_at
                })

                // Actualizamos la TNA actual según la referencia seleccionada
                let nuevaTna = data.tasa; // Default PROMEDIO
                if (config.tasa_referencia_auto === 'BADLAR') {
                    nuevaTna = data.tasa_badlar || 0;
                } else if (data.tasas_bancos && data.tasas_bancos[config.tasa_referencia_auto]) {
                    nuevaTna = data.tasas_bancos[config.tasa_referencia_auto];
                }

                setConfig(prev => ({ ...prev, tna: nuevaTna, modo_tasa: 'AUTOMATICO' }))
                alert(`Tasas actualizadas correctamente.`)
            } else {
                throw new Error(data.error || 'Error al sincronizar tasa')
            }
        } catch (err: any) {
            console.error(err)
            alert("No se pudo obtener la tasa del mercado: " + err.message)
        } finally {
            setSyncingRate(false)
        }
    }

    const handleFullReset = async () => {
        if (!confirm('¡PELIGRO! Esto eliminará TODAS las transacciones, comprobantes e historial de importaciones de tu organización. Esta acción NO se puede deshacer. ¿Estás seguro?')) return
        if (!confirm('Confirmación final: ¿Realmente quieres BORRAR TODO?')) return

        setSaving(true)
        try {
            const res = await fetch('/api/data/purge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'full_reset' })
            })
            if (res.ok) {
                alert('Reinicio completo exitoso. La página se recargará.')
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

    const handleCleanOrphans = async () => {
        if (!confirm('Esto eliminará todas las transacciones sin archivo asociado (huérfanas) que pueden estar causando duplicados. ¿Continuar?')) return

        setSaving(true)
        try {
            const res = await fetch('/api/data/purge', { method: 'POST' })
            if (res.ok) {
                alert('Limpieza de huérfanos completada.')
            } else {
                const err = await res.json()
                alert('Error en la limpieza: ' + (err.details || err.error))
            }
        } catch (err) {
            alert('Error de conexión.')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteAllClients = async () => {
        if (!confirm('¡ATENCIÓN! Esto eliminará TODOS los clientes de tu organización. Esta acción NO se puede deshacer. ¿Seguro?')) return
        if (!confirm('Confirmación final: ¿Realmente quieres borrar todos los clientes?')) return

        setSaving(true)
        try {
            const res = await fetch('/api/data/purge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'delete_clients' })
            })
            if (res.ok) {
                alert('Todos los clientes han sido eliminados.')
            } else {
                const err = await res.json()
                alert('Error al eliminar clientes: ' + (err.details || err.error))
            }
        } catch (err) {
            alert('Error de conexión.')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteAllSuppliers = async () => {
        if (!confirm('¡ATENCIÓN! Esto eliminará TODOS los proveedores de tu organización. Esta acción NO se puede deshacer. ¿Seguro?')) return
        if (!confirm('Confirmación final: ¿Realmente quieres borrar todos los proveedores?')) return

        setSaving(true)
        try {
            const res = await fetch('/api/data/purge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'delete_suppliers' })
            })
            if (res.ok) {
                alert('Todos los proveedores han sido eliminados.')
            } else {
                const err = await res.json()
                alert('Error al eliminar proveedores: ' + (err.details || err.error))
            }
        } catch (err) {
            alert('Error de conexión.')
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
                tasa_referencia_auto: config.tasa_referencia_auto,
                colchon_liquidez: config.colchon_liquidez,
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id' })

            if (errorConfig) throw new Error("Error en Configuración Empresa: " + errorConfig.message)

            // 2. Eliminar legacy convenios si es necesario (opcional, por ahora lo dejamos)

            // 3. GUARDAR CUENTAS
            const accountsWithId = accounts
                .filter(acc => acc.banco_nombre.trim() !== '' && acc.id)
                .map(acc => ({
                    id: acc.id,
                    organization_id: organizationId,
                    banco_nombre: acc.banco_nombre,
                    cbu: acc.cbu,
                    saldo_inicial: acc.saldo_inicial,
                    colchon_liquidez: acc.colchon_liquidez || 0,
                    limite_descubierto: acc.limite_descubierto || 0,
                    mantenimiento_pactado: acc.mantenimiento_pactado || 0,
                    comision_cheque: acc.comision_cheque || 0,
                    updated_at: new Date().toISOString()
                }))

            const accountsNew = accounts
                .filter(acc => acc.banco_nombre.trim() !== '' && !acc.id)
                .map(acc => ({
                    organization_id: organizationId,
                    banco_nombre: acc.banco_nombre,
                    cbu: acc.cbu,
                    saldo_inicial: acc.saldo_inicial,
                    colchon_liquidez: acc.colchon_liquidez || 0,
                    limite_descubierto: acc.limite_descubierto || 0,
                    mantenimiento_pactado: acc.mantenimiento_pactado || 0,
                    comision_cheque: acc.comision_cheque || 0,
                    updated_at: new Date().toISOString()
                }))

            let results: any[] = []

            if (accountsWithId.length > 0) {
                console.log("Upserting existing accounts:", accountsWithId)
                const { data, error } = await supabase
                    .from('cuentas_bancarias')
                    .upsert(accountsWithId)
                    .select()
                if (error) throw new Error("Error actualizando Cuentas Bancarias: " + error.message)
                if (data) results = [...results, ...data]
            }

            if (accountsNew.length > 0) {
                console.log("Inserting new accounts:", accountsNew)
                const { data, error } = await supabase
                    .from('cuentas_bancarias')
                    .insert(accountsNew)
                    .select()
                if (error) throw new Error("Error insertando Cuentas Bancarias: " + error.message)
                if (data) results = [...results, ...data]
            }

            if (results.length > 0) {
                console.log("Cuentas guardadas:", results)
                // Reconstruimos la lista para mantener el orden visual
                const updatedAccounts = accounts.map(acc => {
                    if (acc.id) {
                        return results.find(r => r.id === acc.id) || acc
                    } else {
                        // Match por nombre para las nuevas si hay coincidencia
                        return results.find(r => r.banco_nombre === acc.banco_nombre && !accountsWithId.some(aw => aw.id === r.id)) || acc
                    }
                })
                setAccounts(updatedAccounts)
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
            setAccounts([{ banco_nombre: '', cbu: '', saldo_inicial: 0, colchon_liquidez: 0, limite_descubierto: 0, mantenimiento_pactado: 0, comision_cheque: 0 }])
        } else {
            setAccounts(newAccounts)
        }
    }

    const handleInvite = async () => {
        if (!inviteEmail.trim()) return
        setInviting(true)
        try {
            const res = await fetch('/api/orgs/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: inviteEmail,
                    organizationId: organizationId,
                    role: 'member'
                })
            })
            const data = await res.json()
            if (res.ok) {
                alert('Invitación enviada con éxito a ' + inviteEmail)
                setInviteEmail('')
            } else {
                alert('Error: ' + data.error)
            }
        } catch (err) {
            alert('Error de conexión al enviar invitación')
        } finally {
            setInviting(false)
        }
    }

    const removeMember = async (memberId: string) => {
        if (!confirm('¿Seguro que quieres quitar a este miembro de la organización?')) return
        setSaving(true)
        try {
            const { error } = await supabase.from('organization_members').delete().eq('id', memberId)
            if (error) throw error
            setMembers(prev => prev.filter(m => m.id !== memberId))
        } catch (err: any) {
            alert('Error al eliminar miembro: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-500">
        < Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-500 mb-4" />
        Cargando configuración...
    </div >

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
                    <CardContent className="space-y-6 pt-6">
                        {accounts.map((acc, idx) => (
                            <div key={idx} className="relative flex flex-col gap-6 p-6 bg-gray-950/50 rounded-2xl border border-gray-800 transition-all hover:border-emerald-500/30 group">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeAccount(idx)}
                                    className="absolute -right-2 -top-2 h-8 w-8 rounded-full bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white border border-red-500/20 z-10"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>

                                {/* Sección 1: Datos Básicos */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                    <div className="md:col-span-4 space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-gray-500 tracking-widest h-4 flex items-center">Banco / Identificador</Label>
                                        <Input
                                            value={acc.banco_nombre}
                                            onChange={(e) => updateAccount(idx, 'banco_nombre', e.target.value)}
                                            className="bg-gray-900 border-gray-800 focus:border-emerald-500/50 text-white h-11 text-sm"
                                            placeholder="Ej: Galicia Principal"
                                        />
                                    </div>
                                    <div className="md:col-span-4 space-y-2">
                                        <Label className="text-[10px] text-emerald-400 font-black uppercase tracking-widest h-4 flex items-center">Saldo Inicial (Arranque)</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-3 text-gray-600 font-bold">$</span>
                                            <Input
                                                type="number"
                                                value={acc.saldo_inicial}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value)
                                                    updateAccount(idx, 'saldo_inicial', isNaN(val) ? 0 : val)
                                                }}
                                                className="pl-8 bg-gray-900 border-gray-800 text-white font-mono h-11 text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="md:col-span-4 space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-gray-500 tracking-widest h-4 flex items-center">CBU / ALIAS</Label>
                                        <Input
                                            value={acc.cbu}
                                            onChange={(e) => updateAccount(idx, 'cbu', e.target.value)}
                                            className="bg-gray-900 border-gray-800 focus:border-emerald-500/50 text-white font-mono h-11 text-sm"
                                            placeholder="22 dígitos"
                                        />
                                    </div>
                                </div>

                                {/* Sección 2: Acuerdos Bancarios (Lo que el usuario pidió ver directo) */}
                                <div className="pt-6 border-t border-gray-800/50">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Settings className="w-3 h-3 text-emerald-500/50" />
                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">Acuerdos Bancarios & Límites</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                        <div className="md:col-span-3 space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest h-4 flex items-center">Colchón de Liquidez</Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-3 text-gray-600 font-bold">$</span>
                                                <Input
                                                    type="number"
                                                    value={acc.colchon_liquidez}
                                                    onChange={(e) => updateAccount(idx, 'colchon_liquidez', parseFloat(e.target.value) || 0)}
                                                    className="pl-7 bg-gray-900/50 border-gray-800 text-white font-mono text-sm h-11"
                                                />
                                            </div>
                                            <p className="text-[9px] text-gray-600 italic leading-tight">Monto mínimo a mantener.</p>
                                        </div>

                                        <div className="md:col-span-3 space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest h-4 flex items-center">Límite Descubierto</Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-3 text-gray-600 font-bold">$</span>
                                                <Input
                                                    type="number"
                                                    value={acc.limite_descubierto}
                                                    onChange={(e) => updateAccount(idx, 'limite_descubierto', parseFloat(e.target.value) || 0)}
                                                    className="pl-7 bg-gray-900/50 border-gray-800 text-white font-mono text-sm h-11"
                                                />
                                            </div>
                                        </div>

                                        <div className="md:col-span-3 space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest h-4 flex items-center">Mantenimiento ($/mes)</Label>
                                            <Input
                                                type="number"
                                                value={acc.mantenimiento_pactado}
                                                onChange={(e) => updateAccount(idx, 'mantenimiento_pactado', parseFloat(e.target.value) || 0)}
                                                className="bg-gray-900/50 border-gray-800 text-white font-mono text-sm h-11"
                                            />
                                        </div>

                                        <div className="md:col-span-3 space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest h-4 flex items-center">Comisión Cheque (%)</Label>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={acc.comision_cheque}
                                                    onChange={(e) => updateAccount(idx, 'comision_cheque', parseFloat(e.target.value) || 0)}
                                                    className="bg-gray-900/50 border-gray-800 text-white font-mono text-sm pr-6 h-11"
                                                />
                                                <span className="absolute right-2 top-3 text-gray-600 font-bold">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => setAccounts([...accounts, { banco_nombre: '', cbu: '', saldo_inicial: 0 }])} className="w-full border-dashed border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 hover:border-emerald-500/50 transition-all">
                            <Plus className="h-4 w-4 mr-2" /> AGREGAR OTRA CUENTA
                        </Button>
                    </CardContent>
                </Card>

                {/* PARÁMETROS DE MERCADO (Existente) */}
                <Card className="bg-gray-900/30 border-gray-800 backdrop-blur-sm overflow-hidden border-l-4 border-l-blue-500 shadow-2xl md:col-span-2">
                    <CardHeader className="border-b border-gray-800/50 bg-gray-900/50 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <PiggyBank className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-black tracking-tight text-white uppercase italic">Costo de Oportunidad</CardTitle>
                                <CardDescription className="text-gray-400 text-xs">Parámetros para calcular el rendimiento del dinero ocioso.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        <div className="grid grid-cols-1 md:grid-cols-5 divide-x divide-gray-800">
                            {/* Columna Izquierda: Control Actual */}
                            <div className="md:col-span-2 p-6 space-y-8 bg-gray-950/20">
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <Label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Modo de Tasa</Label>
                                        <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800">
                                            <button
                                                onClick={() => setConfig({ ...config, modo_tasa: 'AUTOMATICO' })}
                                                className={`px-3 py-1 text-[10px] font-black rounded transition-all ${config.modo_tasa === 'AUTOMATICO' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-blue-400'}`}
                                            >
                                                AUTO
                                            </button>
                                            <button
                                                onClick={() => setConfig({ ...config, modo_tasa: 'MANUAL' })}
                                                className={`px-3 py-1 text-[10px] font-black rounded transition-all ${config.modo_tasa === 'MANUAL' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-blue-400'}`}
                                            >
                                                MANUAL
                                            </button>
                                        </div>
                                    </div>

                                    <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">TNA Aplicada (%)</Label>
                                    <div className="relative mb-4">
                                        <Input
                                            type="number"
                                            value={(config.tna * 100).toFixed(2)}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value)
                                                setConfig({ ...config, tna: (isNaN(val) ? 0 : val) / 100, modo_tasa: 'MANUAL' })
                                            }}
                                            disabled={config.modo_tasa === 'AUTOMATICO' && syncingRate}
                                            className={`bg-gray-950 border-gray-800 text-3xl h-20 font-mono text-center text-white transition-all ${config.modo_tasa === 'AUTOMATICO' ? 'border-blue-500/50 text-blue-400 ring-2 ring-blue-500/10' : 'focus:border-blue-500'}`}
                                        />
                                        <span className={`absolute right-6 top-6 text-2xl font-bold ${config.modo_tasa === 'AUTOMATICO' ? 'text-blue-500' : 'text-gray-600'}`}>%</span>
                                    </div>

                                    {config.modo_tasa === 'AUTOMATICO' && (
                                        <div className="flex items-center gap-2 p-3 bg-blue-500/5 rounded-lg border border-blue-500/20 mb-4 animate-in fade-in slide-in-from-top-2">
                                            <CheckCircle2 className="w-4 h-4 text-blue-500" />
                                            <p className="text-[11px] text-blue-100 font-medium italic">
                                                Sincronizado con {
                                                    config.tasa_referencia_auto === 'BADLAR' ? 'BADLAR' :
                                                        config.tasa_referencia_auto === 'PLAZO_FIJO' ? 'Promedio Mercado' :
                                                            (() => {
                                                                const name = config.tasa_referencia_auto as string;
                                                                if (name.includes('NACION')) return 'BANCO NACIÓN';
                                                                if (name.includes('SANTANDER')) return 'SANTANDER';
                                                                if (name.includes('GALICIA')) return 'GALICIA';
                                                                if (name.includes('PROVINCIA')) return 'BANCO PROVINCIA';
                                                                if (name.includes('BBVA')) return 'BBVA';
                                                                if (name.includes('MACRO')) return 'MACRO';
                                                                if (name.includes('CREDICOOP')) return 'CREDICOOP';
                                                                if (name.includes('CIUDAD')) return 'BANCO CIUDAD';
                                                                return name.replace('BANCO ', '').replace(' S.A.', '').replace('ARGENTINA', '').trim();
                                                            })()
                                                }
                                            </p>
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleSyncMarketRate}
                                        disabled={syncingRate}
                                        variant="outline"
                                        className="w-full h-12 bg-gray-900 border-gray-800 hover:bg-gray-800 hover:text-blue-400 transition-all font-bold text-xs gap-2 group"
                                    >
                                        {syncingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className={`h-4 w-4 transition-transform ${syncingRate ? '' : 'group-hover:rotate-180'}`} />}
                                        ACTUALIZAR TASAS DE MERCADO
                                    </Button>

                                    {marketRates.updatedAt && (
                                        <div className="mt-4 text-center animate-in fade-in zoom-in duration-500">
                                            <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">
                                                Última actualización de TNA
                                            </p>
                                            <p className="text-[10px] text-blue-400/70 font-mono font-bold">
                                                {
                                                    new Date(marketRates.updatedAt).toLocaleString('es-AR', {
                                                        timeZone: 'America/Argentina/Buenos_Aires',
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: true
                                                    })
                                                } ART
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Columna Derecha: Selección de Referencia */}
                            <div className="md:col-span-3 p-6 flex flex-col h-full bg-black/20">
                                <div className="flex items-center justify-between mb-4">
                                    <Label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Opciones de Referencia</Label>
                                    <span className="text-[9px] text-gray-600 font-bold">VALORES DEL DÍA</span>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar max-h-[320px]">
                                    {/* Principales Índices */}
                                    <div className="grid grid-cols-2 gap-2 mb-4">
                                        <button
                                            onClick={() => setConfig({ ...config, tasa_referencia_auto: 'PLAZO_FIJO', tna: marketRates.PLAZO_FIJO, modo_tasa: 'AUTOMATICO' })}
                                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${config.tasa_referencia_auto === 'PLAZO_FIJO' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-100 ring-1 ring-emerald-500/20 shadow-[0_5px_15px_-5px_rgba(16,185,129,0.3)]' : 'bg-gray-900 border-gray-800 hover:border-gray-700 text-gray-400'}`}
                                        >
                                            <span className="text-[9px] font-black uppercase opacity-60 mb-1">PROMEDIO PF</span>
                                            <span className="text-xl font-mono font-bold">
                                                {((marketRates.PLAZO_FIJO * 100) % 1 === 0) ? (marketRates.PLAZO_FIJO * 100).toFixed(0) : (marketRates.PLAZO_FIJO * 100).toFixed(2)}%
                                            </span>
                                        </button>

                                        <button
                                            onClick={() => setConfig({ ...config, tasa_referencia_auto: 'BADLAR', tna: marketRates.BADLAR, modo_tasa: 'AUTOMATICO' })}
                                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${config.tasa_referencia_auto === 'BADLAR' ? 'bg-blue-500/10 border-blue-500/50 text-blue-100 ring-1 ring-blue-500/20 shadow-[0_5px_15px_-5px_rgba(59,130,246,0.3)]' : 'bg-gray-900 border-gray-800 hover:border-gray-700 text-gray-400'}`}
                                        >
                                            <span className="text-[9px] font-black uppercase opacity-60 mb-1">BADLAR BCRA</span>
                                            <span className="text-xl font-mono font-bold">
                                                {((marketRates.BADLAR * 100) % 1 === 0) ? (marketRates.BADLAR * 100).toFixed(0) : (marketRates.BADLAR * 100).toFixed(2)}%
                                            </span>
                                        </button>
                                    </div>

                                    {/* Bancos Individuales */}
                                    <div className="space-y-1.5 pt-2 border-t border-gray-800/50">
                                        <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-3">Principales Entidades</p>
                                        {Object.entries(marketRates.bancos).length > 0 ? (
                                            Object.entries(marketRates.bancos).map(([banco, tasa]) => (
                                                <button
                                                    key={banco}
                                                    onClick={() => setConfig({ ...config, tasa_referencia_auto: banco as any, tna: tasa, modo_tasa: 'AUTOMATICO' })}
                                                    className={`flex items-center justify-between w-full p-3 rounded-lg border transition-all ${config.tasa_referencia_auto === banco ? 'bg-amber-500/10 border-amber-500/50 text-amber-100' : 'bg-gray-900/30 border-gray-800/40 hover:border-gray-700 text-gray-500'}`}
                                                >
                                                    <span className="text-xs font-bold uppercase truncate max-w-[150px]">
                                                        {(() => {
                                                            if (banco.includes('NACION')) return 'BANCO NACIÓN';
                                                            if (banco.includes('SANTANDER')) return 'SANTANDER';
                                                            if (banco.includes('GALICIA')) return 'GALICIA';
                                                            if (banco.includes('PROVINCIA')) return 'BANCO PROVINCIA';
                                                            if (banco.includes('BBVA')) return 'BBVA';
                                                            if (banco.includes('MACRO')) return 'MACRO';
                                                            if (banco.includes('CREDICOOP')) return 'CREDICOOP';
                                                            if (banco.includes('CIUDAD')) return 'BANCO CIUDAD';
                                                            return banco.replace('BANCO ', '').replace(' S.A.', '').replace('ARGENTINA', '').trim();
                                                        })()}
                                                    </span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm font-mono font-bold">
                                                            {((tasa * 100) % 1 === 0) ? (tasa * 100).toFixed(0) : (tasa * 100).toFixed(2)}%
                                                        </span>
                                                        <div className={`w-2 h-2 rounded-full ${config.tasa_referencia_auto === banco ? 'bg-amber-500 animate-pulse' : 'bg-transparent'}`} />
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="text-center py-8 px-4 rounded-xl border border-dashed border-gray-800 opacity-50">
                                                <p className="text-[10px] text-gray-500 italic">No hay datos de entidades disponibles. Pulsa &quot;Actualizar&quot; para sincronizar.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* ACUERDOS (Moved to per-account) */}

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
                                                        className={`px-3 py-1 rounded text-[10px] font-black transition-all ${rule.es_recuperable ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-800 text-gray-400'}`}
                                                    >
                                                        {rule.es_recuperable
                                                            ? (rule.categoria === 'servicio' ? 'SÍ (IVA RECO)' : 'SÍ (CRÉDITO FISCAL)')
                                                            : (rule.categoria === 'servicio' ? 'NO (GASTO FINAL)' : 'NO (COSTO FISCAL)')}
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

                {/* NUEVA TARJETA: GESTIÓN DE EQUIPO */}
                <Card className="bg-gray-900 border-gray-800 md:col-span-2 border-l-4 border-l-orange-500">
                    <CardHeader className="bg-orange-500/5">
                        <CardTitle className="flex items-center gap-2 text-white font-black italic tracking-tighter uppercase">
                            <User className="h-5 w-5 text-orange-500" />
                            Gestión de Equipo
                        </CardTitle>
                        <CardDescription className="text-gray-400">
                            Invita a otros usuarios a colaborar en esta organización.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <Input
                                    type="email"
                                    placeholder="email@colega.com"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="bg-gray-950 border-gray-800 text-white"
                                />
                            </div>
                            <Button
                                onClick={handleInvite}
                                disabled={inviting || !inviteEmail}
                                className="bg-orange-600 hover:bg-orange-500 text-white font-bold"
                            >
                                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                                INVITAR
                            </Button>
                        </div>

                        <div className="mt-6">
                            <h4 className="text-xs font-bold uppercase text-gray-500 mb-4 tracking-widest">Miembros Actuales</h4>
                            <div className="grid gap-2">
                                {members.map((member) => (
                                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-950/50 rounded-lg border border-gray-800 group">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">
                                                {member.role === 'owner' ? '★' : 'U'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">Usuario ID: {member.user_id.substring(0, 8)}...</p>
                                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">{member.role}</p>
                                            </div>
                                        </div>
                                        {member.role !== 'owner' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeMember(member.id)}
                                                className="h-8 w-8 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div >

            {/* SECCIÓN DE MANTENIMIENTO & EMERGENCIA */}
            < Card className="bg-gray-900 border-gray-800 md:col-span-2 border-l-4 border-l-red-500/50" >
                <CardHeader className="bg-red-500/5">
                    <CardTitle className="flex items-center gap-2 text-white font-black italic tracking-tighter uppercase">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        Mantenimiento y Emergencia
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                        Herramientas avanzadas para resolver inconsistencias o reiniciar datos.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-gray-950/50 rounded-xl border border-gray-800">
                        <div className="space-y-1">
                            <p className="text-white font-bold text-sm">Limpiar Registros Huérfanos</p>
                            <p className="text-[10px] text-gray-500">Elimina transacciones duplicadas que no tienen un archivo de importación asociado.</p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleCleanOrphans}
                            disabled={saving}
                            className="border-red-500/20 hover:bg-red-500/10 text-red-400 font-bold text-xs"
                        >
                            {saving ? <Loader2 className="animate-spin mr-2 h-3.5 w-3.5" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                            Limpiar Huérfanos
                        </Button>
                    </div>

                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                        <div className="space-y-1">
                            <p className="text-white font-bold text-sm uppercase">Reinicio Total del Sistema</p>
                            <p className="text-[10px] text-red-400/80 italic">¡PELIGRO! Borra TODA la información: transacciones, facturas, reglas y archivos de esta organización.</p>
                        </div>
                        <Button
                            variant="destructive"
                            onClick={handleFullReset}
                            disabled={saving}
                            className="bg-red-600 hover:bg-red-500 font-black uppercase tracking-tighter shadow-lg shadow-red-500/20"
                        >
                            {saving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            REINICIAR TODO
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col items-start justify-between gap-4 p-4 bg-blue-500/5 rounded-xl border border-blue-500/20">
                            <div className="space-y-1">
                                <p className="text-white font-bold text-sm uppercase">Purgar Clientes</p>
                                <p className="text-[10px] text-blue-400/80">Elimina exclusivamente la base de datos de Clientes.</p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleDeleteAllClients}
                                disabled={saving}
                                className="w-full border-blue-500/20 hover:bg-blue-500/10 text-blue-400 font-bold text-xs"
                            >
                                {saving ? <Loader2 className="animate-spin mr-2 h-3.5 w-3.5" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                                ELIMINAR CLIENTES
                            </Button>
                        </div>

                        <div className="flex flex-col items-start justify-between gap-4 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                            <div className="space-y-1">
                                <p className="text-white font-bold text-sm uppercase">Purgar Proveedores</p>
                                <p className="text-[10px] text-emerald-400/80">Elimina exclusivamente la base de datos de Proveedores.</p>
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleDeleteAllSuppliers}
                                disabled={saving}
                                className="w-full border-emerald-500/20 hover:bg-emerald-500/10 text-emerald-400 font-bold text-xs"
                            >
                                {saving ? <Loader2 className="animate-spin mr-2 h-3.5 w-3.5" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                                ELIMINAR PROVEEDORES
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card >

            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
                <Button onClick={handleSave} disabled={saving} size="lg" className={`h-14 px-8 text-lg font-black uppercase tracking-tighter shadow-2xl transition-all duration-500 ${success ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                    {saving ? <Loader2 className="animate-spin mr-2 h-6 w-6" /> : success ? <CheckCircle2 className="mr-2 h-6 w-6" /> : <Save className="mr-2 h-6 w-6" />}
                    {saving ? 'Guardando...' : success ? '¡GUARDADO!' : 'GUARDAR CONFIGURACIÓN'}
                </Button>
            </div>
        </div >
    )
}
