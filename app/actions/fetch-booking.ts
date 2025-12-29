'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { scrapeBooking, type Airline } from '@/lib/scraper'
import { z } from 'zod'

// Schema de validação para inputs do usuário
const bookingSchema = z.object({
    pnr: z.string().min(5).max(20).regex(/^[a-zA-Z0-9]+$/),
    lastname: z.string().min(2).max(50),
    airline: z.enum(['LATAM', 'GOL', 'AZUL']),
    origin: z.string().length(3).optional()
})

export async function fetchBookingDetails(pnr: string, lastname: string, airline: Airline, origin?: string) {
    // 0. Validação de Input
    const validated = bookingSchema.safeParse({ pnr, lastname, airline, origin })
    if (!validated.success) {
        throw new Error('Dados de reserva inválidos. Verifique o PNR e o sobrenome.')
    }

    // 1. Aguarde os cookies (Obrigatório no Next 16)
    const cookieStore = await cookies()

    // 2. Crie o cliente manualmente dentro da Action
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Ignorar erros de setar cookies em Server Action
                    }
                },
            },
        }
    )

    // 3. Verifique o usuário de forma segura
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (!user) {
        throw new Error("Você não tem permissão para realizar esta ação. Por favor, faça login novamente.")
    }

    console.log("✅ Usuário Autenticado:", user.id)

    try {
        // 2. Scrape Data
        const bookingDetails = await scrapeBooking(pnr, lastname, airline, origin, user.id)

        // 3. Get or Create Flight (Normalization)
        const flightInsert = {
            flight_number: bookingDetails.flightNumber,
            departure_date: bookingDetails.departureDate,
            origin: bookingDetails.origin,
            destination: bookingDetails.destination,
            status: 'Confirmado'
        }

        console.log('Dados indo para o banco (flights):', JSON.stringify(flightInsert, null, 2));

        const { data: flightData, error: flightError } = await supabase
            .from('flights')
            .upsert(flightInsert, {
                onConflict: 'flight_number, departure_date'
            })
            .select()
            .single()

        if (flightError) {
            console.error('Error upserting flight:', flightError)
            throw new Error('Falha ao registrar voo no sistema')
        }

        // 4. Inserção no Banco de Dados (Server-Side)

        // Lógica de Sobrenome: Prioriza o Input do Usuário
        let finalPassengerLastname = lastname.toUpperCase();

        // Apenas para AZUL (onde o usuário não digita sobrenome), tentamos extrair do robô
        if (lastname === 'AZUL-PASSENGER' && bookingDetails.itinerary_details?.passengers?.length > 0) {
            const firstPax = bookingDetails.itinerary_details.passengers[0];
            if (firstPax.name) {
                const parts = firstPax.name.trim().split(' ');
                if (parts.length > 1) {
                    finalPassengerLastname = parts.pop() || 'AZUL-PASSENGER';
                }
            }
        }

        const { error: dbError } = await supabase
            .from('tickets')
            .upsert({
                agency_id: user.id,
                pnr: pnr.toUpperCase(),
                passenger_lastname: finalPassengerLastname, // Usa a variável corrigida
                // passenger_name: REMOVIDO para não sobrescrever dados manuais da agência
                airline: airline,
                flight_id: flightData.id,
                // Legacy Columns
                flight_number: bookingDetails.flightNumber,
                flight_date: bookingDetails.departureDate,
                origin: bookingDetails.origin,
                destination: bookingDetails.destination,
                status: 'Confirmado',
                checkin_status: 'Fechado',
                itinerary_details: bookingDetails.itinerary_details
            }, {
                onConflict: 'pnr, agency_id'
            })

        if (dbError) throw dbError

        revalidatePath('/dashboard/flights')
        return { success: true, data: bookingDetails }

    } catch (error) {
        console.error(`Action failed for ${airline} ${pnr}:`, error)
        throw new Error(`Falha ao adicionar voo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    }
}
