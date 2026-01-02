'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'

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
        <div className="min-h-screen bg-white flex items-center justify-center px-4 py-6 sm:px-6 md:py-8">
            <div className="w-full max-w-[766px]">
                <div className="bg-white border border-border-default rounded-xl overflow-hidden flex flex-col md:flex-row md:h-[581px]">
                    {/* Lado Esquerdo - Ilustração */}
                    <div className="bg-gradient-to-b from-[#fffdf3] via-[#fff4cc] via-[50.481%] to-[#fddb32] w-full md:w-[383px] flex flex-col justify-between p-6 sm:p-8 relative min-h-[280px] md:min-h-0">
                        {/* Logo Trigovo */}
                        <div className="h-[24.5px] w-[99.011px] shrink-0">
                            <Image
                                src="/logo-trigovo.svg"
                                alt="Trigovo"
                                width={100}
                                height={25}
                                className="h-[24.5px] w-auto object-contain"
                                unoptimized
                            />
                        </div>

                        {/* Ilustração Trigovo Plus - Centralizada */}
                        <div className="flex-1 flex items-center justify-center my-4 sm:my-6">
                            <div className="h-[120px] sm:h-[172px] w-full flex items-center justify-center">
                                <Image
                                    src="/trigovo-plus-onboarding.svg"
                                    alt="Trigovo Plus"
                                    width={319}
                                    height={172}
                                    className="h-full w-auto max-w-full object-contain"
                                    unoptimized
                                />
                            </div>
                        </div>

                        {/* Caixa de Texto Amarela */}
                        <div className="bg-brand-yellow-light rounded-2xl p-4 w-full shrink-0">
                            <div className="flex flex-col gap-3 sm:gap-4">
                                <h3 className="text-lg sm:text-xl font-semibold leading-normal text-text-primary">
                                    <span className="block">Escale a operação aérea</span>
                                    <span className="block">da sua agência.</span>
                                </h3>
                                <p className="text-xs sm:text-sm font-normal leading-[19px] text-text-primary">
                                    <span className="block">Automatize o monitoramento de bilhetes</span>
                                    <span className="block">e a emissão de cartões de embarque.</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Lado Direito - Formulário de Login */}
                    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 w-full md:w-[383px]">
                        <div className="flex flex-col gap-5 sm:gap-6 w-full max-w-sm">
                            <div className="flex flex-col gap-4 sm:gap-6">
                                <h2 className="text-xl sm:text-2xl font-semibold leading-7 sm:leading-8 text-text-primary text-center">
                                    Boas vindas a Trigovo
                                </h2>
                                <p className="text-sm font-normal leading-5 text-text-tertiary text-center">
                                    Entre em segundos com sua conta Google sem cartão de crédito. Sem burocracia.
                                </p>
                            </div>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={handleGoogleLogin}
                                className="w-full min-h-[44px] px-4 py-3 bg-white border border-border-default rounded-md flex items-center justify-center gap-2 hover:bg-white hover:border-border-default disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
                            >
                                {loading ? (
                                    <span className="text-sm font-medium leading-5 text-text-primary">Carregando...</span>
                                ) : (
                                    <>
                                        <Image
                                            src="/icon-google.svg"
                                            alt="Google"
                                            width={16}
                                            height={16}
                                            className="size-4 shrink-0"
                                            unoptimized
                                        />
                                        <span className="text-sm font-medium leading-5 text-text-primary">
                                            Entrar com o Google
                                        </span>
                                    </>
                                )}
                            </button>

                            <p className="text-xs font-normal leading-5 text-text-tertiary text-center px-2">
                                <span>Ao fazer login, você concorda com os nossos </span>
                                <Link href="#" className="underline text-text-tertiary hover:no-underline active:opacity-70">
                                    Termos
                                </Link>
                                <span> e </span>
                                <Link href="#" className="underline text-text-tertiary hover:no-underline active:opacity-70">
                                    Privacidade.
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    )
}
