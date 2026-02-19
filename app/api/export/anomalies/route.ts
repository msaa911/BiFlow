import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 1. Get Organization
        const { data: member } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single()

        if (!member) {
            return NextResponse.json({ error: 'No organization found' }, { status: 404 })
        }

        // 2. Fetch all findings with transaction details
        const { data: findings, error } = await supabase
            .from('hallazgos')
            .select(`
                *,
                transaccion:transacciones(*)
            `)
            .eq('organization_id', member.organization_id)
            .order('created_at', { ascending: false })

        if (error || !findings) {
            return NextResponse.json({ error: 'Failed to fetch findings' }, { status: 500 })
        }

        // 3. Transform to Excel Data
        const excelData = findings.map(f => {
            const t = f.transaccion
            const details = f.detalle || {}

            // Format specific anomaly details for humans
            let additionalInfo = ''
            if (f.tipo === 'duplicado' && details.duplicate_of) {
                const dup = details.duplicate_of
                additionalInfo = `Posible duplicado de: ${dup.descripcion} (${dup.fecha}) - $${dup.monto}`
            } else if (f.tipo === 'anomalia' && details.historical_avg) {
                additionalInfo = `Promedio histórico: $${details.historical_avg} (Desvío de ${Math.round((details.score || 0) * 100)}%)`
            }

            return {
                'ID Hallazgo': f.id.slice(0, 8),
                'Fecha Detección': new Date(f.created_at).toLocaleDateString('es-AR'),
                'Tipo de Anomalía': f.tipo.toUpperCase(),
                'Severidad': f.severidad.toUpperCase(),
                'Estado': f.estado.toUpperCase(),
                'Descripción Transacción': t?.descripcion || '-',
                'Fecha Transacción': t?.fecha || '-',
                'Monto (ARS)': t?.monto || 0,
                'Destinatario / CUIT': t?.cuit || '-',
                'Análisis/Razón': details.razon || '-',
                'Detalle Técnico': additionalInfo || '-',
                'Monto Estimado Recupero': f.monto_estimado_recupero || 0
            }
        })

        // 4. Generate Excel
        const worksheet = XLSX.utils.json_to_sheet(excelData)

        // Auto-size columns
        const maxWidths = excelData.reduce((acc: any, row: any) => {
            Object.keys(row).forEach((key, i) => {
                const val = String(row[key])
                acc[i] = Math.max(acc[i] || 0, val.length, key.length)
            })
            return acc
        }, [])
        worksheet['!cols'] = maxWidths.map((w: number) => ({ wch: Math.min(w + 2, 50) }))

        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Hallazgos Auditoría')

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

        return new Response(buf, {
            headers: {
                'Content-Disposition': `attachment; filename="BiFlow_Anomalias_${new Date().toISOString().split('T')[0]}.xlsx"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        })

    } catch (error) {
        console.error('Export error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
