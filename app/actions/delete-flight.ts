'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteFlight(ticketId: string) {
    const supabase = await createClient()

    try {
        // 1. Recuperar o ID do voo antes de apagar o ticket
        const { data: ticket } = await supabase
            .from('tickets')
            .select('flight_id')
            .eq('id', ticketId)
            .single()

        // 2. Apagar o Ticket
        const { error } = await supabase
            .from('tickets')
            .delete()
            .eq('id', ticketId)

        if (error) throw error

        // 3. Verificar se o voo ficou órfão (sem outros tickets usando ele)
        if (ticket?.flight_id) {
            const { count } = await supabase
                .from('tickets')
                .select('id', { count: 'exact', head: true })
                .eq('flight_id', ticket.flight_id)

            // Se count for 0, ninguém mais está monitorando esse voo. Podemos limpar.
            if (count === 0) {
                console.log(`Limpando voo órfão: ${ticket.flight_id}`)
                // Tenta deletar o voo. Se falhar por RLS ou FK, logamos o erro.
                const { error: deleteError } = await supabase.from('flights').delete().eq('id', ticket.flight_id)
                if (deleteError) console.error('Erro ao limpar voo órfão:', deleteError)
            }
        }

        revalidatePath('/dashboard/flights')
        return { success: true }
    } catch (error) {
        console.error('Falha ao excluir voo:', error)
        return { success: false, error: 'Falha ao excluir voo' }
    }
}
