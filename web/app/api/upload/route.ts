import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const text = await file.text()
        const lines = text.split('\n')
        const transactions = []

        // Parse CSV (Skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue

            const [fecha, descripcion, monto, cuit_destino] = line.split(',')

            if (fecha && descripcion && monto) {
                transactions.push({
                    organization_id: (await getOrgId(supabase, user.id)),
                    fecha: fecha.trim(),
                    descripcion: descripcion.trim(),
                    monto: parseFloat(monto),
                    cuit_destino: cuit_destino ? cuit_destino.trim() : null,
                    origen_dato: 'csv',
                    moneda: 'ARS',
                    estado: 'pendiente'
                })
            }
        }

        // Dedup Logic: Fetch existing transactions for potential overlap dates
        // Optimize: Only fetch relevant date range if possible, or just build a hash set of recent transactions
        // For MVP: Fetch all transactions for this org to be safe (or constrain by min/max date from file)

        let minDate: string | null = null
        let maxDate: string | null = null

        transactions.forEach(t => {
            if (!minDate || t.fecha < minDate) minDate = t.fecha
            if (!maxDate || t.fecha > maxDate) maxDate = t.fecha
        })

        if (transactions.length > 0 && minDate && maxDate) {
            const { data: existing } = await supabase
                .from('transacciones')
                .select('fecha, descripcion, monto')
                .eq('organization_id', transactions[0].organization_id)
                .gte('fecha', minDate)
                .lte('fecha', maxDate)

            const existingSet = new Set(
                existing?.map(e => `${e.fecha}-${e.descripcion}-${e.monto}`)
            )

            const uniqueTransactions = transactions.filter(t => {
                const key = `${t.fecha}-${t.descripcion}-${t.monto}`
                return !existingSet.has(key)
            })

            if (uniqueTransactions.length > 0) {
                const { error } = await supabase.from('transacciones').insert(uniqueTransactions)
                if (error) {
                    console.error('Database insertion error:', error)
                    return NextResponse.json({ error: 'Failed to save transactions' }, { status: 500 })
                }
                return NextResponse.json({ success: true, count: uniqueTransactions.length, skipped: transactions.length - uniqueTransactions.length })
            } else {
                return NextResponse.json({ success: true, count: 0, skipped: transactions.length, message: 'All transactions were duplicates' })
            }
        }

        return NextResponse.json({ success: true, count: 0 })

    } catch (error) {
        console.error('Upload processing error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

async function getOrgId(supabase: any, userId: string) {
    let { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .single()

    if (member) return member.organization_id

    // Fallback: Create org if missing (Safety net for demo)
    const { data: org } = await supabase
        .from('organizations')
        .insert({ name: 'Mi Empresa', tier: 'free' })
        .select()
        .single()

    await supabase.from('organization_members').insert({
        organization_id: org.id,
        user_id: userId,
        role: 'owner'
    })

    return org.id
}
