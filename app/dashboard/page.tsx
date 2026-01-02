import { Card, CardContent } from "@/components/ui/card"
import { HugeiconsIcon } from '@hugeicons/react'
import {
    PlaneIcon,
    CheckmarkSquare01Icon,
    Clock01Icon,
    ArrowRight01Icon,
    AirplaneModeIcon,
    Legal01Icon,
} from '@hugeicons/core-free-icons'
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { calculateCheckinStatus, Airline } from "@/lib/business-rules"
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from "@/lib/utils"

export default async function DashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Buscar dados consolidados
    // Buscamos os tickets (reservas) e seus voos associados via ticket_flights
    const { data: tickets } = await supabase
        .from('tickets')
        .select(`
            *,
            ticket_flights!inner(
                flight:flights(*)
            )
        `)
        .eq('agency_id', user?.id)
        .neq('status', 'Cancelado')
        .neq('status', 'Completo')

    // Calcular Métricas (Nível de Reserva/PNR)
    const activeFlights = tickets?.length || 0

    const checkinOpenCount = tickets?.filter(t => {
        // Uma reserva tem o check-in aberto se o SEU PRIMEIRO VOO estiver com check-in aberto
        const flights = t.ticket_flights?.map((tf: any) => tf.flight) || []
        if (flights.length === 0) return false

        // Ordenar por data de partida para pegar o primeiro
        const sortedFlights = [...flights].sort((a, b) =>
            new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime()
        )
        const firstFlight = sortedFlights[0]

        const { isCheckinOpen } = calculateCheckinStatus(t.airline as Airline, new Date(firstFlight.departure_date))
        return isCheckinOpen
    }).length || 0

    const next24hCount = tickets?.filter(t => {
        const flights = t.ticket_flights?.map((tf: any) => tf.flight) || []
        if (flights.length === 0) return false

        // Se qualquer voo da reserva for nas próximas 24h
        const now = new Date()
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

        return flights.some((f: any) => {
            const flightDate = new Date(f.departure_date)
            return flightDate >= now && flightDate <= tomorrow
        })
    }).length || 0

    // Legal Intelligence Logic (Nível de VOO)
    // Aqui listamos os voos individuais que dão direito a indenização
    const legalOpportunities: any[] = []

    tickets?.forEach(t => {
        const flights = t.ticket_flights?.map((tf: any) => tf.flight) || []
        const now = new Date()
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        flights.forEach((f: any) => {
            const flightDate = new Date(f.departure_date)

            // Filtro últimos 30 dias
            if (flightDate < thirtyDaysAgo || flightDate > now) return

            const status = f.status
            const delay = f.delay_minutes || 0

            // Cancelado OU Atrasado > 4 horas (240 mins)
            if (status === 'Cancelado' || (status === 'Atrasado' && delay >= 240)) {
                legalOpportunities.push({
                    ...t,
                    target_flight: f // Referência ao voo problemático
                })
            }
        })
    })

    const legalCount = legalOpportunities.length
    const potentialValue = legalCount * 5000

    return (
        <div className="space-y-4">
            {/* Título conforme design do Figma - 30px, semibold */}
            <h1 className="text-[30px] font-semibold leading-[40px] tracking-normal text-text-primary">
                Visão geral
            </h1>

            {/* Cards de Métricas - Estilo do Figma */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* CARD 1 - Voos Ativos */}
                <div className="bg-bg-secondary border border-border-default rounded-[15px] p-[5px] pt-3">
                    <div className="flex gap-1.5 items-center px-[5px] mb-3">
                        <p className="flex-1 text-sm font-normal leading-5 text-text-secondary">
                            Voos ativos
                        </p>
                        <div className="size-6 flex items-center justify-center">
                            <HugeiconsIcon icon={PlaneIcon} className="size-6 text-brand-yellow" />
                        </div>
                    </div>
                    <Card className="bg-white border-border-default rounded-xl border shadow-none">
                        <CardContent className="p-6">
                            <div className="flex flex-col gap-1.5 mb-4">
                                <p className="text-2xl font-semibold leading-8 text-text-primary">
                                    {activeFlights}
                                </p>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <p className="text-sm font-medium leading-5 text-text-primary">
                                    Passageiros aguardando embarque
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* CARD 2 - Check-in Aberto */}
                <div className="bg-bg-secondary border border-border-default rounded-[15px] p-[5px] pt-3">
                    <div className="flex gap-1.5 items-center px-[5px] mb-3">
                        <p className="flex-1 text-sm font-normal leading-5 text-text-secondary">
                            Check-in Aberto
                        </p>
                        <div className="size-6 flex items-center justify-center">
                            <HugeiconsIcon icon={CheckmarkSquare01Icon} className="size-6 text-green-600" />
                        </div>
                    </div>
                    <Card className="bg-white border-border-default rounded-xl border shadow-none">
                        <CardContent className="p-6">
                            <div className="flex flex-col gap-1.5 mb-4">
                                <p className="text-2xl font-semibold leading-8 text-text-primary">
                                    {checkinOpenCount}
                                </p>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium leading-5 text-text-primary">
                                    Ação necessária
                                </p>
                                {checkinOpenCount > 0 && (
                                    <Link href="/dashboard/flights" className="flex items-center gap-1 text-xs text-brand-blue hover:underline">
                                        Ver lista
                                        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                                    </Link>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* CARD 3 - Próximas 24hrs */}
                <div className="bg-bg-secondary border border-border-default rounded-[15px] p-[5px] pt-3">
                    <div className="flex gap-1.5 items-center px-[5px] mb-3">
                        <p className="flex-1 text-sm font-normal leading-5 text-text-secondary">
                            Proximas 24hrs
                        </p>
                        <div className="size-6 flex items-center justify-center">
                            <HugeiconsIcon icon={Clock01Icon} className="size-6 text-orange-500" />
                        </div>
                    </div>
                    <Card className="bg-white border-border-default rounded-xl border shadow-none">
                        <CardContent className="p-6">
                            <div className="flex flex-col gap-1.5 mb-4">
                                <p className="text-2xl font-semibold leading-8 text-text-primary">
                                    {next24hCount}
                                </p>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <p className="text-sm font-medium leading-5 text-text-primary">
                                    Embarques confirmados para breve
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Banner de Monitoramento Ativo - Estilo do Figma */}
            {legalCount > 0 ? (
                <div className="bg-bg-secondary border border-border-default rounded-[15px] p-[5px] pt-4 pb-[5px]">
                    <div className="flex gap-1.5 items-start px-[5px] mb-3">
                        <div className="size-12 flex items-center justify-center shrink-0">
                            <HugeiconsIcon icon={Legal01Icon} className="size-12 text-brand-blue" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-medium leading-normal text-text-primary mb-0.75">
                                Possíveis indenizações identificadas
                            </h3>
                            <p className="text-sm font-normal leading-5 text-text-secondary">
                                Ganhe até R$ 1.000 por cliente indicado e aumente o faturamento da sua agência.
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.25 items-start shrink-0">
                            <p className="text-xs font-semibold leading-normal text-text-tertiary whitespace-nowrap">
                                Potencial estimado
                            </p>
                            <p className="text-xl font-semibold leading-5 text-brand-blue whitespace-nowrap">
                                R$ {potentialValue.toLocaleString('pt-BR')}
                            </p>
                        </div>
                    </div>

                    {/* Lista de Oportunidades */}
                    <div className="flex flex-col">
                        {legalOpportunities
                            .sort((a, b) => new Date(b.flight_date || b.flights?.departure_date || 0).getTime() - new Date(a.flight_date || a.flights?.departure_date || 0).getTime())
                            .slice(0, 5)
                            .map((ticket, index, array) => {
                                const isCancelled = ticket.target_flight.status === 'Cancelado'
                                const delay = ticket.target_flight.delay_minutes || 0
                                const flightDate = ticket.target_flight.departure_date
                                const dateStr = flightDate
                                    ? format(new Date(flightDate), "d 'DE' MMM", { locale: ptBR }).toUpperCase()
                                    : ''
                                const origin = ticket.target_flight.origin || ticket.origin || ''
                                const isFirst = index === 0
                                const isLast = index === array.length - 1

                                return (
                                    <div
                                        key={ticket.id}
                                        className={cn(
                                            "bg-white border-border-default border border-solid px-6 py-4",
                                            isFirst && "rounded-tl-xl rounded-tr-xl",
                                            !isFirst && "border-t-0",
                                            isLast && "rounded-bl-xl rounded-br-xl"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col items-start justify-center">
                                                <p className="text-sm font-semibold leading-5 text-text-primary">
                                                    {ticket.pnr}
                                                </p>
                                                <p className="text-xs font-normal leading-normal text-text-tertiary">
                                                    {dateStr} · {origin}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2.5">
                                                <div className={cn(
                                                    "flex items-center justify-center h-[22px] px-2.5 py-0.5 rounded-lg",
                                                    isCancelled ? 'bg-status-error-bg' : 'bg-status-warning-bg'
                                                )}>
                                                    <p className={cn(
                                                        "text-xs font-medium leading-4",
                                                        isCancelled ? 'text-status-error-text' : 'text-status-warning-text'
                                                    )}>
                                                        {isCancelled ? 'Cancelado' : `Atraso ${Math.floor(delay / 60)}h`}
                                                    </p>
                                                </div>
                                                <Link href="#" className="flex items-center gap-1 text-xs text-brand-blue hover:underline">
                                                    Saiba mais
                                                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                    </div>

                    <div className="flex items-center px-[5px] py-0 mt-0">
                        <p className="flex-1 text-[10px] font-normal leading-5 text-text-secondary text-right">
                            Casos ainda não iniciados. Análise sob demanda.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-brand-yellow-lighter border border-brand-yellow rounded-xl shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] p-6">
                    <div className="flex gap-4 items-start">
                        <div className="size-12 flex items-center justify-center shrink-0 rounded-full bg-brand-yellow">
                            <HugeiconsIcon icon={AirplaneModeIcon} className="size-6 text-text-primary" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold leading-8 text-text-primary mb-0">
                                Monitoramento Ativo
                            </h3>
                            <div className="text-sm font-medium leading-5 text-text-secondary">
                                <p className="mb-0">
                                    Sua agência conta com assessoria jurídica gratuita da{' '}
                                    <span className="text-brand-blue">Aviar Soluções Aéreas</span>
                                    {' '}para casos elegíveis de atraso ou
                                </p>
                                <p className="mt-0">
                                    cancelamento de voos.{' '}
                                    <Link href="#" className="text-brand-blue underline underline-offset-2 hover:no-underline">
                                        Saiba mais...
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
