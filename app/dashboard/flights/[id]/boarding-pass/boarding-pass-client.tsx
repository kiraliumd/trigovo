"use client"

import { useRef, useState } from "react"
import { useReactToPrint } from "react-to-print"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Printer } from "lucide-react"
import { TicketLayout } from "@/components/boarding-pass/ticket-layout"

interface BoardingPassClientProps {
    ticket: any
    flight: any
    agency: any
}

export function BoardingPassClient({
    ticket,
    flight,
    agency,
}: BoardingPassClientProps) {
    console.log('[BoardingPassClient] Rendering client component', { ticketId: ticket?.id })
    const [hasHandBag, setHasHandBag] = useState(true)
    const [hasCheckedBag, setHasCheckedBag] = useState(false)
    const [showAgencyLogo, setShowAgencyLogo] = useState(true)

    const componentRef = useRef<HTMLDivElement>(null)
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `BoardingPass-${ticket.pnr}`,
    })

    // Parse Itinerary Details
    const details = ticket.itinerary_details as any || {}

    // Fallback if no rich data
    const passengers = details.passengers || [{
        name: `${ticket.passenger_name} ${ticket.passenger_lastname}`,
        seat: ticket.seat || "---",
        group: ticket.group || "C"
    }]

    const segments = details.segments || [{
        flightNumber: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        date: flight.departure_date,
        arrivalDate: null // Will calculate fallback in layout
    }]

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-100px)]">
            {/* Controls Section */}
            <Card className="lg:col-span-1 h-fit">
                <CardHeader>
                    <CardTitle>Configurar Emissão</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground">
                            Bagagens
                        </h3>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="handbag"
                                checked={hasHandBag}
                                onCheckedChange={(c) => setHasHandBag(!!c)}
                            />
                            <Label htmlFor="handbag">Incluir Mala de Mão (10kg)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="checkedbag"
                                checked={hasCheckedBag}
                                onCheckedChange={(c) => setHasCheckedBag(!!c)}
                            />
                            <Label htmlFor="checkedbag">
                                Incluir Bagagem Despachada (23kg)
                            </Label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground">
                            Branding
                        </h3>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="logo-mode">Exibir Logo da Agência</Label>
                            <Switch
                                id="logo-mode"
                                checked={showAgencyLogo}
                                onCheckedChange={setShowAgencyLogo}
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <Button className="w-full" onClick={() => handlePrint()}>
                            <Printer className="mr-2 h-4 w-4" />
                            Gerar PDF / Imprimir
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Preview Section */}
            <div className="lg:col-span-2 bg-gray-100 rounded-xl border border-gray-200 p-8 flex items-start justify-center overflow-auto">
                <div className="scale-75 lg:scale-90 xl:scale-100 transition-transform origin-top">
                    <div ref={componentRef} className="space-y-8 p-4 bg-gray-100 print:bg-white print:p-0">
                        {passengers.map((passenger: any, index: number) => (
                            <div key={index} className="print:break-after-page">
                                <TicketLayout
                                    passenger={passenger}
                                    segments={segments}
                                    agency={agency}
                                    options={{ hasHandBag, hasCheckedBag, showAgencyLogo }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
