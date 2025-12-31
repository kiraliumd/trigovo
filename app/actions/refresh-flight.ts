'use server'

import { createClient } from '@/lib/supabase/server'
import { scrapeBooking } from '@/lib/scraper'
import { revalidatePath } from 'next/cache'

export async function refreshFlight(ticketId: string, pnr: string, lastName: string, airline: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'Usuário não autenticado' }
    }

    try {
        console.log(`Refreshing flight ${pnr} for user ${user.id}...`)

        // Re-run scraper - Pass user.id as agencyId
        const details = await scrapeBooking(pnr, lastName, airline as any, undefined, user.id)

        // Update DB
        const { error } = await supabase
            .from('tickets')
            .update({
                flight_number: details.flightNumber,
                flight_date: details.departureDate,
                origin: details.origin,
                destination: details.destination,
                updated_at: new Date().toISOString()
            })
            .eq('id', ticketId)
        // RLS handles the security, but we could add .eq('agency_id', user.id)

        if (error) throw error

        revalidatePath('/dashboard/flights')
        return { success: true }
    } catch (error) {
        console.error('Falha ao atualizar voo:', error)
        return { success: false, error: 'Falha ao atualizar dados do voo' }
    }
}
