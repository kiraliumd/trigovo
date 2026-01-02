'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { completeRegistration } from '@/app/actions/onboarding'
import { ProgressSidebar } from '@/components/onboarding/progress-sidebar'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const schema = z.object({
    name: z.string().min(2, 'Nome da agência é obrigatório'),
    cnpj: z.string().min(18, 'CNPJ inválido'),
    whatsapp: z.string().min(15, 'WhatsApp inválido'),
})

type FormData = z.infer<typeof schema>

export function OnboardingFormNew() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [serverError, setServerError] = useState('')

    const { register, handleSubmit, formState: { errors }, setValue } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: '',
            cnpj: '',
            whatsapp: ''
        }
    })

    const formatCNPJ = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2')
            .substring(0, 18)
    }

    const formatPhone = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .substring(0, 15)
    }

    const onSubmit = async (data: FormData) => {
        setIsLoading(true)
        setServerError('')

        const formData = new FormData()
        formData.append('full_name', '') // Not required in this step
        formData.append('name', data.name)
        formData.append('cnpj', data.cnpj)
        formData.append('whatsapp', data.whatsapp)

        try {
            const result = await completeRegistration(null, formData)
            if (result?.errors) {
                console.error(result.errors)
                setServerError('Por favor, revise os campos destacados.')
            } else if (result?.message) {
                setServerError(result.message)
            } else {
                // Success - redirect to done page
                router.push('/onboarding/done')
            }
        } catch (error) {
            // Success usually redirects
            router.push('/onboarding/done')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-white flex flex-col md:items-center md:justify-center px-4 py-4 sm:py-6 md:py-8">
            <div className="w-full max-w-[766px]">
                <div className="bg-white border border-border-default rounded-xl overflow-hidden flex flex-col md:flex-row md:h-[581px]">
                    {/* Progress Sidebar */}
                    <ProgressSidebar currentStep="adicionar-informacoes" />

                    {/* Formulário */}
                    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 w-full md:w-[383px]">
                        <div className="flex flex-col gap-5 sm:gap-6 w-full max-w-[320px]">
                            <div className="flex flex-col gap-4 sm:gap-6">
                                <h2 className="text-xl sm:text-2xl font-semibold leading-7 sm:leading-8 text-text-primary text-center">
                                    Adicionar informações
                                </h2>
                                <p className="text-sm font-normal leading-5 text-text-tertiary text-center opacity-70">
                                    Precisamos de alguns dados rápidos para configurar sua conta.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 sm:gap-5">
                                <div className="flex flex-col gap-2 sm:gap-3">
                                    <Label htmlFor="name" className="text-sm font-medium leading-5 text-text-primary">
                                        Agência
                                    </Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex: Agência Viagem Pro"
                                        {...register('name')}
                                        className={`min-h-[44px] px-4 py-2.5 rounded-md border-border-default bg-white text-base leading-6 text-text-primary placeholder:text-text-tertiary ${errors.name ? 'border-red-500' : ''
                                            }`}
                                    />
                                    {errors.name && (
                                        <p className="text-xs font-medium text-red-500 mt-1">{errors.name.message}</p>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 sm:gap-3">
                                    <Label htmlFor="cnpj" className="text-sm font-medium leading-5 text-text-primary">
                                        CNPJ
                                    </Label>
                                    <Input
                                        id="cnpj"
                                        placeholder="CNPJ da empresa"
                                        {...register('cnpj', {
                                            onChange: (e) => {
                                                setValue('cnpj', formatCNPJ(e.target.value))
                                            }
                                        })}
                                        className={`min-h-[44px] px-4 py-2.5 rounded-md border-border-default bg-white text-base leading-6 text-text-primary placeholder:text-text-tertiary ${errors.cnpj ? 'border-red-500' : ''
                                            }`}
                                    />
                                    {errors.cnpj && (
                                        <p className="text-xs font-medium text-red-500 mt-1">{errors.cnpj.message}</p>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 sm:gap-3">
                                    <Label htmlFor="whatsapp" className="text-sm font-medium leading-5 text-text-primary">
                                        WhatsApp
                                    </Label>
                                    <Input
                                        id="whatsapp"
                                        placeholder="Seu telefone"
                                        type="tel"
                                        inputMode="tel"
                                        {...register('whatsapp', {
                                            onChange: (e) => {
                                                setValue('whatsapp', formatPhone(e.target.value))
                                            }
                                        })}
                                        className={`min-h-[44px] px-4 py-2.5 rounded-md border-border-default bg-white text-base leading-6 text-text-primary placeholder:text-text-tertiary ${errors.whatsapp ? 'border-red-500' : ''
                                            }`}
                                    />
                                    {errors.whatsapp && (
                                        <p className="text-xs font-medium text-red-500 mt-1">{errors.whatsapp.message}</p>
                                    )}
                                </div>

                                {serverError && (
                                    <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm font-medium text-center">
                                        {serverError}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full min-h-[44px] px-4 py-3 bg-brand-yellow rounded-lg flex items-center justify-center text-sm font-medium leading-5 text-text-primary hover:bg-brand-yellow/90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform mt-2"
                                >
                                    {isLoading ? 'Carregando...' : 'Continuar'}
                                </button>
                            </form>

                            <p className="text-xs font-normal leading-5 text-text-tertiary text-center opacity-70 px-2">
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

