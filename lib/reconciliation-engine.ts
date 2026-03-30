import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReconciliationOptions {
  bankAccountId?: string | null;
  dryRun?: boolean;
  supabase?: SupabaseClient;
}

export interface ReconciliationResult {
  success: boolean;
  status: 'success' | 'error';
  // Globals
  matchedCount: number; // Total matched across all phases
  totalRead: number;
  // Breakdown
  bankMatched: number;
  commercialMatched: number;
  nettingCount: number;
  totalCompensated: number;
  // Legacy compatibility
  matched: number;
  adminCount?: number;
  
  actions: any[];
  message?: string;
  metadata?: Record<string, unknown>;
}

export class ReconciliationEngine {
  /**
   * Ejecuta el motor de conciliación integral v4.2 (Banking -> Commercial -> Netting)
   */
  static async executeAuto(
    orgId: string, 
    options: ReconciliationOptions = {}
  ): Promise<ReconciliationResult> {
    const supabase = options.supabase || await createClient();

    try {
      // 1. Fase Bancaria (Banco <-> Tesorería)
      const { data: bankData, error: bankError } = await supabase.rpc('reconcile_banking_v4_2', {
        p_org_id: orgId,
        p_cuenta_id: options.bankAccountId || null,
        p_dry_run: options.dryRun || false
      });
      if (bankError) throw bankError;

      // 2. Fase Comercial (Tesorería <-> Facturas)
      const { data: commData, error: commError } = await supabase.rpc('reconcile_commercial_v4_2', {
        p_org_id: orgId,
        p_dry_run: options.dryRun || false
      });
      if (commError) throw commError;

      // 3. Fase de Netting (Factura <-> Factura)
      const { data: netData, error: netError } = await supabase.rpc('reconcile_netting_v4_2', {
        p_org_id: orgId,
        p_dry_run: options.dryRun || false
      });
      if (netError) throw netError;

      const results = {
        bankMatched: bankData?.matched_count || 0,
        commercialMatched: commData?.matched_count || 0,
        nettingCount: netData?.netting_count || 0,
        totalCompensated: netData?.total_compensated || 0
      };

      return {
        success: true,
        status: 'success',
        matchedCount: results.bankMatched + results.commercialMatched + results.nettingCount,
        matched: results.bankMatched + results.commercialMatched, // Legacy sum
        bankMatched: results.bankMatched,
        commercialMatched: results.commercialMatched,
        nettingCount: results.nettingCount,
        totalCompensated: results.totalCompensated,
        adminCount: results.nettingCount,
        totalRead: 0, // Not accurately provided by multi-phase yet
        actions: [],
        metadata: {
          bank: bankData,
          commercial: commData,
          netting: netData
        }
      };
    } catch (error: any) {
      console.error('Error in executeAuto v4.2:', error);
      return {
        success: false,
        status: 'error',
        matchedCount: 0,
        matched: 0,
        bankMatched: 0,
        commercialMatched: 0,
        nettingCount: 0,
        totalCompensated: 0,
        totalRead: 0,
        actions: [],
        message: error.message
      };
    }
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
