'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/auth/auth-layout'
import { toast } from 'sonner'
import { Suspense } from 'react'

function LoginContent() {
    const [loading, setLoading] = useState(false)

    const handleGoogleLogin = async () => {
        setLoading(true)
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            })

            if (error) throw error
        } catch (error: any) {
            toast.error(error.message)
            setLoading(false)
        }
    }

    return (
        <AuthLayout
            title="Acesse sua conta ou cadastre sua agência."
            subtitle="O Trigovo automatiza de forma inteligente as consultas de reservas das principais companhias aéreas."
            bullets={[
                "Execução determinística e controlada",
                "Projetado para SPAs instáveis de companhias aéreas",
                "Automação segura baseada em filas e workers"
            ]}
            footerText="Utilizado por times de travel tech e operações internas."
        >
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-bold tracking-tight">
                        Bem-vindo ao Trigovo
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Utilize sua conta Google para acessar o sistema de forma segura.
                    </p>
                </div>

                <div className="grid gap-4">
                    <Button
                        variant="outline"
                        type="button"
                        disabled={loading}
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            'Carregando...'
                        ) : (
                            <>
                                <svg className="h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                                    <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                                </svg>
                                Entrar com Google
                            </>
                        )}
                    </Button>
                </div>

                <div className="flex flex-col gap-4 text-center">
                    <p className="text-xs text-muted-foreground">
                        Ao entrar, você concorda com nossos termos de serviço e política de privacidade.
                    </p>
                </div>
            </div>
        </AuthLayout>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    )
}
