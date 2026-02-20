'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ExportAuditButton() {
    const [exporting, setExporting] = useState(false)

    const handleExport = async () => {
        setExporting(true)
        try {
            const res = await fetch('/api/export/anomalies')
            if (res.ok) {
                const blob = await res.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `BiFlow_Anomalias_${new Date().toISOString().split('T')[0]}.xlsx`
                document.body.appendChild(a)
                a.click()
                window.URL.revokeObjectURL(url)
            }
        } catch (error) {
            console.error('Export failed', error)
        } finally {
            setExporting(false)
        }
    }

    return (
        <Button
            onClick={handleExport}
            disabled={exporting}
            variant="outline"
            className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border-emerald-500/30 font-bold uppercase tracking-widest text-[10px] h-9 gap-2"
        >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Exportar Hallazgos
        </Button>
    )
}
