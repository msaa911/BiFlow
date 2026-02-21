
import { createClient } from '@/lib/supabase/server'
import { UniversalTranslator } from '@/lib/universal-translator'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 1. Get the file record to find storage_path
    const { data: fileRecord, error: fetchError } = await supabase
        .from('archivos_importados')
        .select('storage_path')
        .eq('id', id)
        .single()

    if (fetchError || !fileRecord?.storage_path) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // 2. Download from Storage
    const { data: fileData, error: downloadError } = await supabase.storage
        .from('raw-imports')
        .download(fileRecord.storage_path)

    if (downloadError || !fileData) {
        return NextResponse.json({ error: 'Error downloading file from storage' }, { status: 500 })
    }

    // 3. Process to get sample rows (same as /api/upload/preview)
    const text = await fileData.text()
    const sampleRows = UniversalTranslator.getSampleRows(text, 50)

    // Find the widest row to determine column count
    const maxCols = sampleRows.reduce((max, row) => Math.max(max, row.length), 0)
    const headers = Array.from({ length: maxCols }, (_, i) => `Columna ${i + 1}`)

    return NextResponse.json({
        headers,
        previewData: sampleRows,
        message: 'Muestra generada desde almacenamiento'
    })
}
