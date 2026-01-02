'use client'

import Image from 'next/image'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkSquare01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

interface ProgressStep {
    title: string
    description: string
    completed: boolean
    active: boolean
}

interface ProgressSidebarProps {
    currentStep: 'criar-conta' | 'adicionar-informacoes' | 'tudo-pronto'
}

export function ProgressSidebar({ currentStep }: ProgressSidebarProps) {
    const steps: ProgressStep[] = [
        {
            title: 'Criar conta',
            description: 'Em segundos e utilizar nossa plataforma',
            completed: currentStep !== 'criar-conta',
            active: currentStep === 'criar-conta'
        },
        {
            title: 'Adicionar suas informações',
            description: 'Preencha os dados da sua agência',
            completed: currentStep === 'tudo-pronto',
            active: currentStep === 'adicionar-informacoes'
        },
        {
            title: 'Tudo pronto',
            description: 'Sua agência já pode monitorar voos',
            completed: currentStep === 'tudo-pronto',
            active: currentStep === 'tudo-pronto'
        }
    ]

    return (
        <>
            {/* Mobile: Progress Bar Horizontal no Topo */}
            <div className="md:hidden bg-brand-yellow w-full p-4">
                <div className="bg-white rounded-xl p-4">
                    {/* Logo */}
                    <div className="h-[24.5px] w-[99.011px] mb-4">
                        <Image
                            src="/logo-tigrovo-amarela.svg"
                            alt="Trigovo"
                            width={100}
                            height={25}
                            className="h-[24.5px] w-auto object-contain"
                            unoptimized
                        />
                    </div>
                    {/* Progress Steps Horizontal */}
                    <div className="flex items-center justify-between gap-2">
                        {steps.map((step, index) => (
                            <div key={step.title} className="flex flex-col items-center flex-1 min-w-0">
                                <div className="flex items-center gap-2 w-full mb-2">
                                    <div className="size-3 shrink-0 flex items-center justify-center">
                                        {step.completed ? (
                                            <HugeiconsIcon
                                                icon={CheckmarkSquare01Icon}
                                                className="size-3 text-green-600"
                                            />
                                        ) : (
                                            <div className="size-3 border border-text-tertiary rounded-sm bg-transparent" />
                                        )}
                                    </div>
                                    {index < steps.length - 1 && (
                                        <div className={cn(
                                            "flex-1 h-[2px] bg-green-600",
                                            step.completed ? "opacity-100" : "opacity-30"
                                        )} />
                                    )}
                                </div>
                                <div className="flex flex-col items-center text-center w-full">
                                    <p className="text-[10px] sm:text-xs font-semibold leading-tight text-text-primary mb-0.5">
                                        {step.title}
                                    </p>
                                    <p className="text-[9px] sm:text-[10px] font-normal leading-tight text-text-tertiary hidden sm:block">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Desktop: Progress Sidebar Vertical */}
            <div className="hidden md:flex bg-brand-yellow h-full flex-col justify-between p-8 w-[383px]">
                <div className="bg-white flex flex-col gap-[101px] grow items-start p-8 rounded-2xl w-full">
                    {/* Logo */}
                    <div className="h-[24.5px] w-[99.011px] shrink-0">
                        <Image
                            src="/logo-tigrovo-amarela.svg"
                            alt="Trigovo"
                            width={100}
                            height={25}
                            className="h-[24.5px] w-auto object-contain"
                            unoptimized
                        />
                    </div>

                    {/* Progress Steps */}
                    <div className="flex flex-col items-start w-full">
                        {steps.map((step, index) => (
                            <div key={step.title} className="flex flex-col w-full">
                                <div className="flex gap-2.5 items-center w-full">
                                    <div className="size-[12.667px] shrink-0 flex items-center justify-center">
                                        {step.completed ? (
                                            <HugeiconsIcon
                                                icon={CheckmarkSquare01Icon}
                                                className="size-[12.667px] text-green-600"
                                            />
                                        ) : (
                                            <div className="size-[12.667px] border border-text-tertiary rounded-sm bg-transparent" />
                                        )}
                                    </div>
                                    <div className="flex flex-col grow items-start min-w-0">
                                        <p className="text-sm font-semibold leading-normal text-text-primary">
                                            {step.title}
                                        </p>
                                        <p className="text-xs font-normal leading-[19px] text-text-tertiary">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                                {index < steps.length - 1 && (
                                    <div className="h-10 w-[7px] ml-[5.333px] mt-0 shrink-0">
                                        <div className={cn(
                                            "h-full w-full bg-green-600",
                                            step.completed ? "opacity-100" : "opacity-30"
                                        )} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    )
}

