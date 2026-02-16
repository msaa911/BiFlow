
'use client'

import { useState, useCallback } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ImportHistory } from '@/components/dashboard/import-history'
import { ColumnMapper } from '@/components/dashboard/column-mapper'

export default function UploadPage() {
    const [dragActive, setDragActive] = useState(false)
    const [files, setFiles] = useState<File[]>([])
    const [progress, setProgress] = useState(0)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [mappingFile, setMappingFile] = useState<File | null>(null)

    // New state for detailed feedback
    const [uploadResult, setUploadResult] = useState<{
        count: number;
        skipped: number;
        warnings: string[];
        reviewCount: number;
    } | null>(null)
    const [showDetails, setShowDetails] = useState(false)
    const [refreshHistory, setRefreshHistory] = useState(0)

    const router = useRouter()

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
        const validExtensions = ['.csv', '.pdf', '.xls', '.xlsx', '.txt', '.dat']
        const validFiles = newFiles.filter(file => {
            const extension = '.' + file.name.split('.').pop()?.toLowerCase();
            return validExtensions.includes(extension);
        })

        if (validFiles.length !== newFiles.length) {
            setError('Algunos archivos no eran compatibles. Formatos aceptados: PDF, Excel, CSV, TXT, DAT.')
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

    const uploadSingleFile = (file: File, onProgress: (percent: number) => void, mapping?: any): Promise<any> => {
        return new Promise((resolve, reject) => {
            const formData = new FormData()
            formData.append('file', file)
            if (mapping) {
                formData.append('mapping', JSON.stringify(mapping))
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
                } else {
                    reject(new Error(xhr.statusText || 'Error en servidor'))
                }
            }

            xhr.onerror = () => reject(new Error('Error de red'))

            xhr.open('POST', '/api/upload')
            xhr.send(formData)
        })
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
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Carga de Documentos</h2>
                <p className="text-gray-400">Sube extractos, listas de clientes, facturas o cualquier documento financiero para análisis.</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
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
                                <p className="text-xs text-gray-500">Haz clic para seleccionar (PDF, Excel, Txt, Dat, CSV)</p>
                            </div>
                            <input
                                type="file"
                                accept=".csv,.pdf,.xls,.xlsx,.txt,.dat"
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

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <h4 className="text-blue-400 font-medium mb-2 text-sm">Guía de Formatos</h4>
                <p className="text-xs text-blue-300 mb-2">
                    Nuestro sistema inteligente analizará tus archivos automáticamente. Soportamos:
                </p>
                <ul className="text-xs text-blue-300 space-y-1 list-disc list-inside">
                    <li>Extractos bancarios (PDF, Excel, CSV)</li>
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
