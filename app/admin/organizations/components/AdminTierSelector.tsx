'use client';

import { useState } from 'react';
import { updateOrganizationTier } from '../actions';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Gem, Zap, ShieldCheck } from 'lucide-react';

interface AdminTierSelectorProps {
  organizationId: string;
  currentTier: string;
}

export function AdminTierSelector({ organizationId, currentTier }: AdminTierSelectorProps) {
  const [tier, setTier] = useState(currentTier);
  const [isLoading, setIsLoading] = useState(false);

  const handleTierChange = async (newTier: string) => {
    setIsLoading(true);
    try {
      await updateOrganizationTier(organizationId, newTier as 'free' | 'pro' | 'premium');
      setTier(newTier);
      toast.success(`Plan actualizado a ${newTier.toUpperCase()}`);
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
      setTier(currentTier); // Revert
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select 
        defaultValue={tier} 
        onValueChange={handleTierChange} 
        disabled={isLoading}
      >
        <SelectTrigger className="w-[140px] bg-white/5 border-white/10 text-xs h-8">
          <SelectValue>
            <Badge 
              variant="secondary" 
              className={
                tier === 'premium' ? "bg-amber-500/10 text-amber-500 border-none px-1" :
                tier === 'pro' ? "bg-emerald-500/10 text-emerald-400 border-none px-1" :
                "bg-gray-800/50 text-gray-400 border-none px-1"
              }
            >
              {tier === 'premium' && <Gem className="h-3 w-3 mr-1" />}
              {tier === 'pro' && <Zap className="h-3 w-3 mr-1" />}
              {tier.toUpperCase()}
            </Badge>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-[#0a0a0f] border-indigo-900/40 text-white">
          <SelectItem value="free" className="text-xs focus:bg-white/10">FREE</SelectItem>
          <SelectItem value="pro" className="text-xs font-bold text-emerald-400 focus:bg-emerald-500/10">PRO (Zap)</SelectItem>
          <SelectItem value="premium" className="text-xs font-bold text-amber-500 focus:bg-amber-500/10">PREMIUM (Gem)</SelectItem>
        </SelectContent>
      </Select>
      {isLoading && <div className="animate-spin h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full" />}
    </div>
  );
}
