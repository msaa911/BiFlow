
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('CRITICAL: Supabase environment variables are missing in Vercel!')
            return NextResponse.next()
        }

        const supabase = createServerClient(
            supabaseUrl,
            supabaseAnonKey,
            {
                cookies: {
                    get(name: string) {
                        return request.cookies.get(name)?.value
                    },
                    set(name: string, value: string, options: CookieOptions) {
                        request.cookies.set({
                            name,
                            value,
                            ...options,
                        })
                        response = NextResponse.next({
                            request: {
                                headers: request.headers,
                            },
                        })
                        response.cookies.set({
                            name,
                            value,
                            ...options,
                        })
                    },
                    remove(name: string, options: CookieOptions) {
                        request.cookies.set({
                            name,
                            value: '',
                            ...options,
                        })
                        response = NextResponse.next({
                            request: {
                                headers: request.headers,
                            },
                        })
                        response.cookies.set({
                            name,
                            value: '',
                            ...options,
                        })
                    },
                },
            }
        )

        const {
            data: { user },
        } = await supabase.auth.getUser()

        // PROTECCIÓN DE RUTAS /DASHBOARD
        if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
            return NextResponse.redirect(new URL('/login', request.url))
        }

        // PROTECCIÓN DE RUTAS /ADMIN (RBAC)
        if (request.nextUrl.pathname.startsWith('/admin')) {
            if (!user) {
                return NextResponse.redirect(new URL('/login', request.url))
            }

            // Usamos el cliente admin para asegurar que RLS no bloquee la lectura del rol
            const adminSupabase = createAdminClient()
            const { data: profile } = await adminSupabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()

            if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
                // Redirigir a dashboard si no es admin o si el perfil no existe
                return NextResponse.redirect(new URL('/dashboard', request.url))
            }
        }

        if (request.nextUrl.pathname === '/login' && user) {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }

        return response
    } catch (e) {
        console.error('MIDDLEWARE ERROR:', e)
        return NextResponse.next()
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
