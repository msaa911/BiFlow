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

        const sampleRows = UniversalTranslator.getSampleRows(text, 10)

        // If it's a fixed-width-like list (only 1 column in sample), headers are dummy
        // If it has multiple columns, first row could be headers
        const headers = sampleRows.length > 0 ? sampleRows[0].map((_: any, i: number) => `Columna ${i + 1}`) : []

        return NextResponse.json({
            headers,
            previewData: sampleRows,
            message: 'Muestra generada correctamente'
        })

    } catch (error: any) {
        console.error('Preview error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
