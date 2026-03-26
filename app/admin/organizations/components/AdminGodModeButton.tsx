'use client';

import { useState } from 'react';
import { toggleImpersonation } from '../actions';
import { ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface AdminGodModeButtonProps {
  organizationId: string;
  organizationName: string;
}

export function AdminGodModeButton({ organizationId, organizationName }: AdminGodModeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleImpersonation = async () => {
    setIsLoading(true);
    try {
      await toggleImpersonation(organizationId);
      toast.success(`Entrando como ${organizationName}`);
      router.push('/dashboard');
      router.refresh();
    } catch (error: any) {
      toast.error(`Error de Modo Dios: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={handleImpersonation}
      disabled={isLoading}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-bold uppercase tracking-widest border border-indigo-500/20
        ${isLoading 
          ? 'bg-white/5 text-gray-400 cursor-not-allowed' 
          : 'bg-indigo-500/10 hover:bg-indigo-500 hover:text-white text-indigo-400 hover:shadow-lg hover:shadow-indigo-500/20'
        }`}
    >
      {isLoading ? (
        <>Auditando <Loader2 className="h-3 w-3 animate-spin" /></>
      ) : (
        <>Entrar <ArrowRight className="h-3 w-3" /></>
      )}
    </button>
  );
}
