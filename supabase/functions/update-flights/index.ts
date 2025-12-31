import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const AVIATIONSTACK_API_KEY = Deno.env.get('AVIATIONSTACK_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

Deno.serve(async (req) => {
    try {
        if (!AVIATIONSTACK_API_KEY) {
            throw new Error('Missing AVIATIONSTACK_API_KEY')
        }

        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        // 1. Buscar voos ativos (Hoje e Amanhã)
        const today = new Date()
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        const todayStr = today.toISOString().split('T')[0]
        const tomorrowStr = tomorrow.toISOString().split('T')[0]

        console.log(`Buscando voos entre ${todayStr} e ${tomorrowStr}`)

        const { data: flights, error } = await supabase
            .from('flights')
            .select('*')
            .not('status', 'in', '("Atracado", "Cancelado", "Completo")')
            .gte('departure_date', `${todayStr}T00:00:00`)
            .lte('departure_date', `${tomorrowStr}T23:59:59`)

        if (error) throw error

        if (!flights || flights.length === 0) {
            return new Response(JSON.stringify({ message: 'Nenhum voo ativo para atualizar.' }), {
                headers: { 'Content-Type': 'application/json' },
            })
        }

        let updatedCount = 0
        const results = []

        // 2. Loop de atualização
        for (const flight of flights) {
            // Delay para respeitar rate limit da API (500ms)
            await new Promise(resolve => setTimeout(resolve, 500))

            try {
                const url = `http://api.aviationstack.com/v1/flights?access_key=${AVIATIONSTACK_API_KEY}&flight_iata=${flight.flight_number}`
                const response = await fetch(url)

                if (!response.ok) continue

                const json = await response.json()
                if (!json.data || json.data.length === 0) continue

                const flightData = json.data[0]
                const apiStatus = flightData.flight_status
                const totalDelay = (flightData.departure.delay || 0) + (flightData.arrival.delay || 0)

                // Lógica de Status (Simplificada para a Edge Function)
                let finalStatus = 'Confirmado'
                if (apiStatus === 'cancelled' || apiStatus === 'diverted') {
                    finalStatus = 'Cancelado'
                } else if (totalDelay > 30) {
                    finalStatus = 'Atrasado'
                } else if (apiStatus === 'landed') {
                    finalStatus = 'Completo'
                } else {
                    const arrivalTime = flightData.arrival.estimated || flightData.arrival.scheduled
                    if (arrivalTime && new Date(arrivalTime) < new Date()) {
                        finalStatus = 'Completo'
                    }
                }

                // 3. Update no Banco
                if (finalStatus !== flight.status || totalDelay !== flight.delay_minutes) {
                    const { error: updateError } = await supabase
                        .from('flights')
                        .update({
                            status: finalStatus,
                            delay_minutes: totalDelay,
                        })
                        .eq('id', flight.id)

                    if (!updateError) {
                        updatedCount++
                        results.push({ flight: flight.flight_number, status: finalStatus })
                    }
                }
            } catch (e) {
                console.error(`Erro ao processar voo ${flight.flight_number}:`, e)
            }
        }

        return new Response(JSON.stringify({ processed: flights.length, updated: updatedCount, details: results }), {
            headers: { 'Content-Type': 'application/json' },
        })

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
})
