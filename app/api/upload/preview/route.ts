
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as xlsx from 'xlsx'
// const pdf = require('pdf-parse')

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const pdf = require('pdf-parse')
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const fileName = file.name.toLowerCase()

        let headers: string[] = []
        let previewData: any[][] = []

        if (fileName.endsWith('.csv') || fileName.endsWith('.txt') || fileName.endsWith('.dat')) {
            const text = buffer.toString('utf-8')
            const lines = text.split('\n').slice(0, 6) // Read first 6 lines

            // Detect delimiter (simplified)
            const firstLine = lines[0] || ''
            const delimiter = firstLine.includes(',') ? ',' : (firstLine.includes(';') ? ';' : '\t')

            headers = firstLine.split(delimiter).map(h => h.trim())
            previewData = lines.slice(1).map(line => line.split(delimiter).map(c => c.trim()))

        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const workbook = xlsx.read(buffer, { type: 'buffer' })
            const sheetName = workbook.SheetNames[0]
            const sheet = workbook.Sheets[sheetName]
            const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: '' })

            if (rows.length > 0) {
                headers = rows[0].map((c: any) => String(c))
                previewData = rows.slice(1, 6)
            }
        } else {
            return NextResponse.json({ error: 'Preview not supported for this format yet' }, { status: 400 })
        }

        return NextResponse.json({ headers, previewData })

    } catch (error: any) {
        console.error('Preview error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
