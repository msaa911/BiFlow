
'use client'

import { useState, useCallback, useEffect } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, X, AlertTriangle, ChevronDown, ChevronUp, Settings, HelpCircle, Trash2, ArrowRight, Download, FileSpreadsheet } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ImportHistory } from '@/components/dashboard/import-history'
import { ColumnMapper } from '@/components/dashboard/column-mapper'
import { SmartFormatBuilder } from '@/components/dashboard/smart-format-builder'

export const dynamic = 'force-dynamic'

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
    const [uploadContext, setUploadContext] = useState<'bank' | 'income' | 'expense'>('bank')

    // New state for detailed feedback
    const [uploadResult, setUploadResult] = useState<{
        count: number;
        skipped: number;
        warnings: string[];
        reviewCount: number;
        findingsCount?: number;
        isUpdate?: boolean;
    } | null>(null)
    const [showDetails, setShowDetails] = useState(false)
    const [refreshHistory, setRefreshHistory] = useState(0)
    const [isFirstUpload, setIsFirstUpload] = useState(false)

    // Sign Confirmation State
    const [confirmationData, setConfirmationData] = useState<{
        file: File;
        exampleRow: any;
        onProgress: (p: number) => void;
    } | null>(null)
    const [showSignModal, setShowSignModal] = useState(false)

    const router = useRouter()

    const searchParams = useSearchParams()

    useEffect(() => {
        const remapId = searchParams.get('remap')
        const name = searchParams.get('name')
        if (remapId) {
            setMappingFile({ name: name || 'Archivo' } as File)
            setReprocessingId(remapId)
        }
    }, [searchParams])

    useEffect(() => {
        fetchFormats()
        checkFirstUpload()
    }, [])

    const checkFirstUpload = async () => {
        try {
            const res = await fetch('/api/imports')
            if (res.ok) {
                const data = await res.json()
                // If no imports exist, this will be the first one
                setIsFirstUpload(data.length === 0)
            }
        } catch (e) {
            console.error('Failed to check import history')
        }
    }

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
            onFileSelect(Array.from(e.dataTransfer.files))
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileSelect(Array.from(e.target.files))
        }
    }

    const [reprocessingId, setReprocessingId] = useState<string | null>(null)

    useEffect(() => {
        const handleOpenRemap = (e: any) => {
            const item = e.detail
            setMappingFile({ name: item.nombre_archivo } as File)
            setReprocessingId(item.id)
        }
        window.addEventListener('open-remap', handleOpenRemap)
        return () => window.removeEventListener('open-remap', handleOpenRemap)
    }, [])

    const onFileSelect = (newFiles: File[]) => {
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

    const uploadFiles = async (overrideFiles?: File[], overrideFormatId?: string) => {
        const filesToProcess = overrideFiles || files
        if (filesToProcess.length === 0) return

        setUploading(true)
        setSuccess(false)
        setProgress(0)
        setError(null)
        setUploadResult(null)

        let completed = 0
        const totalFiles = filesToProcess.length
        const totalProgressPerFile = 100 / totalFiles

        // Accumulate results
        let totalCount = 0
        let totalSkipped = 0
        let totalReview = 0
        let allWarnings: string[] = []

        for (const file of filesToProcess) {
            try {
                const result = await uploadSingleFile(file, (percent) => {
                    const currentBase = completed * totalProgressPerFile
                    const currentIncrement = (percent * totalProgressPerFile) / 100
                    setProgress(Math.round(currentBase + currentIncrement))
                }, undefined, undefined, overrideFormatId, uploadContext)

                if (result) {
                    totalCount += result.count || 0
                    totalSkipped += result.skipped || 0
                    totalReview += result.reviewCount || 0
                    const findings = result.findingsCount || 0
                    if (result.warnings && Array.isArray(result.warnings)) {
                        allWarnings = [...allWarnings, ...result.warnings]
                    }
                    // Update findings count in state if present
                    setUploadResult(prev => prev ? { ...prev, findingsCount: (prev.findingsCount || 0) + findings } : null)
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
            reviewCount: totalReview,
            findingsCount: 0 // Will be updated if a single file returns it
        })
        setRefreshHistory(prev => prev + 1)

        // Remove auto-redirect to give user time to read and choose path
        /*
        if (allWarnings.length === 0 && totalSkipped === 0 && totalReview === 0 && totalCount > 0) {
            setTimeout(() => {
                router.refresh()
                router.push('/dashboard')
            }, 2000)
        }
        */
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
                invert,
                undefined,
                uploadContext
            )

            setSuccess(true)
            setProgress(100)
            setUploadResult({
                count: result.count,
                skipped: result.skipped,
                warnings: result.warnings,
                reviewCount: result.reviewCount || 0,
                findingsCount: result.findingsCount || 0
            })
            setRefreshHistory(prev => prev + 1)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setUploading(false)
            setConfirmationData(null)
        }
    }

    const uploadSingleFile = (file: File, onProgress: (percent: number) => void, mapping?: any, invertSigns?: boolean, overrideFormatId?: string, context?: string): Promise<any> => {
        return new Promise((resolve, reject) => {
            const formData = new FormData()
            formData.append('file', file)
            if (mapping) {
                formData.append('mapping', JSON.stringify(mapping))
            }
            if (context) {
                formData.append('context', context)
            }

            const formatToUse = overrideFormatId || selectedFormat
            if (formatToUse) {
                formData.append('formatId', formatToUse)
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
                } else if (xhr.status === 409 || xhr.status === 422) {
                    // Requires Confirmation (409) or Visual Mapping (422)
                    try {
                        const res = JSON.parse(xhr.responseText)
                        if (res.status === 'requires_mapping') {
                            setMappingFile(file)
                            setUploading(false)
                            resolve({ count: 0, skipped: 0, warnings: [] })
                            return
                        }

                        if (res.status === 'requires_confirmation') {
                            if (res.requiresTraining) {
                                setShowFormatBuilder(true)
                                setUploading(false)
                                resolve({ count: 0, skipped: 0, warnings: [] }) // Resolve silently as we open a new flow
                                return
                            }

                            setConfirmationData({
                                file,
                                exampleRow: res.exampleRow,
                                onProgress
                            })
                            setShowSignModal(true)
                            setUploading(false)
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
                initialFile={files[0]} // Pass the file that failed
                onFormatSaved={async (newFormatId?: string, fileToProcess?: File) => {
                    await fetchFormats()
                    setShowFormatBuilder(false)
                    if (newFormatId) {
                        setSelectedFormat(newFormatId)
                        if (fileToProcess) {
                            setFiles([fileToProcess])
                            // SILENT AUTO-RETRY!
                            uploadFiles([fileToProcess], newFormatId)
                        }
                    }
                }}
            />
        )
    }

    if (mappingFile) {
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <ColumnMapper
                    file={mappingFile}
                    importId={reprocessingId || undefined}
                    onMappingComplete={async (mapping, save, name) => {
                        if (reprocessingId) {
                            setUploading(true)
                            try {
                                const res = await fetch('/api/imports/re-process', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        importId: reprocessingId,
                                        mapping
                                    })
                                })

                                if (!res.ok) throw new Error('Error al re-procesar')
                                const data = await res.json()

                                setMappingFile(null)
                                setReprocessingId(null)
                                setSuccess(true)
                                setUploadResult({
                                    count: data.count || 0,
                                    skipped: 0,
                                    warnings: [],
                                    reviewCount: 0,
                                    isUpdate: true
                                })
                            } catch (e: any) {
                                setError(e.message)
                            } finally {
                                setUploading(false)
                            }
                        } else {
                            // Assuming handleUpload is a function that takes files, mapping, save, and name
                            // This part of the instruction seems to imply a function that doesn't exist in the provided code.
                            // I will adapt it to call uploadSingleFile directly for the single mappingFile.
                            setUploading(true)
                            setError(null)
                            try {
                                // 1. If user wants to save this as a permanent template
                                if (save && name) {
                                    await fetch('/api/formats', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            nombre: name,
                                            tipo: 'delimited',
                                            reglas: mapping,
                                            descripcion: `Creado manualmente desde mapping para ${mappingFile.name}`
                                        })
                                    })
                                    await fetchFormats()
                                }

                                // 2. Process the file with the mapping (ephemeral or just saved)
                                const result = await uploadSingleFile(mappingFile, (p) => setProgress(p), mapping)

                                // 3. Show success state
                                setSuccess(true)
                                setUploadResult({
                                    count: result.count,
                                    skipped: result.skipped,
                                    warnings: result.warnings,
                                    reviewCount: result.reviewCount || 0,
                                    findingsCount: result.findingsCount || 0
                                })
                                setRefreshHistory(prev => prev + 1)
                            } catch (e: any) {
                                console.error('Mapping process error:', e)
                                setError('Error al procesar con mapeo: ' + e.message)
                            } finally {
                                setUploading(false)
                            }
                            setMappingFile(null)
                        }
                    }}
                    onCancel={() => {
                        setMappingFile(null)
                        setReprocessingId(null)
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
                    <p className="text-gray-400 text-sm">Sube extractos, listas de clientes, facturas o cualquier documento financiero para análisis.</p>
                    <a
                        href="/templates/biflow_formato_recomendado.xlsx"
                        download
                        className="inline-flex items-center gap-2 mt-2 text-xs text-emerald-500 hover:text-emerald-400 font-medium transition-colors cursor-pointer"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Descargar Formato Recomendado (.xlsx)
                    </a>
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
                {/* Document Type Selector */}
                {!success && !uploading && (
                    <div className="mb-8">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Tipo de Documento</label>
                        <div className="flex bg-gray-800 p-1 rounded-xl gap-1">
                            <button
                                onClick={() => setUploadContext('bank')}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${uploadContext === 'bank' ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                                Extracto Bancario
                            </button>
                            <button
                                onClick={() => setUploadContext('income')}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${uploadContext === 'income' ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                                Ingresos
                            </button>
                            <button
                                onClick={() => setUploadContext('expense')}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${uploadContext === 'expense' ? 'bg-purple-500 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                                Egresos
                            </button>
                        </div>
                        <p className="mt-2 text-[10px] text-gray-500 text-center italic">
                            {uploadContext === 'bank' && 'Los movimientos irán a tu Flujo de Caja bancario.'}
                            {uploadContext === 'income' && 'Las facturas se cargarán en Cuentas por Cobrar.'}
                            {uploadContext === 'expense' && 'Las facturas se cargarán en Cuentas por Pagar.'}
                        </p>
                    </div>
                )}

                {/* Format Selector */}
                {formats.length > 0 && (
                    <div className="mb-8 p-4 bg-gray-800/20 border border-gray-800 rounded-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Formatos Personalizados</label>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-medium">{formats.length} Guardado{formats.length !== 1 ? 's' : ''}</span>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            <div
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedFormat === ''
                                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                                    : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                    }`}
                                onClick={() => setSelectedFormat('')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${selectedFormat === '' ? 'bg-emerald-500 text-white' : 'bg-gray-700 text-gray-500'}`}>
                                        <Settings className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold">Detección Inteligente (v4.0)</p>
                                        <p className="text-[10px] opacity-70">Recomendado para la mayoría de archivos</p>
                                    </div>
                                </div>
                                {selectedFormat === '' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                            </div>

                            {formats.map(f => (
                                <div
                                    key={f.id}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${selectedFormat === f.id
                                        ? 'bg-blue-500/10 border-blue-500/50 text-white'
                                        : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                        }`}
                                    onClick={() => setSelectedFormat(f.id)}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`p-2 rounded-lg flex-shrink-0 ${selectedFormat === f.id ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-500'}`}>
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold truncate">{f.nombre}</p>
                                            <p className="text-[10px] opacity-70 truncate">{f.descripcion || 'Formato manual'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {selectedFormat === f.id && <CheckCircle className="w-4 h-4 text-blue-500" />}
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!confirm(`¿Eliminar modelo "${f.nombre}"?`)) return
                                                try {
                                                    const res = await fetch(`/api/formats?id=${f.id}`, { method: 'DELETE' })
                                                    if (res.ok) {
                                                        if (selectedFormat === f.id) setSelectedFormat('')
                                                        fetchFormats()
                                                    } else {
                                                        alert('Error al eliminar')
                                                    }
                                                } catch (e) {
                                                    alert('Error de conexión')
                                                }
                                            }}
                                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                                            title="Eliminar este modelo"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
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
                            onClick={() => uploadFiles()}
                            disabled={files.length === 0 || uploading}
                            className={`w-full font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${files.length === 0 || uploading
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 hover:shadow-emerald-500/30 active:scale-[0.98]'
                                }`}
                        >
                            {uploading ? 'Subiendo...' : `Procesar ${files.length > 0 ? files.length : ''} Archivo${files.length !== 1 ? 's' : ''}`}
                        </button>

                        {files.length === 1 && !uploading && !success && (
                            <div className="text-center mt-4 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl animate-in fade-in slide-in-from-top-2">
                                <p className="text-[10px] text-gray-400 mb-2 uppercase font-bold tracking-widest">¿El formato no es el correcto?</p>
                                <button
                                    onClick={() => setMappingFile(files[0])}
                                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition-all border border-blue-500/20"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                    Usar Asistente de Mapeo Visual
                                </button>
                                <p className="text-[10px] text-gray-500 mt-2 italic">Esto te permite elegir qué columna es la fecha, monto y concepto manualmente.</p>
                            </div>
                        )}


                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in duration-300">
                        {uploadResult && uploadResult.count === 0 ? (
                            <div className="flex flex-col items-center">
                                <div className="p-3 bg-blue-500/10 rounded-full mb-3">
                                    <Settings className="w-10 h-10 text-blue-400" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Formato no reconocido</h3>
                                <p className="text-gray-400 text-center text-sm mb-6">
                                    No logramos extraer movimientos automáticamente de este archivo. <br />
                                    ¿Quieres enseñarle a BiFlow cómo leer este formato?
                                </p>
                                <div className="flex gap-3 w-full">
                                    <button
                                        onClick={() => {
                                            if (files.length > 0) {
                                                setMappingFile(files[0])
                                            } else {
                                                setSuccess(false)
                                            }
                                        }}
                                        className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
                                    >
                                        Mapeo Manual
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSuccess(false)
                                            setShowFormatBuilder(true)
                                        }}
                                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-blue-500/20"
                                    >
                                        Enseñar Formato
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center w-full max-w-xl">
                                <div className="p-3 bg-emerald-500/10 rounded-full mb-4">
                                    <CheckCircle className="w-16 h-16 text-emerald-500" />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">
                                    {uploadResult?.isUpdate ? '¡Re-procesamiento Exitoso!' : '¡Carga Completada!'}
                                </h3>
                                <p className="text-gray-400 text-center text-sm leading-relaxed mb-6">
                                    {uploadResult?.isUpdate
                                        ? 'Se han actualizado las reglas de mapeo y re-generado los registros.'
                                        : `Se han procesado ${uploadResult?.count} registros correctamente.`}
                                </p>

                                {/* Warnings & Exclusions Dropdown */}
                                {uploadResult && (uploadResult.skipped > 0 || uploadResult.warnings.length > 0) && (
                                    <div className="w-full mt-2 bg-gray-900/40 rounded-xl overflow-hidden border border-gray-800">
                                        <button
                                            onClick={() => setShowDetails(!showDetails)}
                                            className="w-full flex items-center justify-between p-3 hover:bg-gray-800/40 transition-colors"
                                        >
                                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                                Registros Omitidos ({uploadResult.skipped})
                                            </span>
                                            {showDetails ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                        </button>
                                        {showDetails && (
                                            <div className="p-3 bg-black/20 max-h-40 overflow-y-auto border-t border-gray-800">
                                                {uploadResult.warnings.length > 0 ? (
                                                    <ul className="space-y-1.5">
                                                        {uploadResult.warnings.map((w, i) => (
                                                            <li key={i} className="text-[10px] text-gray-500 flex gap-2">
                                                                <span className="text-yellow-600/50 flex-shrink-0">•</span>
                                                                {w}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-[10px] text-gray-600 italic">Registros duplicados o vacíos detectados.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Quarantine Alert Card */}
                                {uploadResult && uploadResult.reviewCount > 0 && (
                                    <div className="mt-6 w-full p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-between gap-3 text-purple-300">
                                        <div className="flex items-center gap-3">
                                            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-bold text-white">{uploadResult.reviewCount} en revisión</p>
                                                <p className="text-[10px] text-purple-300/80">Necesitan aprobación manual.</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => router.push('/dashboard/quarantine')}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-500/20"
                                        >
                                            Revisar
                                        </button>
                                    </div>
                                )}

                                {isFirstUpload && (
                                    <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-start gap-3 text-blue-300">
                                        <Settings className="w-5 h-5 mt-0.5 text-blue-400 flex-shrink-0" />
                                        <p className="text-xs leading-relaxed text-left">
                                            <span className="font-bold text-white block mb-0.5">💡 Tip de Configuración</span>
                                            Configura tu <span className="font-bold text-blue-400">Saldo Inicial</span> para que la IA calcule correctamente tu salud financiera.
                                        </p>
                                    </div>
                                )}

                                {/* Primary CTAs */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10 w-full mb-8">
                                    <Link href="/dashboard" className="w-full px-6 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl transition-all flex flex-col items-center gap-1 group border border-gray-700">
                                        <span className="font-bold text-sm">Ver Panel General</span>
                                        <span className="text-[10px] text-gray-400 text-center">Liquidez y saldos</span>
                                    </Link>
                                    <Link href="/dashboard/audit" className="w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-all flex flex-col items-center gap-1 group shadow-xl shadow-emerald-500/10 border border-emerald-500/20">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm">Analizar Hallazgos</span>
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                        {uploadResult?.findingsCount && uploadResult.findingsCount > 0 ? (
                                            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                                                {uploadResult.findingsCount} hallazgos
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-emerald-100/70 italic">Impuestos y anomalías</span>
                                        )}
                                    </Link>
                                </div>

                                <button
                                    onClick={() => setSuccess(false)}
                                    className="text-xs text-gray-600 hover:text-white transition-colors"
                                >
                                    Cargar otro archivo
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Sign Confirmation Modal */}
            {showSignModal && confirmationData && confirmationData.exampleRow && (
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
