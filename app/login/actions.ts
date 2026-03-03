
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function ensureOrganization(userId: string, email: string) {
    const admin = createAdminClient()

    // 1. ¿Ya es miembro de alguna?
    const { data: member } = await admin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle()

    if (member) return

    // 2. ¿Tiene invitaciones pendientes?
    const { data: invite } = await admin
        .from('organization_invitations')
        .select('*')
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .maybeSingle()

    if (invite) {
        // Unirlo a la organización invitada
        await admin.from('organization_members').insert({
            organization_id: invite.organization_id,
            user_id: userId,
            role: invite.role
        })
        // Marcar invitación como aceptada
        await admin.from('organization_invitations').update({ status: 'accepted' }).eq('id', invite.id)
    } else {
        // 3. Crear organización personal por defecto pasándole el ID
        await admin.rpc('create_new_organization', {
            org_name: `Mi Empresa`,
            user_id_param: userId
        })
    }
}

export async function login(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error || !data.user) {
        redirect('/login?error=true')
    }

    await ensureOrganization(data.user.id, data.user.email!)

    revalidatePath('/', 'layout')
    redirect('/dashboard')
}

export async function signup(formData: FormData) {
    const supabase = await createClient()

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    })

    if (error || !data.user) {
        redirect('/login?error=true')
    }

    // Nota: Si requiere confirmación de email, data.user.id existirá pero 
    // el usuario podría no estar "confirmado". Aún así, podemos dejar
    // la organización lista o manejarlo en el primer login.
    if (data.user) {
        await ensureOrganization(data.user.id, data.user.email!)
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
}
