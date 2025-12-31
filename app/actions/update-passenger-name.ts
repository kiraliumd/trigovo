'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updatePassengerName(ticketId: string, newName: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'Usuário não autenticado' }
    }

    try {
        const { error } = await supabase
            .from('tickets')
            .update({ passenger_name: newName })
            .eq('id', ticketId)
        // RLS ensures the user can only update their own tickets
        // but we can add .eq('agency_id', user.id) for extra safety if needed.

        if (error) throw error

        revalidatePath('/dashboard/flights')
        return { success: true }
    } catch (error) {
        console.error('Falha ao atualizar nome do passageiro:', error)
        return { success: false, error: 'Falha ao atualizar nome' }
    }
}
