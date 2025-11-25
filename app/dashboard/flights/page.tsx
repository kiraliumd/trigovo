import { createClient } from '@/lib/supabase/server'
import { AddFlightDialog } from '@/components/dashboard/add-flight-dialog'
import { FlightsClient } from './flights-client'

export const revalidate = 0

export default async function FlightsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: tickets } = await supabase
        .from('tickets')
        .select('*, flights(flight_number, origin, destination, status, departure_date)')
        .eq('agency_id', user?.id)
        .order('flight_date', { ascending: true })

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Voos</h2>
                <AddFlightDialog />
            </div>

            <FlightsClient initialTickets={tickets || []} />
        </div>
    )
}
