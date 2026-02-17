
'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Upload, Save, MousePointerClick, Check, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SmartFormatBuilderProps {
    onClose: () => void
    onFormatSaved: () => void
}

interface FormatRule {
    start: number
    end: number
}

export function SmartFormatBuilder({ onClose, onFormatSaved }: SmartFormatBuilderProps) {
    const [file, setFile] = useState<File | null>(null)
    const [lines, setLines] = useState<string[]>([])
    const [formatName, setFormatName] = useState('')
    const [rules, setRules] = useState<Record<string, FormatRule>>({})
    const [activeField, setActiveField] = useState<string | null>(null)
    const [selection, setSelection] = useState<FormatRule | null>(null)
    const [saving, setSaving] = useState(false)

    const textRef = useRef<HTMLDivElement>(null)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (!f) return
        setFile(f)
        const text = await f.text()
        const previewLines = text.split('\n').slice(0, 10).map(l => l.replace(/(\r\n|\n|\r)/gm, ""))
        setLines(previewLines)
    }

    const handleTextSelect = (lineIndex: number) => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return

        const range = sel.getRangeAt(0)

        let container: Node | null = range.commonAncestorContainer
        // Find line-content div
        while (container && (container.nodeType !== 1 || !(container as Element).classList.contains('line-content'))) {
            container = container.parentNode
        }

        const lineDiv = container as HTMLElement
        if (!lineDiv) return

        // Calculate offsets using robust Range string length
        const preCaretRange = range.cloneRange()
        preCaretRange.selectNodeContents(lineDiv)
        preCaretRange.setEnd(range.startContainer, range.startOffset)
        const start = preCaretRange.toString().length

        const endRange = range.cloneRange()
        endRange.selectNodeContents(lineDiv)
        endRange.setEnd(range.endContainer, range.endOffset)
        const end = endRange.toString().length

        const text = lineDiv.textContent || ''

        if (Math.abs(end - start) === 0) return

        const finalStart = Math.min(start, end)
        const finalEnd = Math.max(start, end)

        console.log(`Line ${lineIndex} Selection: ${finalStart} - ${finalEnd}`)
        setSelection({ start: finalStart, end: finalEnd })
    }

    const assignRule = (field: string) => {
        if (!selection) return
        setRules(prev => ({
            ...prev,
            [field]: selection
        }))
        setSelection(null)
        setActiveField(null)
        window.getSelection()?.removeAllRanges()
    }

    const clearAllRules = () => {
        if (confirm('¿Borrar todas las reglas?')) {
            setRules({})
            setSelection(null)
            setActiveField(null)
            window.getSelection()?.removeAllRanges()
        }
    }

    const saveFormat = async () => {
        if (!formatName) return alert('Ingresa un nombre')
        if (Object.keys(rules).length === 0) return alert('Define al menos una regla')

        setSaving(true)
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return

        // Get org
        const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()

        if (!member) return

        const { error } = await supabase.from('formato_archivos').insert({
            organization_id: member.organization_id,
            nombre: formatName,
            tipo: 'fixed_width',
            reglas: rules,
            descripcion: `Creado visualmente desde ${file?.name || 'archivo'}`
        })

        setSaving(false)
        if (error) {
            alert('Error: ' + error.message)
        } else {
            onFormatSaved()
            onClose()
        }
    }

    // Render highlights on a line
    const renderLine = (text: string, idx: number) => {
        const sortedRules = Object.entries(rules)
            .sort(([, a], [, b]) => a.start - b.start)

        let lastIdx = 0
        const segments = []

        sortedRules.forEach(([field, rule]) => {
            if (rule.start > lastIdx) {
                segments.push(<span key={`${idx}-${lastIdx}-pre`}>{text.substring(lastIdx, rule.start)}</span>)
            }
            segments.push(
                <span key={`${idx}-${field}`} className="bg-blue-500/30 text-blue-200 border-b-2 border-blue-400" title={field}>
                    {text.substring(rule.start, rule.end)}
                </span>
            )
            lastIdx = rule.end
        })

        if (lastIdx < text.length) {
            segments.push(<span key={`${idx}-end`}>{text.substring(lastIdx)}</span>)
        }

        return (
            <div
                className="font-mono whitespace-pre text-sm text-gray-300 hover:bg-gray-800 cursor-text line-content selection:bg-emerald-500/40"
                onMouseUp={() => handleTextSelect(idx)}
            >
                {segments}
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 w-full max-w-4xl h-[90vh] rounded-2xl flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <MousePointerClick className="w-5 h-5 text-emerald-500" />
                            Smart Format Builder (v3)
                        </h2>
                        <p className="text-sm text-gray-400">Enseña a BiFlow cómo leer tus archivos posicionales.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">

                    {/* Sidebar Configuration */}
                    <div className="w-80 border-r border-gray-800 p-6 flex flex-col gap-6 bg-gray-900/50">
                        {/* 1. Format Name */}
                        <div>
                            <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Nombre del Formato</label>
                            <input
                                type="text"
                                placeholder="Ej: Banco Galicia Sueldos"
                                className="w-full bg-gray-800 border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-emerald-500 focus:border-emerald-500"
                                value={formatName}
                                onChange={e => setFormatName(e.target.value)}
                            />
                        </div>

                        {/* 2. Rules List */}
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-500 uppercase block">Campos Detectados</label>
                                <button
                                    onClick={clearAllRules}
                                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                    title="Borrar todas las reglas"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    Limpiar
                                </button>
                            </div>
                            <div className="space-y-2">
                                {/* Mandatory Fields Hints */}
                                {['fecha', 'monto', 'descripcion', 'cuit'].map(field => (
                                    <div key={field} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${rules[field] ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                                            <span className="text-sm font-medium text-white capitalize">{field}</span>
                                        </div>
                                        {rules[field] ? (
                                            <button onClick={() => {
                                                const newRules = { ...rules }
                                                delete newRules[field]
                                                setRules(newRules)
                                            }} className="text-gray-500 hover:text-red-400">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setActiveField(field)}
                                                disabled={!selection}
                                                className={`text-xs px-2 py-1 rounded border transition-colors ${selection
                                                    ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                                                    : 'border-gray-700 text-gray-600 cursor-not-allowed'}`}
                                            >
                                                Asignar
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Selection Info */}
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <p className="text-xs text-blue-300 font-mono">
                                {selection
                                    ? `Selección: Posición ${selection.start} - ${selection.end} (Largo: ${selection.end - selection.start})`
                                    : 'Selecciona texto en el visor para definir campos.'}
                            </p>
                            {selection && activeField && (
                                <button
                                    onClick={() => assignRule(activeField)}
                                    className="mt-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded"
                                >
                                    Confirmar para {activeField}
                                </button>
                            )}
                            {selection && !activeField && rules['fecha'] && rules['monto'] && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {['fecha', 'monto', 'descripcion', 'cuit'].filter(f => !rules[f]).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => assignRule(f)}
                                            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-2 py-1 rounded capitalize"
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 bg-black p-6 overflow-auto">
                        {!file ? (
                            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-800 rounded-xl">
                                <Upload className="w-12 h-12 text-gray-600 mb-4" />
                                <p className="text-gray-400 mb-4">Sube un archivo de ejemplo (.txt, .dat)</p>
                                <input
                                    type="file"
                                    accept=".txt,.dat,.csv"
                                    onChange={handleFileUpload}
                                    className="file:bg-emerald-600 file:border-0 file:text-white file:px-4 file:py-2 file:rounded-lg file:text-sm file:cursor-pointer text-gray-400"
                                />
                            </div>
                        ) : (
                            <div className="space-y-1" ref={textRef}>
                                {lines.map((line, i) => (
                                    <div key={i} className="flex">
                                        <span className="w-8 text-gray-700 font-mono text-xs select-none pt-0.5">{i + 1}</span>
                                        {renderLine(line, i)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white">
                        Cancelar
                    </button>
                    <button
                        onClick={saveFormat}
                        disabled={saving || !formatName || Object.keys(rules).length === 0}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Guardando...' : (
                            <>
                                <Save className="w-4 h-4" />
                                Guardar Formato
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
