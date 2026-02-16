'use client'

import { useActionState } from 'react'
import { login, signup } from './actions'
import { useSearchParams } from 'next/navigation'

const initialState = {
    message: '',
}

export default function LoginPage() {
    const searchParams = useSearchParams()
    const error = searchParams.get('error')
    const [state, formAction, isPending] = useActionState(async (prevState: any, formData: FormData) => {
        // We can't easily use server actions directly in useActionState if they redirect,
        // so we wrap them or rely on the form action attribute directly for simple cases.
        // However, for better UX (loading state), we want to use useActionState or useFormStatus.
        // Let's stick to the simple formAction for now but add visual polish.
        return { message: '' }
    }, initialState)

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px]" />
            </div>

            <div className="w-full max-w-md p-8 space-y-8 bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800 shadow-2xl relative z-10">
                <div className="text-center">
                    <div className="mx-auto h-12 w-12 bg-gradient-to-tr from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-white">BiFlow Finance</h2>
                    <p className="mt-2 text-sm text-gray-400">Tu CFO Algorítmico personal</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-200 text-sm p-3 rounded-lg text-center">
                        Autenticación fallida. Verifica tus credenciales.
                    </div>
                )}

                <form className="mt-8 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email-address" className="sr-only">
                                Email
                            </label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="relative block w-full rounded-xl border-0 bg-gray-800/50 py-3 px-4 text-white ring-1 ring-inset ring-gray-700 placeholder:text-gray-500 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-emerald-500 sm:text-sm sm:leading-6 transition-all"
                                placeholder="nombre@empresa.com"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">
                                Contraseña
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="relative block w-full rounded-xl border-0 bg-gray-800/50 py-3 px-4 text-white ring-1 ring-inset ring-gray-700 placeholder:text-gray-500 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-emerald-500 sm:text-sm sm:leading-6 transition-all"
                                placeholder="************"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            formAction={login}
                            className="group relative flex w-full justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-3 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-all duration-200 hover:scale-[1.02]"
                        >
                            Ingresar
                        </button>
                        <button
                            formAction={signup}
                            className="flex w-full justify-center rounded-xl bg-gray-800 px-3 py-3 text-sm font-semibold text-gray-300 hover:bg-gray-700 hover:text-white transition-all duration-200"
                        >
                            Crear cuenta nueva
                        </button>
                    </div>
                </form>

                <p className="text-center text-xs text-gray-500 mt-4">
                    Protegido por encriptación de grado bancario.
                </p>
            </div>
        </div>
    )
}
