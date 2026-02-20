
'use client'

import { useState } from 'react'
import { Check, ArrowRight, Table as TableIcon } from 'lucide-react'

type ColumnMapperProps = {
    file: File
    onMappingComplete: (mapping: any) => void
    onCancel: () => void
}

export function ColumnMapper({ file, onMappingComplete, onCancel }: ColumnMapperProps) {
    const [loading, setLoading] = useState(true)
    const [headers, setHeaders] = useState<string[]>([])
    const [previewRows, setPreviewRows] = useState<any[][]>([])
    const [error, setError] = useState<string | null>(null)

    // Mappings: key = target field, value = column index
    const [mapping, setMapping] = useState<{ [key: string]: number | null }>({
        fecha: null,
        descripcion: null,
        monto: null
    })

    // Fetch preview on mount
    useState(() => {
        const fetchPreview = async () => {
            const formData = new FormData()
            formData.append('file', file)

            try {
                const res = await fetch('/api/upload/preview', {
                    method: 'POST',
                    body: formData
                })
                if (!res.ok) throw new Error('Error al leer el archivo')
                const data = await res.json()
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

    const isValid = mapping.fecha !== null && mapping.monto !== null

    const handleSubmit = () => {
        onMappingComplete(mapping)
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
                    No reconocimos el formato de <strong>{file.name}</strong>. Ayúdanos a identificar las columnas para procesarlo.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {['fecha', 'descripcion', 'monto'].map((field) => (
                    <div key={field} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">
                            Columna {field} <span className="text-red-500">*</span>
                        </label>
                        <select
                            className="w-full bg-gray-900 border border-gray-700 text-white rounded p-2 text-sm focus:border-emerald-500 outline-none"
                            onChange={(e) => handleSelect(field, e.target.value)}
                            defaultValue=""
                        >
                            <option value="" disabled>Seleccionar columna...</option>
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
