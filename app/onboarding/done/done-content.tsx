'use client'

import { ProgressSidebar } from '@/components/onboarding/progress-sidebar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function DoneContent() {
    const router = useRouter()

    const handleAccessPlatform = () => {
        router.push('/dashboard')
    }

    return (
        <div className="min-h-screen bg-white flex flex-col md:items-center md:justify-center px-4 py-4 sm:py-6 md:py-8">
            <div className="w-full max-w-[766px]">
                <div className="bg-white border border-border-default rounded-xl overflow-hidden flex flex-col md:flex-row md:h-[581px]">
                    {/* Progress Sidebar */}
                    <ProgressSidebar currentStep="tudo-pronto" />

                    {/* Conteúdo de Conclusão */}
                    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 w-full md:w-[383px]">
                        <div className="flex flex-col gap-5 sm:gap-6 w-full max-w-sm">
                            <div className="flex flex-col gap-4 sm:gap-6 items-center">
                                <h2 className="text-xl sm:text-2xl font-semibold leading-7 sm:leading-8 text-text-primary text-center">
                                    Comece a monitorar seus bilhetes agora
                                </h2>
                                <p className="text-sm font-normal leading-5 text-text-tertiary text-center">
                                    Sua conta já está pronta. Você pode começar gratuitamente.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleAccessPlatform}
                                className="w-full min-h-[44px] px-4 py-3 bg-brand-yellow rounded-lg flex items-center justify-center text-sm font-medium leading-5 text-text-primary hover:bg-brand-yellow/90 active:scale-[0.98] transition-transform"
                            >
                                Acessar plataforma
                            </button>

                            <p className="text-xs font-normal leading-5 text-text-tertiary text-center px-2">
                                <span>Ao criar sua conta, você concorda com os nossos </span>
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

