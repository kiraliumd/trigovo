import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BoardingPassClient } from './boarding-pass-client'

export default async function BoardingPassPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    console.log(`[BoardingPassPage] Rendering for ID: ${id}`)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.log('[BoardingPassPage] No user, redirecting to login')
        redirect('/login')
    }

    // Fetch Ticket with Flight details
    const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
            *,
            flights (*)
        `)
        .eq('id', id)
        .eq('agency_id', user.id)
        .single()

    console.log('[BoardingPassPage] Ticket fetch result:', { ticket: !!ticket, error, userId: user.id })

    if (error || !ticket) {
        console.error('[BoardingPassPage] Ticket not found or error, redirecting')
        redirect('/dashboard/flights')
    }

    // Fetch Agency details separately
    const { data: agency } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', user.id)
        .single()

    // Normalize flight data (handle legacy structure if needed)
    const flight = ticket.flights || {
        flight_number: ticket.flight_number,
        origin: ticket.origin,
        destination: ticket.destination,
        departure_date: ticket.flight_date,
    }

    // Normalize agency data
    const agencyData = agency || {}

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Emissão de Bilhete</h2>
            </div>
            <BoardingPassClient ticket={ticket} flight={flight} agency={agencyData} />
        </div>
    )
}
