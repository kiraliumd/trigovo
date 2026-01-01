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

        // Import saveScraperResult inside or ensure it's available. 
        // Since it's a server action, let's call it directly.
        const { saveScraperResult } = await import('./fetch-booking')
        await saveScraperResult(pnr, airline as any, details, lastName)

        revalidatePath('/dashboard/flights')
        return { success: true }
    } catch (error) {
        console.error('Falha ao atualizar voo:', error)
        return { success: false, error: 'Falha ao atualizar dados do voo' }
    }
}
