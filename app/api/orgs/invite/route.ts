
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { email, organizationId, role = 'member' } = await request.json()

    if (!email || !organizationId) {
        return NextResponse.json({ error: 'Faltan datos requeridos (email u organizationId)' }, { status: 400 })
    }

    // 1. Verificar que el usuario actual es Admin/Owner de esa organización
    const { data: membership, error: memError } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .single()

    if (memError || !['owner', 'admin'].includes(membership?.role)) {
        return NextResponse.json({ error: 'No tienes permisos para invitar a esta organización' }, { status: 403 })
    }

    try {
        // 2. Crear registro de invitación
        const { error: inviteError } = await supabase
            .from('organization_invitations')
            .upsert({
                organization_id: organizationId,
                email: email.toLowerCase(),
                role: role,
                invited_by: user.id,
                status: 'pending'
            }, { onConflict: 'organization_id,email' })

        if (inviteError) {
            console.error('Error creating invitation:', inviteError)
            return NextResponse.json({ error: 'Error al crear la invitación en la base de datos' }, { status: 500 })
        }

        // 3. Obtener nombre de la organización para el email
        const { data: org } = await supabase.from('organizations').select('name').eq('id', organizationId).single()

        // 4. Enviar email con Resend
        const { data: resendData, error: resendError } = await resend.emails.send({
            from: 'BiFlow <onboarding@resend.dev>',
            to: [email],
            subject: `Invitación para unirte a ${org?.name || 'BiFlow'}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #10b981;">¡Hola!</h2>
                    <p>Has sido invitado a unirte a la organización <strong>${org?.name || 'BiFlow'}</strong> en nuestra plataforma.</p>
                    <p>Desde BiFlow podrás gestionar la tesorería, conciliar bancos y optimizar el flujo de caja con inteligencia artificial.</p>
                    <div style="margin: 30px 0;">
                        <a href="https://bi-flow.vercel.app/login" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Unirme a la organización</a>
                    </div>
                    <p style="color: #666; font-size: 14px;">Si no tienes una cuenta, simplemente regístrate con este mismo correo electrónico y entrarás directamente a la organización.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #999;">BiFlow - Inteligencia Financiera para tu Empresa</p>
                </div>
            `
        })

        if (resendError) {
            console.error('Resend error:', resendError)
            return NextResponse.json({ error: 'Invitación creada pero falló el envío del email: ' + resendError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data: resendData })

    } catch (e: any) {
        console.error('Critical error in invite route:', e)
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
    }
}
