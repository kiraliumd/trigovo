"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Download,
    ExternalLink,
    Filter,
    HelpCircle,
    Info,
    Search,
} from "lucide-react"
import { calculateCheckinStatus, getCheckinUrl } from "@/lib/business-rules"
import { DeleteFlightButton } from "./delete-flight-button"
import { EditPassengerNameDialog } from "@/components/dashboard/edit-passenger-name-dialog"

interface FlightsClientProps {
    initialTickets: any[]
}

export function FlightsClient({ initialTickets }: FlightsClientProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [airlineFilter, setAirlineFilter] = useState("ALL")
    const [statusTab, setStatusTab] = useState("todos")

    const filteredTickets = initialTickets?.filter((ticket) => {
        // Normalize data
        const flight = ticket.flights || ticket
        const flightDate = flight.departure_date || ticket.flight_date
        const status = flight.status || ticket.status
        const checkinStatus = calculateCheckinStatus(
            ticket.airline as any,
            new Date(flightDate)
        )

        // Search Term Filter (PNR or Passenger Name)
        const matchesSearch =
            ticket.pnr.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ticket.passenger_name.toLowerCase().includes(searchTerm.toLowerCase())

        // Airline Filter
        const matchesAirline =
            airlineFilter === "ALL" || ticket.airline === airlineFilter

        // Tab Filter
        let matchesTab = true
        if (statusTab === "checkin-aberto") {
            matchesTab = checkinStatus.isCheckinOpen && status !== "Completo"
        } else if (statusTab === "checkin-fechado") {
            matchesTab = !checkinStatus.isCheckinOpen && status !== "Completo"
        } else if (statusTab === "voados") {
            matchesTab = status === "Completo" || new Date(flightDate) < new Date()
        }

        return matchesSearch && matchesAirline && matchesTab
    })

    function getStatusVariant(status: string) {
        switch (status) {
            case "Cancelado":
                return "destructive"
            case "Atrasado":
                return "warning"
            case "Confirmado":
                return "success"
            case "Completo":
                return "neutral"
            default:
                return "secondary"
        }
    }

    return (
        <div className="space-y-6">
            <Tabs defaultValue="todos" value={statusTab} onValueChange={setStatusTab}>
                <TabsList>
                    <TabsTrigger value="todos">Todos</TabsTrigger>
                    <TabsTrigger value="checkin-aberto">Check-in Aberto</TabsTrigger>
                    <TabsTrigger value="checkin-fechado">Check-in Fechado</TabsTrigger>
                    <TabsTrigger value="voados">Voados</TabsTrigger>
                </TabsList>

                <Card className="mt-4">
                    <CardHeader>
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="relative flex-1 md:max-w-sm">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por passageiro ou localizador..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                <Select
                                    value={airlineFilter}
                                    onValueChange={setAirlineFilter}
                                >
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Companhia Aérea" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todas</SelectItem>
                                        <SelectItem value="LATAM">LATAM</SelectItem>
                                        <SelectItem value="GOL">GOL</SelectItem>
                                        <SelectItem value="AZUL">AZUL</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Empresa</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Localizador</TableHead>
                                    <TableHead>Sobrenome</TableHead>
                                    <TableHead>Check-in</TableHead>
                                    <TableHead>Rota</TableHead>
                                    <TableHead>Embarque</TableHead>
                                    <TableHead className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            Ações
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>
                                                            Download PDF, Link do Check-in e Excluir reserva
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTickets?.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={9}
                                            className="h-24 text-center text-muted-foreground"
                                        >
                                            Nenhum voo encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredTickets?.map((ticket) => {
                                        const flight = ticket.flights || ticket
                                        const flightDate =
                                            flight.departure_date || ticket.flight_date
                                        const origin = flight.origin || ticket.origin
                                        const destination = flight.destination || ticket.destination
                                        const status = flight.status || ticket.status

                                        const checkinStatus = calculateCheckinStatus(
                                            ticket.airline as any,
                                            new Date(flightDate)
                                        )
                                        const checkinUrl = getCheckinUrl(
                                            ticket.airline,
                                            ticket.pnr,
                                            ticket.passenger_lastname
                                        )

                                        return (
                                            <TableRow key={ticket.id}>
                                                <TableCell>{ticket.airline}</TableCell>
                                                <TableCell>
                                                    <Badge variant={getStatusVariant(status)}>
                                                        {status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="truncate max-w-[150px]"
                                                            title={ticket.passenger_name}
                                                        >
                                                            {ticket.passenger_name}
                                                        </span>
                                                        <EditPassengerNameDialog
                                                            ticketId={ticket.id}
                                                            currentName={ticket.passenger_name}
                                                        />
                                                    </div>
                                                </TableCell>
                                                <TableCell>{ticket.pnr}</TableCell>
                                                <TableCell>{ticket.passenger_lastname}</TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            checkinStatus.isCheckinOpen
                                                                ? "success"
                                                                : "secondary"
                                                        }
                                                    >
                                                        {checkinStatus.isCheckinOpen
                                                            ? "Aberto"
                                                            : "Fechado"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {origin} ✈️ {destination}
                                                </TableCell>
                                                <TableCell>
                                                    {format(new Date(flightDate), "dd/MM/yyyy")}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button size="icon" variant="ghost" asChild>
                                                            <Link href={`/dashboard/flights/${ticket.id}/boarding-pass`}>
                                                                <Download className="h-4 w-4" />
                                                            </Link>
                                                        </Button>
                                                        <Button size="icon" variant="ghost" asChild>
                                                            <a
                                                                href={checkinUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <ExternalLink className="h-4 w-4" />
                                                            </a>
                                                        </Button>
                                                        <DeleteFlightButton ticketId={ticket.id} />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </Tabs>
        </div>
    )
}
