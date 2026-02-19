
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Bell, Shield, CreditCard, LogOut, Settings2 } from 'lucide-react'
import { CompanySettingsTab } from '@/components/dashboard/company-settings-tab'
import { getOrgId } from '@/lib/supabase/utils'

export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const orgId = await getOrgId(supabase, user.id)

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Configuración</h2>
                <p className="text-gray-400">Gestiona tu perfil y preferencias de la cuenta.</p>
            </div>

            {/* Perfil */}
            <Card className="bg-gray-900 border-gray-800 text-white">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-emerald-500" />
                        <CardTitle>Perfil de Usuario</CardTitle>
                    </div>
                    <CardDescription className="text-gray-400">
                        Información personal asociada a tu cuenta.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-gray-400">Email</label>
                        <div className="p-3 rounded-md bg-gray-800 text-gray-200 border border-gray-700">
                            {user.email}
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-gray-400">ID de Usuario</label>
                        <div className="p-3 rounded-md bg-gray-800 text-gray-500 font-mono text-xs border border-gray-700">
                            {user.id}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="border-t border-gray-800 pt-6">
                    <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium transition-colors">
                        Guardar Cambios
                    </button>
                </CardFooter>
            </Card>

            {/* Notificaciones */}
            <Card className="bg-gray-900 border-gray-800 text-white">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-amber-500" />
                        <CardTitle>Notificaciones</CardTitle>
                    </div>
                    <CardDescription className="text-gray-400">
                        Controla cuándo y cómo te contactamos.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-800 bg-gray-800/30">
                        <div className="space-y-0.5">
                            <h4 className="text-sm font-medium text-white">Reporte Diario (1 Minuto)</h4>
                            <p className="text-xs text-gray-400">Recibe un resumen ejecutivo cada mañana a las 9:00 AM.</p>
                        </div>
                        <div className="flex items-center h-6">
                            {/* Toggle simulado */}
                            <div className="w-11 h-6 bg-emerald-600 rounded-full relative cursor-pointer">
                                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"></div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-800 bg-gray-800/30">
                        <div className="space-y-0.5">
                            <h4 className="text-sm font-medium text-white">Alertas de Seguridad</h4>
                            <p className="text-xs text-gray-400">Avisos sobre accesos inusuales o cambios en tu cuenta.</p>
                        </div>
                        <div className="flex items-center h-6">
                            <div className="w-11 h-6 bg-emerald-600 rounded-full relative cursor-pointer">
                                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"></div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Configuración de Empresa (Finanzas) */}
            <CompanySettingsTab organizationId={orgId} />

            {/* Plan y Facturación */}
            <Card className="bg-gray-900 border-gray-800 text-white">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-blue-500" />
                        <CardTitle>Plan Actual</CardTitle>
                    </div>
                    <CardDescription className="text-gray-400">
                        Detalles de tu suscripción BiFlow.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-lg font-bold text-white">Plan Pro</div>
                            <div className="text-sm text-gray-400">Facturación mensual · USD 120/mes</div>
                        </div>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/20">
                            EL MÁS ELEGIDO
                        </span>
                    </div>
                </CardContent>
                <CardFooter className="border-t border-gray-800 pt-6 flex gap-4">
                    <button className="px-4 py-2 border border-gray-700 hover:bg-gray-800 text-white rounded-md text-sm font-medium transition-colors">
                        Ver Facturas
                    </button>
                    <button className="px-4 py-2 border border-gray-700 hover:bg-gray-800 text-white rounded-md text-sm font-medium transition-colors">
                        Cambiar Plan
                    </button>
                </CardFooter>
            </Card>

            <div className="flex justify-center pt-8 pb-4">
                <form action="/auth/signout" method="post">
                    <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                        <LogOut className="h-4 w-4" />
                        Cerrar Sesión en todos los dispositivos
                    </button>
                </form>
            </div>
        </div>
    )
}
