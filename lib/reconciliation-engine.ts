import { createClient } from '@/lib/supabase/server';

export class ReconciliationEngine {
  static async executeAuto(orgId: string, options: { 
    bankAccountId?: string; 
    dryRun?: boolean;
    supabase?: any;
  } = {}) {
    const supabase = options.supabase || await createClient();

    // Mapping old 'bankAccountId' to the new 'p_cuenta_id' parameter
    const { data, error } = await supabase.rpc('reconcile_v3_1', {
      p_org_id: orgId,
      p_cuenta_id: options.bankAccountId || null,
      p_dry_run: options.dryRun || false
    });

    if (error) {
      console.error('RPC reconcile_v3_1 error:', error);
      throw new Error(error.message);
    }

    // data now returns { status: 'success', matched_count: X, ... }
    return {
      success: data?.status === 'success',
      matched: data?.matched_count || 0,
      adminCount: data?.admin_results || 0,
      total: data?.total_read || 0,
      actions: data?.actions || [],
      status: data?.status || 'error',
      message: data?.message || 'Error desconocido en el RPC'
    };
  }
}
