'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Search, MapPin, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Location {
    localidad: string
    departamento: string
    provincia: string
}

interface LocationSelectorProps {
    value: string
    onChange: (locality: string, department: string, province: string) => void
    className?: string
}

export function LocationSelector({ value, onChange, className }: LocationSelectorProps) {
    const [search, setSearch] = useState(value)
    const [results, setResults] = useState<Location[]>([])
    const [loading, setLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setSearch(value)
    }, [value])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSearch = async (term: string) => {
        setSearch(term)
        if (term.length < 3) {
            setResults([])
            setIsOpen(false)
            return
        }

        setLoading(true)
        const supabase = createClient()

        try {
            const { data, error } = await supabase
                .from('geo_argentina')
                .select('localidad, departamento, provincia')
                .ilike('localidad', `%${term}%`)
                .limit(10)

            if (!error && data) {
                setResults(data)
                setIsOpen(true)
            }
        } catch (err) {
            console.error('Error fetching locations:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSelect = (loc: Location) => {
        onChange(loc.localidad, loc.departamento, loc.provincia)
        setSearch(loc.localidad)
        setIsOpen(false)
    }

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                    placeholder="Buscar localidad..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => search.length >= 3 && setIsOpen(true)}
                    className="bg-gray-900 border-gray-800 pl-10"
                />
                {loading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-emerald-500" />
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-800 rounded-md shadow-xl max-h-60 overflow-y-auto">
                    {results.map((loc, idx) => (
                        <button
                            key={`${loc.localidad}-${loc.provincia}-${idx}`}
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-gray-800 flex items-start gap-3 transition-colors border-b border-gray-800 last:border-0"
                            onClick={() => handleSelect(loc)}
                        >
                            <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="text-sm font-medium text-white">{loc.localidad}</div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-tighter">
                                    {loc.departamento} • {loc.provincia}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
