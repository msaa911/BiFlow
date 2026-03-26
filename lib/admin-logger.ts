import { createAdminClient } from './supabase/admin';

type LogLevel = 'info' | 'warn' | 'error';
type LogCategory = 'auth' | 'payments' | 'system' | 'admin';

interface AuditLogParams {
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata?: any;
  adminId?: string;
  organizationId?: string;
}

/**
 * Utility to log important audit events to the database.
 * Uses the service role client for high reliability of recording logs.
 */
export async function logAuditEvent({
  level,
  category,
  message,
  metadata = {},
  adminId,
  organizationId
}: AuditLogParams) {
  const supabase = createAdminClient();
  
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      level,
      category,
      message,
      metadata,
      admin_id: adminId,
      organization_id: organizationId
    });

  if (error) {
    console.error('[LOGGER_ERROR] Failed to record audit log:', error);
  } else {
    console.log(`[AUDIT_${category.toUpperCase()}] ${message}`);
  }
}
