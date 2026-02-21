
'use client'

import { useState } from 'react'
import { Check, ArrowRight, Table as TableIcon } from 'lucide-react'

type ColumnMapperProps = {
    file: File
    context?: 'bank' | 'income' | 'expense'
    onMappingComplete: (mapping: any, saveTemplate: boolean, templateName?: string) => void
    onCancel: () => void
    importId?: string
    initialData?: { headers: string[], previewRows: any[][] }
}

export function ColumnMapper({ file, onMappingComplete, onCancel, importId, initialData }: ColumnMapperProps) {
    const [loading, setLoading] = useState(true)
    const [headers, setHeaders] = useState<string[]>([])
    const [previewRows, setPreviewRows] = useState<any[][]>([])
    const [error, setError] = useState<string | null>(null)

    // Mappings: key = target field, value = column index
    const [mapping, setMapping] = useState<{ [key: string]: number | null }>({
        fecha: null,
        descripcion: null,
        monto: null,
        cuit: null,
        cbu: null
    })

    const [saveTemplate, setSaveTemplate] = useState(false)
    const [templateName, setTemplateName] = useState('')

    // Fetch preview on mount
    useState(() => {
        if (initialData) {
            setHeaders(initialData.headers)
            setPreviewRows(initialData.previewRows)
            setLoading(false)
            return
        }

        const fetchPreview = async () => {
            try {
                let data;
                if (importId) {
                    // Fetch for existing import from storage
                    const res = await fetch(`/api/imports/preview?id=${importId}`)
                    if (!res.ok) throw new Error('Error al leer el archivo desde el historial')
                    data = await res.json()
                } else if (file && file.size > 0) {
                    // Normal upload flow path
                    const formData = new FormData()
                    formData.append('file', file)
                    const res = await fetch('/api/upload/preview', {
                        method: 'POST',
                        body: formData
                    })
                    if (!res.ok) throw new Error('Error al leer el archivo')
                    data = await res.json()
                } else {
                    return; // No file and no importId
                }

                setHeaders(data.headers)
                setPreviewRows(data.previewData)
                setLoading(false)
            } catch (e: any) {
                setError(e.message)
                setLoading(false)
            }
        }
        fetchPreview()
    })

    const handleSelect = (field: string, index: string) => {
        setMapping(prev => ({ ...prev, [field]: parseInt(index) }))
    }

    const isValid = mapping.fecha !== null && mapping.monto !== null && (!saveTemplate || templateName.trim().length > 0)

    const handleSubmit = async () => {
        if (importId) {
            setLoading(true)
            try {
                const res = await fetch('/api/imports/re-process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        importId,
                        mapping,
                        invertSigns: false // Optional: could be a toggle
                    })
                })
                if (!res.ok) throw new Error('Error al reprocesar')
                onMappingComplete(mapping, saveTemplate, templateName)
            } catch (e: any) {
                setError(e.message)
                setLoading(false)
            }
        } else {
            onMappingComplete(mapping, saveTemplate, templateName)
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-400">Analizando archivo...</div>
    if (error) return <div className="p-8 text-center text-red-400">Error: {error}</div>

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-4xl mx-auto">
            <div className="mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <TableIcon className="w-5 h-5 text-emerald-500" />
                    Asistente de Importación
                </h3>
                <p className="text-gray-400 text-sm">
                    No reconocimos el formato de <strong>{file.name}</strong>. Ayúdanos a identificar las columnas para procesarlo de forma segura.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                {[
                    { id: 'fecha', label: 'Fecha', required: true },
                    { id: 'descripcion', label: 'Concepto/Desc.', required: true },
                    { id: 'monto', label: 'Monto', required: true },
                    { id: 'cuit', label: 'CUIT/CUIL', required: false },
                    { id: 'cbu', label: 'CBU/CVU', required: false },
                ].map((field) => (
                    <div key={field.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                        <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1.5 px-1">
                            {field.label} {field.required && <span className="text-emerald-500">*</span>}
                        </label>
                        <select
                            className="w-full bg-gray-900 border border-gray-700 text-white rounded p-1.5 text-xs focus:border-emerald-500 outline-none transition-colors"
                            onChange={(e) => handleSelect(field.id, e.target.value)}
                            defaultValue=""
                        >
                            <option value="">Ignorar</option>
                            {headers.map((h, i) => (
                                <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>

            <div className="mb-6 overflow-x-auto border border-gray-800 rounded-lg">
                <table className="w-full text-xs text-left text-gray-400">
                    <thead className="bg-gray-800 text-gray-200 uppercase">
                        <tr>
                            {headers.map((h, i) => (
                                <th key={i} className={`px-4 py-2 border-b border-gray-700 ${Object.values(mapping).includes(i) ? 'bg-emerald-500/10 text-emerald-500' : ''
                                    }`}>
                                    {h || `Columna ${i + 1}`}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {previewRows.map((row, rIdx) => (
                            <tr key={rIdx} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30">
                                {row.map((cell: any, cIdx: number) => (
                                    <td key={cIdx} className="px-4 py-2 truncate max-w-[150px]">
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-gray-800/50 border border-gray-800 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-3">
                    <input
                        type="checkbox"
                        id="saveTemplate"
                        className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-emerald-600 focus:ring-emerald-500"
                        checked={saveTemplate}
                        onChange={(e) => setSaveTemplate(e.target.checked)}
                    />
                    <label htmlFor="saveTemplate" className="text-sm font-medium text-gray-300 cursor-pointer">
                        Recordar este formato para futuros archivos similares
                    </label>
                </div>

                {saveTemplate && (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                        <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1.5 px-1">
                            Nombre del Formato (ej: Banco Galicia CSV)
                        </label>
                        <input
                            type="text"
                            placeholder="Escribe un nombre..."
                            className="w-full md:w-1/2 bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm focus:border-emerald-500 outline-none"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                        />
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-3">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!isValid}
                    className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${isValid ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                >
                    Procesar Archivo <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
