'use client'

import { useState } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function UploadPage() {
    const [dragActive, setDragActive] = useState(false)
    const [files, setFiles] = useState<File[]>([])
    const [progress, setProgress] = useState(0)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
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
        const validFiles = newFiles.filter(file =>
            file.type === 'text/csv' || file.name.endsWith('.csv')
        )

        if (validFiles.length !== newFiles.length) {
            setError('Algunos archivos no eran CSV y fueron ignorados.')
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

        let completed = 0
        const totalFiles = files.length
        const totalProgressPerFile = 100 / totalFiles

        for (const file of files) {
            try {
                await uploadSingleFile(file, (percent) => {
                    // Calculate overall progress
                    const currentBase = completed * totalProgressPerFile
                    const currentIncrement = (percent * totalProgressPerFile) / 100
                    setProgress(Math.round(currentBase + currentIncrement))
                })
                completed++
            } catch (err) {
                console.error(err)
                setError(`Error al subir ${file.name}. Se detuvo el proceso.`)
                setUploading(false)
                return
            }
        }

        setSuccess(true)
        setProgress(100)
        setTimeout(() => {
            router.push('/dashboard')
            router.refresh()
        }, 1500)
    }

    const uploadSingleFile = (file: File, onProgress: (percent: number) => void): Promise<void> => {
        return new Promise((resolve, reject) => {
            const formData = new FormData()
            formData.append('file', file)

            const xhr = new XMLHttpRequest()

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100
                    onProgress(percentComplete)
                }
            }

            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve()
                } else {
                    reject(new Error(xhr.statusText))
                }
            }

            xhr.onerror = () => reject(new Error('Network Error'))

            xhr.open('POST', '/api/upload')
            xhr.send(formData)
        })
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Importar Transacciones</h2>
                <p className="text-gray-400">Sube tus extractos bancarios (CSV) para iniciar la auditoría.</p>
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
                                <p className="text-xs text-gray-500">o haz clic para seleccionar (Múltiples permitidos)</p>
                            </div>
                            <input
                                type="file"
                                accept=".csv"
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
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-emerald-500 animate-in fade-in zoom-in duration-300">
                        <CheckCircle className="w-20 h-20 mb-6" />
                        <h3 className="text-2xl font-bold text-white mb-2">¡Carga Completada!</h3>
                        <p className="text-gray-400">Se han procesado tus archivos correctamente.</p>
                        <p className="text-sm text-gray-500 mt-4">Redirigiendo al dashboard...</p>
                    </div>
                )}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <h4 className="text-blue-400 font-medium mb-2 text-sm">Formato Requerido (CSV)</h4>
                <code className="text-xs text-blue-300 block bg-blue-900/20 p-2 rounded">
                    fecha,descripcion,monto,cuit_destino<br />
                    2024-01-01,Pago Proveedor X,-15000.00,30-11111111-1
                </code>
            </div>
        </div>
    )
}
