'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { fetchBookingDetails } from '@/app/actions/fetch-booking'
import { Plus } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogOverlay
} from '@/components/ui/dialog'

export function AddFlightDialog() {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<'select-airline' | 'details'>('select-airline')
    const [pnr, setPnr] = useState('')
    const [lastName, setLastName] = useState('')
    const [origin, setOrigin] = useState('')
    const [airline, setAirline] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleAirlineSelect = (selected: string) => {
        setAirline(selected)
        setStep('details')
    }

    const handleBack = () => {
        setStep('select-airline')
        setAirline('')
        setOrigin('')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!airline) {
            toast.error('Por favor selecione uma companhia aérea')
            return
        }

        setLoading(true)

        try {
            // Para AZUL, o sobrenome é opcional no form, mas a função espera uma string.
            // Enviamos um valor padrão se estiver vazio.
            const finalLastName = (airline === 'AZUL' && !lastName) ? 'AZUL-PASSENGER' : lastName;

            await fetchBookingDetails(pnr, finalLastName, airline as any, origin)

            toast.success('Voo adicionado com sucesso!')
            setOpen(false)
            router.refresh()

            // Reset form
            setPnr('')
            setLastName('')
            setOrigin('')
            setAirline('')
            setStep('select-airline')

        } catch (error: any) {
            console.error(error)
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val)
            if (!val) {
                // Reset on close
                setTimeout(() => {
                    setStep('select-airline')
                    setAirline('')
                    setOrigin('')
                    setPnr('')
                    setLastName('')
                }, 300)
            }
        }}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Voo
                </Button>
            </DialogTrigger>
            <DialogOverlay className="bg-black/25 backdrop-blur-sm" />
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>
                        {step === 'select-airline' ? 'Qual a companhia aérea?' : `Dados do Voo - ${airline}`}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'select-airline'
                            ? 'Selecione a companhia para iniciar o monitoramento.'
                            : 'Insira os dados da reserva para buscar o voo.'}
                    </DialogDescription>
                </DialogHeader>

                {step === 'select-airline' ? (
                    <div className="grid grid-cols-3 gap-4 py-4">
                        <button
                            onClick={() => handleAirlineSelect('LATAM')}
                            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-slate-100 bg-white p-4 transition-all hover:border-blue-600 hover:bg-blue-50"
                        >
                            <div className="h-12 w-12 rounded-full bg-blue-900 flex items-center justify-center text-white font-bold text-xs">LATAM</div>
                            <span className="font-medium text-slate-700">LATAM</span>
                        </button>

                        <button
                            onClick={() => handleAirlineSelect('GOL')}
                            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-slate-100 bg-white p-4 transition-all hover:border-orange-500 hover:bg-orange-50"
                        >
                            <div className="h-12 w-12 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-xs">GOL</div>
                            <span className="font-medium text-slate-700">GOL</span>
                        </button>

                        <button
                            onClick={() => handleAirlineSelect('AZUL')}
                            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-slate-100 bg-white p-4 transition-all hover:border-sky-500 hover:bg-sky-50"
                        >
                            <div className="h-12 w-12 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold text-xs">AZUL</div>
                            <span className="font-medium text-slate-700">AZUL</span>
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 py-2">
                        <div className="flex items-center mb-4">
                            <Button variant="ghost" size="sm" onClick={handleBack} type="button" className="-ml-2 text-slate-500">
                                ← Voltar
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="pnr">Código PNR</Label>
                                <Input
                                    id="pnr"
                                    placeholder="PNR (6 dígitos)"
                                    value={pnr}
                                    onChange={(e) => setPnr(e.target.value)}
                                    required
                                    maxLength={20}
                                    className="uppercase font-mono"
                                />
                            </div>

                            {airline !== 'AZUL' && (
                                <div className="space-y-2">
                                    <Label htmlFor="lastname">Sobrenome</Label>
                                    <Input
                                        id="lastname"
                                        placeholder="ex: SILVA"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        required={airline !== 'AZUL'}
                                        className="uppercase"
                                    />
                                </div>
                            )}

                            {(airline === 'GOL' || airline === 'AZUL') && (
                                <div className="space-y-2">
                                    <Label htmlFor="origin">Aeroporto de Origem (Sigla)</Label>
                                    <Input
                                        id="origin"
                                        placeholder="Ex: GRU, CGB, GIG"
                                        value={origin}
                                        onChange={(e) => setOrigin(e.target.value)}
                                        required
                                        maxLength={3}
                                        className="uppercase font-mono"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Obrigatório para reservas {airline}.
                                    </p>
                                </div>
                            )}
                        </div>

                        <Button type="submit" className="w-full mt-4" disabled={loading}>
                            {loading ? 'Buscando Reserva...' : 'Adicionar Voo'}
                        </Button>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
