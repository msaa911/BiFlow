import { createClient } from '@/lib/supabase/server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Building2, Search, ArrowRight, TrendingUp, Gem, Zap, ShieldAlert } from 'lucide-react'
import { AdminTierSelector } from './components/AdminTierSelector'
import { AdminGodModeButton } from './components/AdminGodModeButton'

export default async function OrganizationsAdmin() {
    const supabase = await createClient()

    // Query organizations
    const { data: orgs, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        return <div className="p-10 text-red-500 font-bold">Error loading organizations: {error.message}</div>
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <header className="flex items-center justify-between">
                <div>
                     <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                        Empresas / <span className="text-indigo-500">Tenants</span>
                        <Building2 className="h-5 w-5 text-indigo-500" />
                    </h1>
                    <p className="text-gray-400 mt-2">Supervisa las organizaciones registradas y sus respectivas suscripciones.</p>
                </div>
                
                <div className="flex items-center gap-3">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar empresa por CUIT o nombre..."
                            className="bg-[#0a0a0f] border border-indigo-900/40 rounded-lg text-xs text-white placeholder:text-gray-600 pl-10 pr-4 py-2 w-64 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                    </div>
                </div>
            </header>

            <div className="bg-[#0a0a0f] border border-white/5 rounded-3xl shadow-2xl shadow-indigo-900/10 overflow-hidden relative">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500/20 via-indigo-500/50 to-indigo-500/20" />
                 <Table>
                        <TableHeader className="bg-white/5 text-gray-400">
                            <TableRow className="border-white/5 hover:bg-transparent">
                                <TableHead className="font-bold uppercase tracking-widest text-[10px]">Empresa</TableHead>
                                <TableHead className="font-bold uppercase tracking-widest text-[10px]">Tier / Plan</TableHead>
                                <TableHead className="font-bold uppercase tracking-widest text-[10px]">ID Organización</TableHead>
                                <TableHead className="font-bold uppercase tracking-widest text-[10px]">Fecha Registro</TableHead>
                                <TableHead className="text-right font-bold uppercase tracking-widest text-[10px]">Acciones (God Mode)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orgs.map((org) => (
                                <TableRow key={org.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                                    <TableCell className="py-6">
                                        <div className="flex items-center gap-3">
                                             <div className="h-10 w-10 rounded-xl bg-white/5 p-2 flex items-center justify-center border border-white/5 group-hover:border-indigo-500/20 group-hover:scale-105 transition-all">
                                                 <Building2 className="h-5 w-5 text-gray-400 group-hover:text-indigo-400" />
                                             </div>
                                             <div className="space-y-0.5">
                                                 <p className="font-bold text-gray-100 italic">{org.name}</p>
                                                 <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest bg-white/5 px-2 py-0.5 w-fit rounded">Active</p>
                                             </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <AdminTierSelector organizationId={org.id} currentTier={org.tier} />
                                    </TableCell>
                                    <TableCell className="text-gray-500 text-xs font-mono">
                                        <span className="bg-white/5 py-1 px-2 rounded">{org.id}</span>
                                    </TableCell>
                                    <TableCell className="text-gray-500 text-sm">
                                        {new Date(org.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <AdminGodModeButton organizationId={org.id} organizationName={org.name} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                 </Table>
            </div>
            
            <footer className="text-center text-xs text-gray-600 py-10 font-medium p-8 bg-indigo-900/5 rounded-3xl border border-indigo-900/10 max-w-2xl mx-auto">
                 <p className="text-indigo-400 font-bold mb-2 uppercase tracking-tighter">Acerca del Modo Dios</p>
                 <p className="italic">
                    Al entrar como 'God Mode', RLS permitirá bypass total del aislamiento tenant para fines de auditoría, soporte y pruebas técnicas rigurosas de la infraestructura BiFlow.
                 </p>
            </footer>
        </div>
    )
}
