import { cookies } from 'next/headers';
import { ShieldAlert, Zap } from 'lucide-react';
import { GodModeExitButton } from './GodModeExitButton';

/**
 * Visual feedback that "Modo Dios" (Impersonation) is active.
 * Shows a persistent banner at the top of the dashboard.
 */
export function GodModeBanner() {
    const cookieStore = cookies();
    const impersonatedOrgId = cookieStore.get('biflow_impersonation')?.value;

    if (!impersonatedOrgId) return null;

    return (
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white px-6 py-2 flex items-center justify-between z-[999] shadow-inner border-b border-amber-400/30">
            <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                    <ShieldAlert className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                    <p className="font-black text-xs uppercase tracking-[0.15em] drop-shadow-sm flex items-center gap-2">
                        MODO DIOS ACTIVO <Zap className="h-3 w-3 fill-white" />
                    </p>
                    <p className="text-[10px] text-white/80 font-mono tracking-widest">
                        ESTÁS AUDITANDO LA ORGANIZACIÓN ID: <span className="underline decoration-dotted">{impersonatedOrgId}</span>
                    </p>
                </div>
            </div>
            
            <GodModeExitButton />
        </div>
    );
}
