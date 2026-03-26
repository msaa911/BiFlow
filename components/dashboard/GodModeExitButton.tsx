'use client';

import { toggleImpersonation } from '@/app/admin/organizations/actions';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function GodModeExitButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleExit = async () => {
    setIsLoading(true);
    try {
      await toggleImpersonation(null);
      toast.info("Saliendo del Modo Dios. Volviendo a tu organización...");
      router.refresh();
      router.push('/admin/organizations');
    } catch (e: any) {
      toast.error("Error al salir: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={handleExit}
      disabled={isLoading}
      className="flex items-center gap-2 px-3 py-1 bg-white text-amber-700 hover:bg-amber-50 rounded-lg text-xs font-bold transition-all shadow-sm"
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <LogOut className="h-3 w-3" />
      )}
      SALIR MODO DIOS
    </button>
  );
}
