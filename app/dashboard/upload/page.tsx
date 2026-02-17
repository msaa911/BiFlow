
'use client'

import { useState, useCallback, useEffect } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, X, AlertTriangle, ChevronDown, ChevronUp, Settings, HelpCircle, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ImportHistory } from '@/components/dashboard/import-history'
import { ColumnMapper } from '@/components/dashboard/column-mapper'
import { SmartFormatBuilder } from '@/components/dashboard/smart-format-builder'

export default function UploadPage() {
    const [dragActive, setDragActive] = useState(false)
    const [files, setFiles] = useState<File[]>([])
    const [progress, setProgress] = useState(0)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [mappingFile, setMappingFile] = useState<File | null>(null)
    const [showFormatBuilder, setShowFormatBuilder] = useState(false)
    const [formats, setFormats] = useState<any[]>([])
    const [selectedFormat, setSelectedFormat] = useState<string>('')

    // New state for detailed feedback
    const [uploadResult, setUploadResult] = useState<{
        count: number;
        skipped: number;
        warnings: string[];
        reviewCount: number;
    } | null>(null)
    const [showDetails, setShowDetails] = useState(false)
    const [refreshHistory, setRefreshHistory] = useState(0)

    // Sign Confirmation State
    const [confirmationData, setConfirmationData] = useState<{
        file: File;
        exampleRow: any;
        onProgress: (p: number) => void;
    } | null>(null)
    const [showSignModal, setShowSignModal] = useState(false)

    const router = useRouter()

    useEffect(() => {
        fetchFormats()
    }, [])

    const fetchFormats = async () => {
        try {
            const res = await fetch('/api/formats')
            if (res.ok) {
                const data = await res.json()
                setFormats(data)
            }
        } catch (e) {
            console.error('Failed to fetch formats')
        }
    }

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        } else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            validateAndAddFiles(Array.from(e.dataTransfer.files))
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            validateAndAddFiles(Array.from(e.target.files))
        }
    }

    const validateAndAddFiles = (newFiles: File[]) => {
        const validExtensions = ['.csv', '.xls', '.xlsx', '.txt', '.dat']
        const validFiles = newFiles.filter(file => {
            const extension = '.' + file.name.split('.').pop()?.toLowerCase();
            return validExtensions.includes(extension);
        })

        if (validFiles.length !== newFiles.length) {
            setError('Algunos archivos no eran compatibles. Formatos aceptados: Excel, CSV, TXT, DAT.')
        } else {
            setError(null)
        }

        setFiles(prev => [...prev, ...validFiles])
    }

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    const uploadFiles = async () => {
        if (files.length === 0) return

        setUploading(true)
        setProgress(0)
        setError(null)
        setUploadResult(null)

        let completed = 0
        const totalFiles = files.length
        const totalProgressPerFile = 100 / totalFiles

        // Accumulate results
        let totalCount = 0
        let totalSkipped = 0
        let totalReview = 0
        let allWarnings: string[] = []

        for (const file of files) {
            try {
                const result = await uploadSingleFile(file, (percent) => {
                    const currentBase = completed * totalProgressPerFile
                    const currentIncrement = (percent * totalProgressPerFile) / 100
                    setProgress(Math.round(currentBase + currentIncrement))
                })

                if (result) {
                    totalCount += result.count || 0
                    totalSkipped += result.skipped || 0
                    totalReview += result.reviewCount || 0
                    if (result.warnings && Array.isArray(result.warnings)) {
                        allWarnings = [...allWarnings, ...result.warnings]
                    }
                }

                completed++
            } catch (err: any) {
                console.error(err)
                setError(`Error al subir ${file.name}: ${err.message}`)
                setUploading(false)
                return
            }
        }

        setSuccess(true)
        setProgress(100)
        setUploadResult({
            count: totalCount,
            skipped: totalSkipped,
            warnings: allWarnings,
            reviewCount: totalReview
        })
        setRefreshHistory(prev => prev + 1)

        // Don't auto-redirect if there are warnings or skipped items, so user can see them
        if (allWarnings.length === 0 && totalSkipped === 0 && totalReview === 0) {
            setTimeout(() => {
                router.refresh()
                router.push('/dashboard')
            }, 2000)
        }
    }

    const handleSignConfirmation = async (invert: boolean) => {
        if (!confirmationData) return

        setShowSignModal(false)
        setUploading(true)
        setError(null)

        try {
            const result = await uploadSingleFile(
                confirmationData.file,
                confirmationData.onProgress,
                undefined,
                invert
            )

            setSuccess(true)
            setProgress(100)
            setUploadResult({
                count: result.count,
                skipped: result.skipped,
                warnings: result.warnings,
                reviewCount: result.reviewCount || 0
            })
            setRefreshHistory(prev => prev + 1)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setUploading(false)
            setConfirmationData(null)
        }
    }

    const uploadSingleFile = (file: File, onProgress: (percent: number) => void, mapping?: any, invertSigns?: boolean): Promise<any> => {
        return new Promise((resolve, reject) => {
            const formData = new FormData()
            formData.append('file', file)
            if (mapping) {
                formData.append('mapping', JSON.stringify(mapping))
            }
            if (selectedFormat) {
                formData.append('formatId', selectedFormat)
            }
            if (invertSigns !== undefined) {
                formData.append('invertSigns', String(invertSigns))
            }

            const xhr = new XMLHttpRequest()

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100
                    onProgress(percentComplete)
                }
            }

            xhr.onload = () => {
                if (xhr.status === 200) {
                    try {
                        const response = JSON.parse(xhr.responseText)
                        resolve(response)
                    } catch (e) {
                        resolve({ count: 0, skipped: 0, warnings: [] })
                    }
                } else if (xhr.status === 409) {
                    // Requires Confirmation
                    try {
                        const res = JSON.parse(xhr.responseText)
                        if (res.status === 'requires_confirmation') {
                            setConfirmationData({
                                file,
                                exampleRow: res.exampleRow,
                                onProgress
                            })
                            setShowSignModal(true)
                            setUploading(false)
                            // We don't resolve/reject here yet, UI handles the next step
                        } else {
                            reject(new Error(res.error || 'Conflicto en servidor'))
                        }
                    } catch (e) {
                        reject(new Error('Error al procesar confirmación'))
                    }
                } else {
                    try {
                        const res = JSON.parse(xhr.responseText)
                        reject(new Error(res.error || xhr.statusText || 'Error en servidor'))
                    } catch (e) {
                        reject(new Error(xhr.statusText || 'Error en servidor'))
                    }
                }
            }

            xhr.onerror = () => reject(new Error('Error de red'))

            xhr.open('POST', '/api/upload')
            xhr.send(formData)
        })
    }

    if (showFormatBuilder) {
        return (
            <SmartFormatBuilder
                onClose={() => setShowFormatBuilder(false)}
                onFormatSaved={async (newFormatId?: string, fileToProcess?: File) => {
                    await fetchFormats()
                    setShowFormatBuilder(false)
                    if (newFormatId) {
                        setSelectedFormat(newFormatId)
                        if (fileToProcess) {
                            // Automatically add to files list and trigger upload flow
                            setFiles([fileToProcess])
                        }
                    }
                }}
            />
        )
    }

    if (mappingFile) {
        return (
            <div className="py-8">
                <ColumnMapper
                    file={mappingFile}
                    onCancel={() => setMappingFile(null)}
                    onMappingComplete={async (mapping) => {
                        console.log('Mapping:', mapping)
                        setUploading(true)
                        setError(null)
                        try {
                            const result = await uploadSingleFile(mappingFile, (p) => setProgress(p), mapping)
                            setMappingFile(null)
                            // Show success state
                            setSuccess(true)
                            setUploadResult({
                                count: result.count,
                                skipped: result.skipped,
                                warnings: result.warnings,
                                reviewCount: result.reviewCount || 0
                            })
                            setRefreshHistory(prev => prev + 1)
                        } catch (e: any) {
                            alert('Error al procesar con mapeo: ' + e.message)
                        } finally {
                            setUploading(false)
                        }
                    }}
                />
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Carga de Documentos</h2>
                    <p className="text-gray-400">Sube extractos, listas de clientes, facturas o cualquier documento financiero para análisis.</p>
                </div>
                <button
                    onClick={() => setShowFormatBuilder(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs border border-gray-700 transition-colors"
                    title="Usar solo si el cargador automático falla (ej. archivos bancarios antiguos)"
                >
                    <Settings className="w-3 h-3" />
                    Configurar Formato Manual
                </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
                {/* Format Selector */}
                {formats.length > 0 && !success && (
                    <div className="mb-6">
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase">Formato de Archivo (Opcional)</label>
                        <div className="flex gap-2">
                            <select
                                value={selectedFormat}
                                onChange={(e) => setSelectedFormat(e.target.value)}
                                className="flex-1 bg-gray-800 border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:ring-emerald-500 focus:border-emerald-500"
                            >
                                <option value="">Detección Automática (Recomendado)</option>
                                {formats.map(f => (
                                    <option key={f.id} value={f.id}>{f.nombre} ({f.tipo === 'fixed_width' ? 'Manual' : 'Auto'})</option>
                                ))}
                            </select>
                            {selectedFormat && (
                                <button
                                    onClick={async () => {
                                        if (!confirm('¿Estás seguro de eliminar este formato guardado?')) return
                                        try {
                                            const res = await fetch(`/api/formats?id=${selectedFormat}`, { method: 'DELETE' })
                                            if (res.ok) {
                                                setSelectedFormat('')
                                                fetchFormats()
                                            } else {
                                                alert('Error al eliminar')
                                            }
                                        } catch (e) {
                                            alert('Error de conexión')
                                        }
                                    }}
                                    className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors"
                                    title="Eliminar formato seleccionado"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {!success ? (
                    <>
                        <div
                            className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl transition-all mb-6 ${dragActive ? 'border-emerald-500 bg-emerald-500/5' : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800 hover:border-emerald-500'
                                }`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                                <Upload className={`w-10 h-10 mb-3 transition-colors ${dragActive ? 'text-emerald-500' : 'text-gray-500'}`} />
                                <p className="mb-1 text-base font-medium text-gray-300">
                                    Arrastra tus archivos aquí
                                </p>
                                <p className="text-xs text-gray-500">Haz clic para seleccionar (Excel, Txt, Dat, CSV)</p>
                            </div>
                            <input
                                type="file"
                                accept=".csv,.xls,.xlsx,.txt,.dat"
                                multiple
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={handleChange}
                                disabled={uploading}
                            />
                        </div>

                        {files.length > 0 && (
                            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                                {files.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-gray-700 rounded text-emerald-500">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-white truncate max-w-[200px]">{file.name}</p>
                                                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        </div>
                                        {!uploading && (
                                            <button
                                                onClick={() => removeFile(idx)}
                                                className="text-gray-500 hover:text-red-400 p-1 rounded-full hover:bg-gray-700 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {uploading && (
                            <div className="w-full space-y-2 mb-6">
                                <div className="flex justify-between text-xs font-medium text-gray-400">
                                    <span>Procesando {files.length} archivos...</span>
                                    <span>{progress}%</span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                <p className="text-sm font-medium">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={uploadFiles}
                            disabled={files.length === 0 || uploading}
                            className={`w-full font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${files.length === 0 || uploading
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 hover:shadow-emerald-500/30 active:scale-[0.98]'
                                }`}
                        >
                            {uploading ? 'Subiendo...' : `Procesar ${files.length > 0 ? files.length : ''} Archivo${files.length !== 1 ? 's' : ''}`}
                        </button>

                        {files.length === 1 && !uploading && !success && (
                            <div className="text-center mt-3">
                                <button
                                    onClick={() => setMappingFile(files[0])}
                                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                                >
                                    ¿Problemas con el formato? Usar Asistente de Importación
                                </button>
                            </div>
                        )}

                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-300">
                        {uploadResult && (uploadResult.warnings.length > 0 || uploadResult.skipped > 0 || uploadResult.reviewCount > 0) ? (
                            <div className="w-full">
                                <div className="flex flex-col items-center mb-6">
                                    <div className="p-3 bg-yellow-500/10 rounded-full mb-3">
                                        <AlertTriangle className="w-10 h-10 text-yellow-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-1">Carga Parcial</h3>
                                    <p className="text-gray-400 text-center text-sm">
                                        Se procesaron {uploadResult.count} registros. <br />
                                        <span className="text-yellow-500">{uploadResult.skipped} omitidos</span>,
                                        <span className="text-purple-400"> {uploadResult.reviewCount} en revisión</span>.
                                    </p>
                                </div>

                                <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 mb-6">
                                    <button
                                        onClick={() => setShowDetails(!showDetails)}
                                        className="w-full flex items-center justify-between p-4 bg-gray-800 hover:bg-gray-750 transition-colors"
                                    >
                                        <span className="text-sm font-medium text-gray-300">Ver detalles de exclusion</span>
                                        {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>

                                    {showDetails && (
                                        <div className="p-4 bg-black/20 max-h-60 overflow-y-auto border-t border-gray-700">
                                            {uploadResult.warnings.length > 0 ? (
                                                <ul className="space-y-2">
                                                    {uploadResult.warnings.map((w, i) => (
                                                        <li key={i} className="text-xs text-gray-400 flex gap-2">
                                                            <span className="text-yellow-500 flex-shrink-0">•</span>
                                                            {w}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-xs text-gray-500">Registros duplicados o vacíos.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {uploadResult.reviewCount > 0 && (
                                    <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-between gap-3 text-purple-300">
                                        <div className="flex items-center gap-3">
                                            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-bold text-white">{uploadResult.reviewCount} items en cuarentena</p>
                                                <p className="text-xs text-purple-300/80">Requieren tu revisión manual para ser aprobados.</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => router.push('/dashboard/quarantine')}
                                            className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 rounded-lg text-xs font-medium text-white transition-colors"
                                        >
                                            Revisar Ahora
                                        </button>
                                    </div>
                                )}

                                {uploadResult.reviewCount > 0 && (
                                    <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-between gap-3 text-purple-300">
                                        <div className="flex items-center gap-3">
                                            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-bold text-white">{uploadResult.reviewCount} items en cuarentena</p>
                                                <p className="text-xs text-purple-300/80">Requieren tu revisión manual para ser aprobados.</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => router.push('/dashboard/quarantine')}
                                            className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 rounded-lg text-xs font-medium text-white transition-colors"
                                        >
                                            Revisar Ahora
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={() => {
                                        router.refresh()
                                        router.push('/dashboard')
                                    }}
                                    className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
                                >
                                    Continuar al Dashboard
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <CheckCircle className="w-20 h-20 text-emerald-500 mb-6" />
                                <h3 className="text-2xl font-bold text-white mb-2">¡Carga Completada!</h3>
                                <p className="text-gray-400">Se han procesado {uploadResult?.count} registros correctamente.</p>
                                <p className="text-sm text-gray-500 mt-4">Redirigiendo al dashboard...</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Sign Confirmation Modal */}
            {showSignModal && confirmationData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in duration-200">
                        <div className="flex items-center gap-3 text-emerald-500 mb-4">
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <HelpCircle className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white">Confirma tus Datos</h3>
                        </div>

                        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                            No detectamos columnas de Débito/Crédito. Tomamos este ejemplo del archivo para clasificar los signos correctamente:
                        </p>

                        <div className="bg-gray-850 border border-gray-700 rounded-xl p-4 mb-8">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-medium text-gray-500 uppercase">Concepto</span>
                                <span className="text-xs font-medium text-gray-500 uppercase">Monto</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-white truncate max-w-[200px]">
                                    {confirmationData.exampleRow.concepto}
                                </span>
                                <span className={`text-sm font-mono font-bold ${confirmationData.exampleRow.monto < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    ${Math.abs(confirmationData.exampleRow.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    <span className="ml-1 text-[10px] opacity-70">({confirmationData.exampleRow.monto < 0 ? '-' : '+'})</span>
                                </span>
                            </div>
                        </div>

                        <h4 className="text-white text-base font-bold text-center mb-4">
                            ¿Este movimiento es un <span className="text-red-400 underline underline-offset-4">GASTO</span>?
                        </h4>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => {
                                    // User says it IS a Gasto (Should be Negative)
                                    // If current is Positive (> 0), we must INVERT to make it Negative.
                                    // If current is Negative (< 0), we keep it (FALSE).
                                    const isPositive = confirmationData.exampleRow.monto > 0
                                    handleSignConfirmation(isPositive)
                                }}
                                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
                            >
                                SÍ, es un Gasto
                            </button>
                            <button
                                onClick={() => {
                                    // User says it IS an Ingreso (Should be Positive)
                                    // If current is Negative (< 0), we must INVERT to make it Positive.
                                    // If current is Positive (> 0), we keep it (FALSE).
                                    const isNegative = confirmationData.exampleRow.monto < 0
                                    handleSignConfirmation(isNegative)
                                }}
                                className="py-3 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold border border-gray-700 transition-all active:scale-95"
                            >
                                NO, es un Ingreso
                            </button>
                        </div>

                        <p className="mt-6 text-center text-[10px] text-gray-500 italic">
                            Esta elección se aplicará a todas las filas del archivo.
                        </p>
                    </div>
                </div>
            )}

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <h4 className="text-blue-400 font-medium mb-2 text-sm">Guía de Formatos</h4>
                <p className="text-xs text-blue-300 mb-2">
                    Nuestro sistema inteligente analizará tus archivos automáticamente. Soportamos:
                </p>
                <ul className="text-xs text-blue-300 space-y-1 list-disc list-inside">
                    <li>Planillas de movimientos (Excel, CSV)</li>
                    <li>Lista de clientes o proveedores (con CUIT)</li>
                    <li>Archivos de Interbanking (.txt, .dat)</li>
                    <li>Planillas de cobros y pagos</li>
                </ul>
            </div>

            <div className="pt-8 border-t border-gray-800">
                <ImportHistory key={refreshHistory} />
            </div>
        </div>
    )
}
