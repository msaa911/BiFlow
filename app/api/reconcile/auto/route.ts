import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { ReconciliationEngine } from '@/lib/reconciliation-engine';
import { getOrgId } from '@/lib/supabase/utils';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const orgId = await getOrgId(supabase, user.id);

        if (!orgId) {
            return NextResponse.json({ status: 'error', message: 'No se encontró la organización para este usuario.' }, { status: 404 });
        }

        const body = await request.json();
        const bankAccountId = body.bankAccountId || null;
        const dryRun = body.dryRun || false;

        // Calling the NEW executeAuto method
        const result = await ReconciliationEngine.executeAuto(orgId, {
            bankAccountId,
            dryRun,
            supabase
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[API_RECONCILE_AUTO] Error:', error);
        return new NextResponse(error.message || 'Internal Error', { status: 500 });
    }
}
