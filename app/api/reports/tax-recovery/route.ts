import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/supabase/utils'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const fromDate = searchParams.get('from')
        const toDate = searchParams.get('to')

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Get Org ID using the utility that respects Impersonation (Modo Dios)
        const orgId = await getOrgId(supabase, user.id)
        if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 404 })

        // Query transactions with tag 'impuesto_recuperable'
        let query = supabase
            .from('transacciones')
            .select('*')
            .eq('organization_id', orgId)
            .contains('tags', ['impuesto_recuperable'])
            .order('fecha', { ascending: false })

        if (fromDate) query = query.gte('fecha', fromDate)
        if (toDate) query = query.lte('fecha', toDate)

        const { data: transactions, error } = await query

        if (error) throw error

        if (!transactions || transactions.length === 0) {
            return NextResponse.json({ message: 'No se encontraron impuestos recuperables en el período.' }, { status: 404 })
        }

        // Prepare Data for XLSX
        const exportData = transactions.map(t => ({
            Fecha: new Date(t.fecha).toLocaleDateString('es-AR'),
            Descripción: t.descripcion,
            Monto: Math.abs(t.monto),
            CUIT: t.cuit || 'N/A',
            Tipo: 'Impuesto Recuperable (AFIP/ARBA)'
        }))

        // Calculate Totals by Group
        const totals = transactions.reduce((acc: any, t) => {
            const desc = t.descripcion.toUpperCase()
            let group = 'Otras Retenciones'
            if (desc.includes('AFIP')) group = 'AFIP Retenciones'
            else if (desc.includes('ARBA')) group = 'ARBA Percepciones'
            else if (desc.includes('SIRC')) group = 'SIRCREB (Ingresos Brutos)'

            acc[group] = (acc[group] || 0) + Math.abs(t.monto)
            return acc
        }, {})

        const totalRows = Object.entries(totals).map(([group, amount]) => ({
            'Categoría': group,
            'Total': amount
        }))

        // Create Workbook
        const workbook = XLSX.utils.book_new()

        // Sheet 1: Totals
        const wsTotals = XLSX.utils.json_to_sheet(totalRows)
        XLSX.utils.book_append_sheet(workbook, wsTotals, "Resumen Contable")

        // Sheet 2: Detailed
        const wsDetail = XLSX.utils.json_to_sheet(exportData)
        XLSX.utils.book_append_sheet(workbook, wsDetail, "Detalle de Retenciones")

        // Generate Buffer
        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

        return new Response(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="BiFlow_Recupero_Fiscal_${new Date().toISOString().split('T')[0]}.xlsx"`
            }
        })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
