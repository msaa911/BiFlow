import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReconciliationOptions {
  bankAccountId?: string | null;
  dryRun?: boolean;
  supabase?: SupabaseClient;
}

export interface ReconciliationResult {
  success: boolean;
  matched: number;
  matchedCount: number;
  totalRead: number;
  nettingCount?: number;
  totalCompensated?: number;
  adminCount?: number;
  status: 'success' | 'error';
  actions: any[];
  message?: string;
  metadata?: Record<string, unknown>;
}

export class ReconciliationEngine {
  /**
   * Ejecuta el motor de conciliación automático v4.1 (Bidireccional + Subset Sum)
   */
  static async executeAuto(
    orgId: string, 
    options: ReconciliationOptions = {}
  ): Promise<ReconciliationResult> {
    const supabase = options.supabase || await createClient();

    // 1. Ejecutar Conciliación Bancaria (Motor v4.1 en SQL)
    const { data: bankData, error: bankError } = await supabase.rpc('reconcile_v4_0', {
      p_org_id: orgId,
      p_cuenta_id: options.bankAccountId || null,
      p_dry_run: options.dryRun || false
    });

    if (bankError) {
      console.error('RPC reconcile_v4_0 error:', bankError);
      return {
        success: false,
        matched: 0,
        matchedCount: 0,
        totalRead: 0,
        status: 'error',
        actions: [],
        message: bankError.message
      };
    }

    // 2. Ejecutar Netting Automático (Nuevo Motor)
    const { data: netData, error: netError } = await this.executeNetting(orgId, options);
    
    if (netError) {
      console.warn('RPC reconcile_netting error (ignorado para no bloquear ciclo bank):', netError);
    }

    return {
      success: true,
      matched: bankData?.matched_count || 0,
      matchedCount: bankData?.matched_count || 0,
      totalRead: bankData?.total_read || 0,
      nettingCount: netData?.netting_count || 0,
      totalCompensated: netData?.total_compensated || 0,
      adminCount: netData?.netting_count || 0,
      status: 'success',
      actions: bankData?.actions || [],
      metadata: {
        bank: bankData,
        netting: netData
      }
    };
  }

  /**
   * Ejecuta el motor de Netting Inteligente (Compensación Sales vs Purchases)
   */
  static async executeNetting(
    orgId: string,
    options: ReconciliationOptions = {}
  ): Promise<{ data: any; error: any }> {
    const supabase = options.supabase || await createClient();

    const { data, error } = await supabase.rpc('reconcile_netting_v4_0', {
      p_org_id: orgId,
      p_dry_run: options.dryRun || false
    });

    return { data, error };
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
