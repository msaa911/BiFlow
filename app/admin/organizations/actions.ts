import { createClient } from '../../../lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '../../../lib/admin-logger';

/**
 * Server Action: Cambia el tier (plan) de una organización de forma manual.
 * Solo ejecutable por usuarios con el rol 'superadmin' o 'admin'.
 */
export async function updateOrganizationTier(orgId: string, tier: 'free' | 'pro' | 'premium') {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    await logAuditEvent({
      level: 'warn',
      category: 'auth',
      message: 'Intento de actualización de tier no autenticado',
      metadata: { orgId }
    });
    throw new Error('No autenticado');
  }

  // Validación de seguridad (RBAC en el servidor)
  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profError || !profile || !['admin', 'superadmin'].includes(profile.role)) {
    await logAuditEvent({
      level: 'error',
      category: 'auth',
      message: 'Intento de escalada de privilegios en gestión de suscripciones',
      adminId: user.id,
      metadata: { orgId, attempt: tier }
    });
    throw new Error('No autorizado para gestionar suscripciones (Se requiere rol Admin)');
  }

  const { error } = await supabase
    .from('organizations')
    .update({ tier, updated_at: new Date().toISOString() })
    .eq('id', orgId);

  if (error) {
    await logAuditEvent({
      level: 'error',
      category: 'system',
      message: `Error al actualizar la organización ${orgId}: ${error.message}`,
      adminId: user.id
    });
    throw new Error(`[TIER] Error al actualizar la organización: ${error.message}`);
  }

  // LOG EXITOSO
  await logAuditEvent({
    level: 'info',
    category: 'admin',
    message: `Plan actualizado manualmente a ${tier.toUpperCase()}`,
    adminId: user.id,
    organizationId: orgId
  });

  revalidatePath('/admin/organizations');
  return { success: true };
}

/**
 * Server Action: Activa o desactiva la suplantación de identidad (Modo Dios).
 * Establece una cookie 'biflow_impersonation' que es reconocida por lib/supabase/utils.ts.
 */
export async function toggleImpersonation(orgId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('No autenticado');

  // Validación de seguridad (Solo Admins pueden impersonar)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    await logAuditEvent({
      level: 'error',
      category: 'auth',
      message: 'Intento no autorizado de entrar en modo auditoría',
      adminId: user.id,
      metadata: { targetOrgId: orgId }
    });
    throw new Error('No autorizado para entrar en modo auditoría (Se requiere rol Admin)');
  }

  const cookieStore = cookies();
  
  if (orgId) {
    // Activar Impersonación
    cookieStore.set('biflow_impersonation', orgId, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7200, // 2 horas de auditoría
    });

    await logAuditEvent({
      level: 'info',
      category: 'admin',
      message: `Modo Dios activado por administrador ${user.id}`,
      adminId: user.id,
      organizationId: orgId,
      metadata: { action: 'start_impersonation' }
    });
  } else {
    // Desactivar Impersonación
    cookieStore.delete('biflow_impersonation');

    await logAuditEvent({
      level: 'info',
      category: 'admin',
      message: 'Modo Dios desactivado (audit end)',
      adminId: user.id,
      metadata: { action: 'stop_impersonation' }
    });
  }

  // Invalidamos la caché global para refrescar el contexto
  revalidatePath('/', 'layout');
  return { success: true };
}
