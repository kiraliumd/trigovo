'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { submitScrapeJob, getScraperJobStatus, type Airline, type BookingDetails } from '@/lib/scraper'
import { z } from 'zod'

// Schema de validação para inputs do usuário
const bookingSchema = z.object({
    pnr: z.string().min(5, "Localizador muito curto").max(20).regex(/^[a-zA-Z0-9]+$/, "Localizador deve ser alfanumérico"),
    lastname: z.string().min(2, "Sobrenome muito curto").max(50),
    airline: z.enum(['LATAM', 'GOL', 'AZUL']),
    origin: z.string().transform(v => v === "" ? undefined : v).pipe(z.string().length(3, "Origem deve ter 3 letras").optional())
})

/**
 * 1. Inicia o Job no Scraper e retorna o JobID
 */
export async function startScraperJob(pnr: string, lastname: string, airline: Airline, origin?: string) {
    console.log(`🚀 startScraperJob: ${airline} ${pnr} (Origin: ${origin})`);

    const validated = bookingSchema.safeParse({ pnr, lastname, airline, origin })
    if (!validated.success) {
        const errorMsg = validated.error.errors.map(e => `${e.path}: ${e.message}`).join(', ');
        console.error('❌ Validação falhou:', errorMsg);
        throw new Error(`Dados inválidos: ${errorMsg}`);
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
                    } catch { }
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Não autenticado.")

    // Inicia o job e retorna jobId
    const finalLastName = (airline === 'AZUL' && !lastname) ? 'AZUL-PASSENGER' : lastname;
    const result = await submitScrapeJob(pnr, finalLastName, airline, origin, user.id);

    return { success: true, jobId: result.jobId, initialStatus: result.status, initialResult: result.result };
}

/**
 * 2. Consulta o Status do Job (Ação segura para o cliente chamar)
 */
export async function checkScraperJobStatus(jobId: string) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
                    } catch { }
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Não autenticado.")

    return await getScraperJobStatus(jobId);
}

/**
 * 3. Salva o resultado final no Banco de Dados
 */
export async function saveScraperResult(pnr: string, airline: Airline, bookingDetails: BookingDetails, originalLastname: string) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
                    } catch { }
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Não autenticado.")

    try {
        const trips = bookingDetails.itinerary_details?.trips || []
        const savedFlightIds: string[] = []

        // 1. Extrair todos os segmentos
        const segmentsToProcess = []
        if (trips.length === 0) {
            segmentsToProcess.push({
                flightNumber: bookingDetails.flightNumber,
                departureDate: bookingDetails.departureDate,
                origin: bookingDetails.origin,
                destination: bookingDetails.destination,
                arrivalDate: (bookingDetails as any).arrivalDate || null,
                airline: airline
            })
        } else {
            for (const trip of trips) {
                for (const segment of trip.segments) {
                    segmentsToProcess.push({
                        ...segment,
                        airline: segment.airline || airline
                    })
                }
            }
        }

        if (segmentsToProcess.length === 0) throw new Error("Nenhum trecho de voo encontrado no itinerário.")

        // 2. Normalização de Sobrenome (comum à reserva)
        let finalPassengerLastname = originalLastname.toUpperCase();
        if (originalLastname === 'AZUL-PASSENGER' && bookingDetails.itinerary_details?.passengers?.length > 0) {
            const firstPax = bookingDetails.itinerary_details.passengers[0];
            if (firstPax.name) {
                const parts = firstPax.name.trim().split(' ');
                if (parts.length > 1) finalPassengerLastname = parts.pop() || 'AZUL-PASSENGER';
            }
        }

        // 3. Upsert do Ticket Único (Consolidado por PNR)
        // Usamos o primeiro trecho para as informações de exibição principal
        const firstSegment = segmentsToProcess[0]
        const { data: ticketData, error: ticketError } = await supabase
            .from('tickets')
            .upsert({
                agency_id: user.id,
                pnr: pnr.toUpperCase(),
                passenger_lastname: finalPassengerLastname,
                airline: airline, // Airline principal da reserva
                flight_number: firstSegment.flightNumber,
                flight_date: firstSegment.departureDate || firstSegment.date,
                origin: firstSegment.origin,
                destination: firstSegment.destination,
                status: 'Confirmado',
                checkin_status: 'Fechado',
                itinerary_details: bookingDetails.itinerary_details
            }, { onConflict: 'pnr, agency_id' })
            .select().single()

        if (ticketError) throw ticketError

        // 4. Upsert dos Voos e Associações
        for (const segment of segmentsToProcess) {
            // Upsert Flight
            const flightInsert = {
                flight_number: segment.flightNumber,
                departure_date: segment.departureDate || segment.date,
                origin: segment.origin,
                destination: segment.destination,
                airline: segment.airline,
                arrival_date: segment.arrivalDate,
                status: 'Confirmado'
            }

            const { data: flightData, error: flightError } = await supabase
                .from('flights')
                .upsert(flightInsert, { onConflict: 'flight_number, departure_date' })
                .select().single()

            if (flightError) throw flightError

            // Vincular Ticket ao Flight na tabela associativa
            const { error: linkError } = await supabase
                .from('ticket_flights')
                .upsert({
                    ticket_id: ticketData.id,
                    flight_id: flightData.id
                }, { onConflict: 'ticket_id, flight_id' })

            if (linkError) throw linkError
            savedFlightIds.push(flightData.id)
        }

        revalidatePath('/dashboard/flights')
        return { success: true, ticketId: ticketData.id, count: savedFlightIds.length }

    } catch (error: any) {
        console.error("Save result failed. Full error:", error)

        // Se o erro for de coluna inexistente ou constraint, dar uma dica melhor
        const errorMessage = error.message || "Erro desconhecido"
        if (errorMessage.includes("column") || errorMessage.includes("constraint")) {
            throw new Error(`Erro de banco de dados: ${errorMessage}. Certifique-se de executar o SQL de migração no painel da Supabase.`)
        }

        throw new Error(`Falha ao salvar dados no banco: ${errorMessage}`)
    }
}

// Mantendo para compatibilidade ou se necessário chamar síncrono internamente
export async function fetchBookingDetails(pnr: string, lastname: string, airline: Airline, origin?: string) {
    const job = await startScraperJob(pnr, lastname, airline, origin);
    if (job.initialStatus === 'completed' && job.initialResult) {
        return await saveScraperResult(pnr, airline, job.initialResult, lastname);
    }
    throw new Error("Esta ação agora requer polling no cliente e não pode ser chamada de forma síncrona simples.");
}
