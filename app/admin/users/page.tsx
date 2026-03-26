import { createClient } from '@/lib/supabase/server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Users, MoreVertical, Search, Shield, UserCog, Building } from 'lucide-react'

export default async function UsersAdmin() {
    const supabase = await createClient()

    // Query profiles with user email from auth
    // Join logic: supabase doesn't support complex joins well in simple queries, 
    // so we get all profiles and then enhance if needed or just use profile info.
    // In Sprint 8 Phase 1, we synced emails or at least IDs.
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        return <div className="p-10 text-red-500 font-bold">Error loading profiles: {error.message}</div>
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <header className="flex items-center justify-between">
                <div>
                     <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                        Gestión de <span className="text-indigo-500">Usuarios B2B</span>
                        <UserCog className="h-5 w-5 text-indigo-500" />
                    </h1>
                    <p className="text-gray-400 mt-2">Gestiona roles globales y supervisa el acceso de los usuarios a la plataforma.</p>
                </div>
                
                <div className="flex items-center gap-3">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar usuarios..."
                            className="bg-[#0a0a0f] border border-indigo-900/40 rounded-lg text-xs text-white placeholder:text-gray-600 pl-10 pr-4 py-2 w-64 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                    </div>
                </div>
            </header>

            <div className="bg-[#0a0a0f] border border-white/5 rounded-3xl shadow-2xl shadow-indigo-900/10 overflow-hidden relative">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
                 <Table>
                        <TableHeader className="bg-white/5 text-gray-400">
                            <TableRow className="border-white/5 hover:bg-transparent">
                                <TableHead className="w-[80px] py-6 font-bold uppercase tracking-widest text-[10px]">Avatar</TableHead>
                                <TableHead className="font-bold uppercase tracking-widest text-[10px]">Nombre y Detalle</TableHead>
                                <TableHead className="font-bold uppercase tracking-widest text-[10px]">Rol Global</TableHead>
                                <TableHead className="font-bold uppercase tracking-widest text-[10px]">Fecha Registro</TableHead>
                                <TableHead className="text-right font-bold uppercase tracking-widest text-[10px]">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {profiles.map((user) => (
                                <TableRow key={user.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                                    <TableCell className="py-5">
                                        <div className="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20 group-hover:scale-110 transition-transform">
                                            {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-0.5">
                                            <p className="font-bold text-gray-100">{user.full_name || 'Sin nombre'}</p>
                                            <p className="text-xs text-gray-600 font-medium">ID: {user.id.substring(0, 8)}...</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant="secondary" 
                                            className={
                                                user.role === 'superadmin' ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                                                user.role === 'admin' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                                                "bg-gray-800/50 text-gray-400 border-white/5"
                                            }
                                        >
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-gray-500 text-sm">
                                        {new Date(user.created_at).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <button className="p-2 hover:bg-indigo-500/10 hover:text-indigo-400 rounded-lg transition-all text-gray-600">
                                            <MoreVertical className="h-4 w-4" />
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                 </Table>
            </div>
            
            <footer className="text-center text-xs text-gray-600 py-10 font-medium italic">
                Nota: Algunas acciones requieren permisos de 'superadmin'.
            </footer>
        </div>
    )
}
