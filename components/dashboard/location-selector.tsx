'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface HierarchicalLocationSelectorProps {
    formData: {
        provincia: string
        departamento: string
        localidad: string
    }
    onChange: (updates: Partial<{ provincia: string, departamento: string, localidad: string }>) => void
}

export function HierarchicalLocationSelector({ formData, onChange }: HierarchicalLocationSelectorProps) {
    const [provinces, setProvinces] = useState<string[]>([])
    const [departments, setDepartments] = useState<string[]>([])
    const [localities, setLocalities] = useState<string[]>([])
    const [loading, setLoading] = useState({ p: false, d: false, l: false })

    const supabase = createClient()

    // Fetch provinces on mount
    useEffect(() => {
        const fetchProvinces = async () => {
            setLoading(prev => ({ ...prev, p: true }))
            const { data } = await supabase
                .from('geo_argentina')
                .select('provincia')

            if (data) {
                const unique = Array.from(new Set(data.map(d => d.provincia))).sort()
                setProvinces(unique)
            }
            setLoading(prev => ({ ...prev, p: false }))
        }
        fetchProvinces()
    }, [])

    // Fetch departments when province changes
    useEffect(() => {
        if (!formData.provincia) {
            setDepartments([])
            return
        }

        const fetchDepartments = async () => {
            setLoading(prev => ({ ...prev, d: true }))
            const { data } = await supabase
                .from('geo_argentina')
                .select('departamento')
                .eq('provincia', formData.provincia)

            if (data) {
                const unique = Array.from(new Set(data.map(d => d.departamento))).sort()
                setDepartments(unique)
            }
            setLoading(prev => ({ ...prev, d: false }))
        }
        fetchDepartments()
    }, [formData.provincia])

    // Fetch localities when department changes
    useEffect(() => {
        if (!formData.departamento || !formData.provincia) {
            setLocalities([])
            return
        }

        const fetchLocalities = async () => {
            setLoading(prev => ({ ...prev, l: true }))
            const { data } = await supabase
                .from('geo_argentina')
                .select('localidad')
                .eq('provincia', formData.provincia)
                .eq('departamento', formData.departamento)

            if (data) {
                const unique = Array.from(new Set(data.map(d => d.localidad))).sort()
                setLocalities(unique)
            }
            setLoading(prev => ({ ...prev, l: false }))
        }
        fetchLocalities()
    }, [formData.departamento, formData.provincia])

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-xs text-gray-400">Provincia</Label>
                <Select
                    value={formData.provincia}
                    onValueChange={(v) => onChange({ provincia: v, departamento: '', localidad: '' })}
                >
                    <SelectTrigger className="bg-gray-900 border-gray-800">
                        {loading.p ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue placeholder="Seleccionar provincia" />}
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-800 text-white max-h-60">
                        {provinces.map(p => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs text-gray-400">Departamento/Partido</Label>
                    <Select
                        value={formData.departamento}
                        onValueChange={(v) => onChange({ departamento: v, localidad: '' })}
                        disabled={!formData.provincia || loading.d}
                    >
                        <SelectTrigger className="bg-gray-900 border-gray-800">
                            {loading.d ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue placeholder="Seleccionar departamento" />}
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-800 text-white max-h-60">
                            {departments.map(d => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-400">Localidad</Label>
                    <Select
                        value={formData.localidad}
                        onValueChange={(v) => onChange({ localidad: v })}
                        disabled={!formData.departamento || loading.l}
                    >
                        <SelectTrigger className="bg-gray-900 border-gray-800">
                            {loading.l ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue placeholder="Seleccionar localidad" />}
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-800 text-white max-h-60">
                            {localities.map(l => (
                                <SelectItem key={l} value={l}>{l}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    )
}
