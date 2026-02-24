
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get org
    const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'No org' }, { status: 403 })

    // 1. Fetch Transactions
    const { data: transactions } = await supabase
        .from('transacciones')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('fecha', { ascending: false })

    // 2. Fetch Findings (Audit results)
    const { data: findings } = await supabase
        .from('hallazgos')
        .select('*')
        .eq('organization_id', member.organization_id)

    // Match findings to transactions
    const findingsMap = new Map()
    findings?.forEach(f => {
        findingsMap.set(f.transaccion_id, f)
    })

    if (!transactions) return NextResponse.json({ error: 'No data' }, { status: 404 })

    // 3. Prepare Excel Data
    const excelData = transactions.map(t => {
        const finding = findingsMap.get(t.id)

        return {
            'Fecha': t.fecha,
            'Descripción': t.descripcion,
            'CUIT': t.cuit || '-',
            'Monto (ARS)': t.monto,
            'Tipo': t.monto < 0 ? 'EGRESO' : 'INGRESO',
            'Estado': t.estado,
            'Hallazgo AI': finding ? `${finding.tipo}: ${finding.detalle?.razon || ''}` : 'Sin irregularidades',
            'Prioridad': finding ? finding.severidad.toUpperCase() : '-',
            'Acción Recomendada': finding?.tipo === 'fuga_fiscal' ? 'Solicitar reintegro AFIP' :
                finding?.tipo === 'duplicado' ? 'Verificar con proveedor' :
                    finding?.tipo === 'anomalia' ? 'Revisar desvío presupuesto' : '-'
        }
    })

    // 4. Generate Workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData)

    // Auto-size columns (rough estimate)
    const maxWidths = excelData.reduce((acc: any, row: any) => {
        Object.keys(row).forEach((key, i) => {
            const val = String(row[key])
            acc[i] = Math.max(acc[i] || 0, val.length, key.length)
        })
        return acc
    }, [])
    worksheet['!cols'] = maxWidths.map((w: number) => ({ wch: w + 2 }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Auditoría BiFlow')

    // 5. Output Buffer
    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return new Response(buf, {
        headers: {
            'Content-Disposition': `attachment; filename="BiFlow_Auditoria_${new Date().toISOString().split('T')[0]}.xlsx"`,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
    })
}
