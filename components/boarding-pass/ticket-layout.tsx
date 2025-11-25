import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Plane, Luggage, Briefcase, Backpack } from "lucide-react"
import QRCode from "react-qr-code"

interface TicketLayoutProps {
    ticket: any
    flight: any
    agency: any
    options: {
        hasHandBag: boolean
        hasCheckedBag: boolean
        showAgencyLogo: boolean
    }
}

export function TicketLayout({
    ticket,
    flight,
    agency,
    options,
}: TicketLayoutProps) {
    const flightDate = new Date(flight.departure_date || ticket.flight_date)
    const arrivalDate = new Date(flightDate)
    arrivalDate.setHours(arrivalDate.getHours() + 4) // Mock duration if not available

    return (
        <div className="w-[800px] h-[300px] bg-white rounded-xl shadow-lg overflow-hidden flex border border-gray-200 print:shadow-none print:border-none">
            {/* Main Section */}
            <div className="flex-1 p-6 flex flex-col justify-between relative">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                        {/* Airline Logo Placeholder - In production use real logos */}
                        <div className="font-bold text-2xl text-blue-900 tracking-tighter">
                            {ticket.airline}
                        </div>
                    </div>
                    <div className="text-right">
                        <h1 className="text-sm font-bold uppercase tracking-widest text-gray-500">
                            Cartão de Embarque
                        </h1>
                        <p className="text-xs text-gray-400">Boarding Pass</p>
                    </div>
                </div>

                {/* Flight Details Grid */}
                <div className="grid grid-cols-4 gap-4 mt-4">
                    <div className="col-span-2">
                        <label className="text-[10px] uppercase text-gray-400 font-semibold">
                            Passageiro / Passenger
                        </label>
                        <p className="font-bold text-lg truncate">
                            {ticket.passenger_lastname}/{ticket.passenger_name}
                        </p>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-gray-400 font-semibold">
                            Voo / Flight
                        </label>
                        <p className="font-bold text-lg">{flight.flight_number}</p>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-gray-400 font-semibold">
                            Data / Date
                        </label>
                        <p className="font-bold text-lg">
                            {format(flightDate, "dd MMM", { locale: ptBR }).toUpperCase()}
                        </p>
                    </div>

                    <div className="col-span-2">
                        <div className="flex items-center gap-4">
                            <div>
                                <p className="text-3xl font-black text-blue-900">
                                    {flight.origin}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {format(flightDate, "HH:mm")}
                                </p>
                            </div>
                            <Plane className="h-6 w-6 text-gray-300 rotate-90" />
                            <div>
                                <p className="text-3xl font-black text-blue-900">
                                    {flight.destination}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {format(arrivalDate, "HH:mm")}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] uppercase text-gray-400 font-semibold">
                            Assento / Seat
                        </label>
                        <p className="font-bold text-2xl text-blue-900">
                            {ticket.seat || "ANY"}
                        </p>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-gray-400 font-semibold">
                            Grupo / Group
                        </label>
                        <p className="font-bold text-2xl text-blue-900">
                            {ticket.group || "C"}
                        </p>
                    </div>
                </div>

                {/* Footer / Baggage Info */}
                <div className="mt-auto pt-4 border-t border-dashed border-gray-200 flex items-center justify-between">
                    <div className="flex gap-4">
                        <div className="flex flex-col items-center gap-1 opacity-100">
                            <Backpack className="h-4 w-4 text-gray-600" />
                            <span className="text-[8px] uppercase font-bold text-gray-500">
                                Mochila
                            </span>
                        </div>
                        {options.hasHandBag && (
                            <div className="flex flex-col items-center gap-1">
                                <Briefcase className="h-4 w-4 text-gray-600" />
                                <span className="text-[8px] uppercase font-bold text-gray-500">
                                    Mala de Mão
                                </span>
                            </div>
                        )}
                        {options.hasCheckedBag && (
                            <div className="flex flex-col items-center gap-1">
                                <Luggage className="h-4 w-4 text-gray-600" />
                                <span className="text-[8px] uppercase font-bold text-gray-500">
                                    Despachada
                                </span>
                            </div>
                        )}
                    </div>

                    {options.showAgencyLogo && agency?.logo_url && (
                        <div className="flex items-center gap-2 opacity-50">
                            <span className="text-[8px] uppercase text-gray-400">
                                Emitido por
                            </span>
                            <img
                                src={agency.logo_url}
                                alt="Agency Logo"
                                className="h-6 object-contain grayscale"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Stub (Right Side) */}
            <div className="w-[240px] border-l-2 border-dashed border-gray-200 bg-gray-50 p-6 flex flex-col justify-between relative">
                {/* Cutout circles for realism */}
                <div className="absolute -left-3 top-0 bottom-0 flex flex-col justify-between py-2">
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className="w-6 h-6 rounded-full bg-gray-100 -ml-3" />
                    ))}
                </div>

                <div>
                    <div className="flex justify-between items-center mb-4">
                        <span className="font-bold text-lg text-blue-900">
                            {ticket.airline}
                        </span>
                        <span className="text-xs font-bold bg-gray-200 px-2 py-1 rounded">
                            {ticket.group || "C"}
                        </span>
                    </div>

                    <div className="space-y-2">
                        <div>
                            <label className="text-[9px] uppercase text-gray-400 font-semibold block">
                                Passageiro
                            </label>
                            <p className="font-bold text-sm truncate">
                                {ticket.passenger_lastname}/{ticket.passenger_name}
                            </p>
                        </div>
                        <div className="flex justify-between">
                            <div>
                                <label className="text-[9px] uppercase text-gray-400 font-semibold block">
                                    Origem
                                </label>
                                <p className="font-bold text-lg">{flight.origin}</p>
                            </div>
                            <div>
                                <label className="text-[9px] uppercase text-gray-400 font-semibold block">
                                    Destino
                                </label>
                                <p className="font-bold text-lg">{flight.destination}</p>
                            </div>
                        </div>
                        <div className="flex justify-between">
                            <div>
                                <label className="text-[9px] uppercase text-gray-400 font-semibold block">
                                    Voo
                                </label>
                                <p className="font-bold text-sm">{flight.flight_number}</p>
                            </div>
                            <div>
                                <label className="text-[9px] uppercase text-gray-400 font-semibold block">
                                    Assento
                                </label>
                                <p className="font-bold text-sm">{ticket.seat || "ANY"}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex justify-center">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                        <QRCode
                            value={`PNR:${ticket.pnr}|FLIGHT:${flight.flight_number}`}
                            size={80}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
