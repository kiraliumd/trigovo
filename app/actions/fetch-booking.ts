'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { scrapeBooking, type Airline } from '@/lib/scraper'

export async function fetchBookingDetails(pnr: string, lastname: string, airline: Airline, origin?: string) {
    // 1. Aguarde os cookies (Obrigatório no Next 16)
    const cookieStore = await cookies()

    // Debug de Cookies (Sherlock Holmes)
    const allCookies = cookieStore.getAll().map(c => c.name)
    console.log("🍪 COOKIES CHEGANDO NO SERVIDOR:", allCookies)

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
        console.error("❌ Erro Auth: Usuário nulo. Erro Supabase:", authError)
        throw new Error(`Usuário não autenticado. Cookies visíveis: ${allCookies.join(', ')}`)
    }

    console.log("✅ Usuário Autenticado:", user.id)

    try {
        // 2. Scrape Data
        const bookingDetails = await scrapeBooking(pnr, lastname, airline, origin)

        // 3. Get or Create Flight (Normalization)
        const { data: flightData, error: flightError } = await supabase
            .from('flights')
            .upsert({
                flight_number: bookingDetails.flightNumber,
                departure_date: bookingDetails.departureDate,
                origin: bookingDetails.origin,
                destination: bookingDetails.destination,
                status: 'Confirmado'
            }, {
                onConflict: 'flight_number, departure_date'
            })
            .select()
            .single()

        if (flightError) {
            console.error('Error upserting flight:', flightError)
            throw new Error('Falha ao registrar voo no sistema')
        }

        // 4. Inserção no Banco de Dados (Server-Side)

        // Extrair sobrenome real do passageiro (para corrigir AZUL-PASSENGER)
        let realPassengerLastname = lastname.toUpperCase();

        if (bookingDetails.itinerary_details?.passengers?.length > 0) {
            const firstPax = bookingDetails.itinerary_details.passengers[0];
            if (firstPax.name) {
                // Tenta extrair o sobrenome do nome completo
                const parts = firstPax.name.trim().split(' ');
                if (parts.length > 1) {
                    realPassengerLastname = parts.pop() || lastname.toUpperCase();
                }
            }
        }

        // Se for AZUL e o lastname for o placeholder, tenta usar o extraído
        if (airline === 'AZUL' && lastname === 'AZUL-PASSENGER') {
            // Mantém o realPassengerLastname calculado acima
        }

        const { error: dbError } = await supabase
            .from('tickets')
            .upsert({
                agency_id: user.id,
                pnr: pnr.toUpperCase(),
                passenger_lastname: realPassengerLastname,
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
