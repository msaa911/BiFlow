import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { ReconciliationEngine } from '@/lib/reconciliation-engine';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // CORRECT TABLE: organization_members
        const { data: member, error: memberError } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single();

        if (memberError || !member) {
            return NextResponse.json({ status: 'error', message: 'No se encontró la organización para este usuario.' }, { status: 404 });
        }

        const body = await request.json();
        const bankAccountId = body.bankAccountId || null;
        const dryRun = body.dryRun || false;

        // Calling the NEW executeAuto method
        const result = await ReconciliationEngine.executeAuto(member.organization_id, {
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
