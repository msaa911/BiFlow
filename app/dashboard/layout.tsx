import { PropsWithChildren } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/ui/sidebar'
import { Header } from '@/components/ui/header'
import { AIChatAdvisor } from '@/components/dashboard/ai-chat-advisor'
import { GodModeBanner } from '@/components/dashboard/GodModeBanner'

export default async function DashboardLayout({ children }: PropsWithChildren) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    let orgId = ''
    try {
        const { getOrgId } = await import('@/lib/supabase/utils')
        orgId = await getOrgId(supabase, user.id)
    } catch (e) {
        console.error('Error fetching orgId in layout:', e)
    }

    return (
        <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-sans selection:bg-emerald-500/30">
            {/* Background enhancement */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-500/10 blur-[120px] rounded-full animate-bounce [animation-duration:10s]" />
                <div className="absolute bottom-0 left-[20%] w-[50%] h-[20%] bg-emerald-500/5 blur-[80px]" />
            </div>

            <Sidebar userEmail={user.email || 'Usuario'} />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10 backdrop-blur-[1px]">
                <GodModeBanner />
                <Header />
                <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                    {children}
                </main>
                <AIChatAdvisor />
            </div>
        </div>
    )
}
