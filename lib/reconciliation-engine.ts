import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReconciliationOptions {
  bankAccountId?: string | null;
  dryRun?: boolean;
  supabase?: SupabaseClient;
}

export interface ReconciliationResult {
  success: boolean;
  matchedCount: number;
  totalRead: number;
  status: 'success' | 'error';
  message?: string;
  metadata?: Record<string, unknown>;
}

export class ReconciliationEngine {
  /**
   * Ejecuta el motor de conciliación automático v4.0 (Subset Sum + Fuzzy Search)
   */
  static async executeAuto(
    orgId: string, 
    options: ReconciliationOptions = {}
  ): Promise<ReconciliationResult> {
    const supabase = options.supabase || await createClient();

    const { data, error } = await supabase.rpc('reconcile_v4_0', {
      p_org_id: orgId,
      p_cuenta_id: options.bankAccountId || null,
      p_dry_run: options.dryRun || false
    });

    if (error) {
      console.error('RPC reconcile_v4_0 error:', error);
      return {
        success: false,
        matchedCount: 0,
        totalRead: 0,
        status: 'error',
        message: error.message
      };
    }

    return {
      success: data?.status === 'success',
      matchedCount: data?.matched_count || 0,
      totalRead: data?.total_read || 0,
      status: data?.status || 'success',
      metadata: data
    };
  }

  /**
   * Ejecuta una mutación segura de estado de transacción vía RPC (Bypass RLS)
   */
  static async executeSafeUpdate(
    transactionId: string,
    estado: 'pendiente' | 'conciliado' | 'anulado',
    metadata: Record<string, unknown> = {},
    supabase?: SupabaseClient
  ): Promise<{ success: boolean; error?: string }> {
    const client = supabase || await createClient();

    const { error } = await client.rpc('safe_update_transaction', {
      p_trans_id: transactionId,
      p_estado: estado,
      p_metadata: metadata
    });

    if (error) {
      console.error('RPC safe_update_transaction error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }
}
