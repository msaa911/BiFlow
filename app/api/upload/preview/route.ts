import { UniversalTranslator } from '@/lib/universal-translator'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const text = buffer.toString('utf-8')

        const sampleRows = UniversalTranslator.getSampleRows(text, 50)

        // Find the widest row to determine column count
        const maxCols = sampleRows.reduce((max, row) => Math.max(max, row.length), 0)

        // PAD ROWS: Ensure all rows have the same length for grid alignment
        const paddedRows = sampleRows.map(row => {
            const padded = [...row];
            while (padded.length < maxCols) padded.push("");
            return padded;
        });

        const headers = Array.from({ length: maxCols }, (_, i) => `Columna ${i + 1}`)

        return NextResponse.json({
            headers,
            previewData: paddedRows,
            message: 'Muestra generada correctamente'
        })

    } catch (error: any) {
        console.error('Preview error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
