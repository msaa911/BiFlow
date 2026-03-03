import { PropsWithChildren } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/ui/sidebar'
import { Header } from '@/components/ui/header'
import { AIChatAdvisor } from '@/components/dashboard/ai-chat-advisor'

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
        <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
            <Sidebar userEmail={user.email || 'Usuario'} />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <Header />
                <main className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide">
                    {children}
                </main>
                <AIChatAdvisor />
            </div>
        </div>
    )
}
