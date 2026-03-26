import { PropsWithChildren } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminHeader } from '@/components/admin/admin-header'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminLayout({ children }: PropsWithChildren) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Role verification using Admin Client to bypass RLS issues during the session check
    const adminSupabase = createAdminClient()
    const { data: profile } = await adminSupabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
        redirect('/dashboard')
    }

    return (
        <div className="flex h-screen bg-[#050510] text-gray-100 overflow-hidden font-sans selection:bg-indigo-500/30">
            {/* Background design elements specific for Admin */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 opacity-40">
                <div className="absolute top-[0%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[150px] rounded-full" />
                <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-violet-600/5 blur-[150px] rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent" />
            </div>

            <AdminSidebar userEmail={user.email || 'Admin User'} />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
                <AdminHeader />
                <main className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
                    {children}
                </main>
            </div>
        </div>
    )
}
