
import { PropsWithChildren } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: PropsWithChildren) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
            {/* Sidebar */}
            <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 hidden md:flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700">
                    <h1 className="text-xl font-bold text-emerald-600 tracking-tight">BiFlow Finance</h1>
                </div>

                <nav className="flex-1 px-4 py-6 space-y-1">
                    <NavLink href="/dashboard" icon="Home">Dashboard</NavLink>
                    <NavLink href="/dashboard/transactions" icon="List">Transacciones</NavLink>
                    <NavLink href="/dashboard/analysis" icon="Shield">Auditoría AI</NavLink>
                    <NavLink href="/dashboard/settings" icon="Settings">Configuración</NavLink>
                </nav>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                            {user.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {user.email}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Plan Pro
                            </p>
                        </div>
                    </div>
                    <form action="/auth/signout" method="post">
                        <button className="mt-4 w-full text-xs text-red-500 hover:text-red-600 text-left">
                            Cerrar Sesión
                        </button>
                    </form>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                {/* Header Mobile */}
                <header className="md:hidden h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4">
                    <h1 className="text-lg font-bold text-emerald-600">BiFlow</h1>
                </header>

                {children}
            </main>
        </div>
    )
}

function NavLink({ href, children, icon }: { href: string; children: React.ReactNode, icon: string }) {
    // Simplistic active state check could be added here with usePathname hook (requires client component for NavLink)
    // For now just basic styling.
    return (
        <Link
            href={href}
            className="flex items-center px-2 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 group"
        >
            {/* Icon placeholder */}
            <span className="mr-3 text-gray-400 group-hover:text-gray-500">
                [{icon}]
            </span>
            {children}
        </Link>
    )
}
