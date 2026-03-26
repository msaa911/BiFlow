import { cookies } from 'next/headers';
import { createClient } from '../../lib/supabase/server';
import { ShieldAlert, LogOut } from 'lucide-react';
import { toggleImpersonation } from '../../app/admin/organizations/actions';
import { revalidatePath } from 'next/cache';

/**
 * ImpersonationBanner (Server Component)
 * Detecta si existe una cookie de suplantación y muestra un aviso persistente.
 * Diseño: Premium glassmorphism con acento en carmesí/naranja para advertencia.
 */
export async function ImpersonationBanner() {
  const cookieStore = cookies();
  const impersonatedOrgId = cookieStore.get('biflow_impersonation')?.value;

  if (!impersonatedOrgId) return null;

  const supabase = await createClient();
  
  // Obtenemos el nombre de la organización para el feedback
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', impersonatedOrgId)
    .single();

  async function handleExit() {
    'use server'
    await toggleImpersonation(null);
    revalidatePath('/');
  }

  return (
    <div className="sticky top-0 z-[100] w-full bg-orange-500/10 backdrop-blur-xl border-b border-orange-500/20 py-1.5 px-4 shadow-lg shadow-orange-950/20">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center animate-pulse">
            <ShieldAlert className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-black text-orange-400">Panel de Auditoría Activo</p>
            <p className="text-xs text-white/80 font-medium">
              Actuando como: <span className="text-white font-bold italic underline decoration-orange-500/40 decoration-wavy underline-offset-2 tracking-tight">
                {org?.name || 'Cargando...'}
              </span>
            </p>
          </div>
        </div>

        <form action={handleExit}>
          <button 
            type="submit"
            className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500 text-black text-[10px] font-black uppercase tracking-tighter hover:bg-white transition-all overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <LogOut className="h-3 w-3 relative z-10" />
            <span className="relative z-10">Salir del Modo Dios</span>
          </button>
        </form>
      </div>
    </div>
  );
}
