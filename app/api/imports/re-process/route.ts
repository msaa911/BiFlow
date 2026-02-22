import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { UniversalTranslator } from '@/lib/universal-translator'
import { runAnalysis } from '@/lib/analysis/engine'
import { ReconciliationEngine } from '@/lib/reconciliation-engine'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { importId, mapping, invertSigns } = await request.json()

        if (!importId || !mapping) {
            return NextResponse.json({ error: 'Missing importId or mapping' }, { status: 400 })
        }

        // 1. Get original file metadata
        const { data: importLog, error: fetchErr } = await supabase
            .from('archivos_importados')
            .select('*')
            .eq('id', importId)
            .single()

        if (fetchErr || !importLog) {
            return NextResponse.json({ error: 'Import not found' }, { status: 404 })
        }

        // 2. Download original file from Storage
        const { data: fileData, error: storageErr } = await supabase.storage
            .from('raw-imports')
            .download(importLog.storage_path)

        if (storageErr || !fileData) {
            return NextResponse.json({ error: 'Raw file not found in storage' }, { status: 404 })
        }

        const text = await fileData.text()

        // 3. Delete existing data for this import
        // Using manual deletes as backup for cascade
        await supabase.from('transacciones').delete().eq('archivo_importacion_id', importId)
        await supabase.from('comprobantes').delete().eq('archivo_importacion_id', importId)
        await supabase.from('transacciones_revision').delete().eq('archivo_importacion_id', importId)

        // 4. Translate with NEW mapping
        const { data: thesaurusRows } = await supabase.from('financial_thesaurus').select('raw_pattern, normalized_concept');
        const thesaurusMap = new Map<string, string>(thesaurusRows?.map((r: any) => [r.raw_pattern, r.normalized_concept]) || []);

        const res = UniversalTranslator.translate(text, {
            invertSigns,
            thesaurus: thesaurusMap,
            template: { tipo: 'delimited', reglas: mapping }
        })

        if (res.transactions.length === 0) {
            return NextResponse.json({ error: 'El nuevo mapeo no generó transacciones' }, { status: 400 })
        }

        const orgId = importLog.organization_id

        // 5. Insert New Transactions (With De-duplication)
        const normalize = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
        const getHash = (t: any) => `${t.fecha}-${normalize(t.descripcion || t.concepto)}-${t.monto}-${t.numero_cheque || ''}`;

        // Get existing transactions in the same time window to avoid cross-upload duplicates
        const dates = res.transactions.map(t => t.fecha).sort();
        const minDate = dates[0];
        const maxDate = dates[dates.length - 1];

        const { data: existing } = await supabase
            .from('transacciones')
            .select('fecha, descripcion, monto, numero_cheque')
            .eq('organization_id', orgId)
            .gte('fecha', minDate)
            .lte('fecha', maxDate);

        const existingSet = new Set(existing?.map((e: any) => getHash(e)));
        const seenInFile = new Set<string>();

        const sanitizedTransactions = res.transactions
            .map((t: any) => ({
                organization_id: orgId,
                fecha: t.fecha,
                descripcion: t.concepto || 'Sin concepto',
                monto: t.monto,
                cuit: t.cuit || null,
                numero_cheque: t.numero_cheque || null,
                moneda: 'ARS',
                origen_dato: 'reprocessed',
                estado: 'pendiente',
                archivo_importacion_id: importId,
                metadata: { ...t.metadata, reprocessed: true }
            }))
            .filter((t: any) => {
                const hash = getHash(t);
                if (existingSet.has(hash)) return false;
                if (seenInFile.has(hash)) return false;
                seenInFile.add(hash);
                return true;
            });

        if (sanitizedTransactions.length > 0) {
            const { error: insErr } = await supabase.from('transacciones').insert(sanitizedTransactions)
            if (insErr) throw insErr
        }

        // 6. Update Status
        await supabase.from('archivos_importados').update({
            estado: 'completado',
            metadata: {
                ...importLog.metadata,
                reprocessed: true,
                processed: res.transactions.length,
                lowQuality: res.metadata?.lowQuality
            }
        }).eq('id', importId)

        // 7. Re-run analysis
        await runAnalysis(orgId)
        await ReconciliationEngine.matchAndReconcile(orgId)

        return NextResponse.json({ success: true, count: res.transactions.length })

    } catch (error: any) {
        console.error('Reprocess failure:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
