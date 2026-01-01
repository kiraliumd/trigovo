import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getRealTimeFlightStatus } from '@/lib/aviation-stack'

// Force dynamic to ensure it runs every time
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    // 1. Security Check
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Initialize Admin Client (Bypass RLS)
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        // 3. Select Flights (Today & Tomorrow, Active only)
        const today = new Date()
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        const todayStr = today.toISOString().split('T')[0]
        const tomorrowStr = tomorrow.toISOString().split('T')[0]

        const { data: flights, error } = await supabase
            .from('flights')
            .select('*')
            .or(`status.neq.Atracado,status.neq.Cancelado`) // Not Landed AND Not Cancelled
            .gte('departure_date', `${todayStr}T00:00:00`)
            .lte('departure_date', `${tomorrowStr}T23:59:59`)

        if (error) throw error

        if (!flights || flights.length === 0) {
            return NextResponse.json({ processed: 0, updated: 0, message: 'No active flights found for update.' })
        }

        let updatedCount = 0
        const results = []

        // 4. Update Loop
        for (const flight of flights) {
            // Delay to respect API Rate Limits (500ms)
            await new Promise(resolve => setTimeout(resolve, 500))

            const realTimeStatus = await getRealTimeFlightStatus(flight.flight_number)

            // Check if status changed
            if (realTimeStatus.status !== flight.status) {
                const { error: updateError } = await supabase
                    .from('flights')
                    .update({
                        status: realTimeStatus.status,
                        delay_minutes: realTimeStatus.delay,
                    })
                    .eq('id', flight.id)

                if (!updateError) {
                    updatedCount++
                    results.push({ flight: flight.flight_number, old: flight.status, new: realTimeStatus.status })

                    // 5. Sync Status to consolidated Tickets
                    // Find all tickets associated with this flight
                    const { data: linkedTickets } = await supabase
                        .from('ticket_flights')
                        .select('ticket_id')
                        .eq('flight_id', flight.id)

                    if (linkedTickets && linkedTickets.length > 0) {
                        const ticketIds = linkedTickets.map(lt => lt.ticket_id)
                        await supabase
                            .from('tickets')
                            .update({
                                status: realTimeStatus.status,
                                // Opcional: atualizar dados de exibição se este for o voo principal
                                // mas por ora o status é o mais crítico
                            })
                            .in('id', ticketIds)
                    }
                }
            }
        }

        return NextResponse.json({
            processed: flights.length,
            updated: updatedCount,
            details: results
        })

    } catch (error) {
        console.error('Cron Job Failed:', error)
        return NextResponse.json({ error: 'Internal Server Error', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
    }
}
