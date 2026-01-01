import { createClient } from '@/lib/supabase/server'
import { AddFlightDialog } from '@/components/dashboard/add-flight-dialog'
import { FlightsClient } from './flights-client'

export const revalidate = 0

export default async function FlightsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: tickets } = await supabase
        .from('tickets')
        .select('*')
        .eq('agency_id', user?.id)
        .order('flight_date', { ascending: true })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-[30px] font-semibold leading-[40px] tracking-normal text-[#191e3b]">
                    Gestão de bilhetes
                </h1>
                <AddFlightDialog />
            </div>

            <FlightsClient initialTickets={tickets || []} />
        </div>
    )
}
