import { createAdminClient } from '@/lib/supabase/admin'
import { SupabaseClient } from '@supabase/supabase-js'

export interface ReconciliationOptions {
    dryRun?: boolean;
    scope?: 'admin' | 'bank' | 'all';
    cuentaId?: string;
}

/** 
 * Internal structure returned by the PostgreSQL RPC reconcile_v3_1 
 */
interface ReconciliationInternalResult {
    status: 'success' | 'error';
    matched_count: number;
    total_read: number;
    dry_run: boolean;
    actions?: any[]; // v3.2.9: Added for Suggestions API
    message?: string;
}

export interface ReconciliationResult {
    matched: number;
    total_read: number;
    actions: any[]; // v3.2.9: Restored to support UI suggestions
    rpc_stats: ReconciliationInternalResult;
    method: string;
}

/**
 * RECONCILIATION ENGINE v3.2.3 (ATOMIC SERVER-SIDE)
 * Purpose: Smart matching of movements vs invoices AND bank transactions vs treasury.
 * Strategy: Full offloading to PostgreSQL RPC for 100% atomicity and performance.
 */
export class ReconciliationEngine {
    /**
     * Executes the reconciliation process.
     * All logic resides in PostgreSQL 'reconcile_v3_1' for data integrity.
     */
    static async matchAndReconcile(
        supabase: SupabaseClient, 
        organizationId: string, 
        options?: ReconciliationOptions
    ): Promise<ReconciliationResult> {
        const dryRun = options?.dryRun ?? false;
        const cuentaId = options?.cuentaId;
        const adminSupabase = createAdminClient();

        console.log(`[RECONCILIATION v3.2.3] Triggering atomic server-side engine for org: ${organizationId}`)

        // PHASE 1 & 2 are now handled in ONE atomic transaction via RPC
        const { data, error: rpcError } = await adminSupabase.rpc('reconcile_v3_1', {
            p_org_id: organizationId,
            p_cuenta_id: cuentaId || null,
            p_dry_run: dryRun
        });

        const rpcResult = data as unknown as ReconciliationInternalResult;

        if (rpcError) {
            console.error(`[RECONCILIATION] RPC High-Level Error:`, rpcError);
            throw new Error(`Critical failure in reconciliation engine: ${rpcError.message}`);
        }

        if (rpcResult?.status === 'error') {
            console.error(`[RECONCILIATION] RPC Internal Error:`, rpcResult.message);
            throw new Error(`Engine internal failure: ${rpcResult.message}`);
        }

        console.log(`[RECONCILIATION] Atomic execution completed:`, rpcResult);

        // At this point rpcResult is guaranteed to be typed correctly
        return {
            matched: rpcResult?.matched_count || 0,
            total_read: rpcResult?.total_read || 0,
            actions: rpcResult?.actions || [],
            rpc_stats: rpcResult!,
            method: 'atomic_postgres_rpc_v3_2.9'
        };
    }

    /**
     * Subset Sum Algorithm (JS Side) - Keep for manual reconciliation assistants or UI hints
     * Not used in the main automatic flow (moved to RPC).
     */
    static findSubsetSum(
        items: Record<string, any>[], 
        target: number, 
        amountField: string = 'monto_pendiente'
    ): Record<string, any>[] | null {
        const n = items.length;
        const memo = new Map<string, Record<string, any>[] | null>();

        function backtrack(index: number, currentSum: number, selected: Record<string, any>[]): Record<string, any>[] | null {
            const state = `${index}-${currentSum.toFixed(2)}`;
            if (memo.has(state)) return memo.get(state) || null;

            if (Math.abs(currentSum - target) <= 2.0) return selected;
            if (index >= n || currentSum > target + 2.0) return null;

            // Option 1: Include item
            const withItem = backtrack(index + 1, currentSum + Number(items[index][amountField] || 0), [...selected, items[index]]);
            if (withItem) {
                memo.set(state, withItem);
                return withItem;
            }

            // Option 2: Skip item
            const withoutItem = backtrack(index + 1, currentSum, selected);
            memo.set(state, withoutItem);
            return withoutItem;
        }

        return backtrack(0, 0, []);
    }
}
