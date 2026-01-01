"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
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
import { HugeiconsIcon } from '@hugeicons/react'
import {
    FileDownloadIcon,
    LinkSquare01Icon,
    FilterIcon,
    HelpCircleIcon,
    Airplane02Icon,
} from "@hugeicons/core-free-icons"
import { calculateCheckinStatus, getCheckinUrl } from "@/lib/business-rules"
import { DeleteFlightButton } from "./delete-flight-button"
import { EditPassengerNameDialog } from "@/components/dashboard/edit-passenger-name-dialog"
import { AirlineIcon } from "@/components/airline-icon"

interface FlightsClientProps {
    initialTickets: any[]
}

export function FlightsClient({ initialTickets }: FlightsClientProps) {
    const [mounted, setMounted] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [airlineFilter, setAirlineFilter] = useState("ALL")
    const [statusTab, setStatusTab] = useState("todos")

    useEffect(() => {
        setMounted(true)
    }, [])

    const filteredTickets = initialTickets?.filter((ticket) => {
        // Agora o ticket é consolidado por PNR
        const flightDate = ticket.flight_date
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

    function getStatusBadge(status: string) {
        switch (status) {
            case "Cancelado":
                return { bg: "#fdecec", text: "#9b2c2c", label: "Cancelado" }
            case "Atrasado":
                return { bg: "#fff2d6", text: "#8a6a1f", label: "Atrasado" }
            case "Confirmado":
                return { bg: "#eaf7f0", text: "#2e7d5b", label: "Confirmado" }
            case "Completo":
                return { bg: "#f1f3f9", text: "#4b5173", label: "Completo" }
            default:
                return { bg: "#f1f3f9", text: "#4b5173", label: status }
        }
    }

    if (!mounted) {
        return (
            <div className="space-y-4">
                <div className="bg-[#f1f3f9] h-9 p-[3px] rounded-lg flex gap-1">
                    <div className="h-[29px] px-2 py-1 rounded-md bg-white text-sm font-medium">Todos</div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <Tabs defaultValue="todos" value={statusTab} onValueChange={setStatusTab}>
                <TabsList className="bg-[#f1f3f9] h-9 p-[3px] rounded-lg">
                    <TabsTrigger
                        value="todos"
                        className="data-[state=active]:bg-white data-[state=active]:text-[#191e3b] data-[state=active]:shadow-none h-[29px] px-2 py-1 rounded-md text-sm font-medium"
                    >
                        Todos
                    </TabsTrigger>
                    <TabsTrigger
                        value="checkin-aberto"
                        className="data-[state=active]:bg-white data-[state=active]:text-[#191e3b] data-[state=active]:shadow-none h-[29px] px-2 py-1 rounded-md text-sm font-medium text-[#4b5173]"
                    >
                        Check-in Aberto
                    </TabsTrigger>
                    <TabsTrigger
                        value="checkin-fechado"
                        className="data-[state=active]:bg-white data-[state=active]:text-[#191e3b] data-[state=active]:shadow-none h-[29px] px-2 py-1 rounded-md text-sm font-medium text-[#4b5173]"
                    >
                        Check-in Fechado
                    </TabsTrigger>
                    <TabsTrigger
                        value="voados"
                        className="data-[state=active]:bg-white data-[state=active]:text-[#191e3b] data-[state=active]:shadow-none h-[29px] px-2 py-1 rounded-md text-sm font-medium text-[#4b5173]"
                    >
                        Voados
                    </TabsTrigger>
                </TabsList>

                <TabsContent value={statusTab} className="mt-4">
                    {/* Barra de busca e filtros */}
                    <div className="flex items-center justify-between pb-4">
                        <div className="relative flex-1 max-w-[384px]">
                            <Input
                                placeholder="Busca por passageiro ou localizador..."
                                className="h-9 px-3 py-1 rounded-md border-[#e6e9f2] bg-white text-sm leading-6 text-[#737373]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <HugeiconsIcon icon={FilterIcon} className="size-4 text-[#191e3b]" />
                            <Select
                                value={airlineFilter}
                                onValueChange={setAirlineFilter}
                            >
                                <SelectTrigger className="w-[153px] h-9 px-3 py-2 rounded-md border-[#e6e9f2] bg-white">
                                    <SelectValue placeholder="Todas" />
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

                    {/* Tabela */}
                    <div className="bg-white border border-[#e6e9f2] rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-b border-[#e6e9f2] hover:bg-transparent">
                                    <TableHead className="h-10 pl-2 pr-2 py-0">
                                        <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Empresa</span>
                                    </TableHead>
                                    <TableHead className="h-10 px-2 py-0">
                                        <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Status</span>
                                    </TableHead>
                                    <TableHead className="h-10 px-2 py-0">
                                        <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Nome</span>
                                    </TableHead>
                                    <TableHead className="h-10 px-2 py-0">
                                        <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Localizador</span>
                                    </TableHead>
                                    <TableHead className="h-10 px-2 py-0">
                                        <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Sobrenome</span>
                                    </TableHead>
                                    <TableHead className="h-10 px-2 py-0">
                                        <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Check-in</span>
                                    </TableHead>
                                    <TableHead className="h-10 px-2 py-0">
                                        <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Rota</span>
                                    </TableHead>
                                    <TableHead className="h-10 px-2 py-0">
                                        <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Embarque</span>
                                    </TableHead>
                                    <TableHead className="h-10 px-2 py-0 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <span className="text-sm font-medium leading-5 text-[#0a0a0a]">Ações</span>
                                            <HugeiconsIcon icon={HelpCircleIcon} className="size-3 text-[#191e3b]" />
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
                                        const flightDate = ticket.flight_date
                                        const origin = ticket.origin
                                        const destination = ticket.destination
                                        const status = ticket.status

                                        const checkinStatus = calculateCheckinStatus(
                                            ticket.airline as any,
                                            new Date(flightDate)
                                        )
                                        const checkinUrl = getCheckinUrl(
                                            ticket.airline,
                                            ticket.pnr,
                                            ticket.passenger_lastname
                                        )

                                        const statusBadge = getStatusBadge(status)
                                        const checkinBadge = checkinStatus.isCheckinOpen
                                            ? { bg: "#eaf7f0", text: "#2e7d5b", label: "Aberto" }
                                            : { bg: "#f1f3f9", text: "#4b5173", label: "Fechado" }

                                        return (
                                            <TableRow
                                                key={ticket.id}
                                                className="border-b border-[#e6e9f2] hover:bg-transparent"
                                            >
                                                <TableCell className="h-[49px] pl-2 pr-2 py-2">
                                                    <div className="flex gap-1.25 items-center">
                                                        <AirlineIcon airline={ticket.airline} />
                                                        <span className="text-sm font-normal leading-5 text-[#0a0a0a]">
                                                            {ticket.airline}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="h-[49px] px-2 py-2">
                                                    <div
                                                        className="inline-flex items-center justify-center h-[22px] px-2.5 py-0.5 rounded-lg"
                                                        style={{ backgroundColor: statusBadge.bg }}
                                                    >
                                                        <span
                                                            className="text-xs font-medium leading-4"
                                                            style={{ color: statusBadge.text }}
                                                        >
                                                            {statusBadge.label}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="h-[49px] px-2 py-2">
                                                    <div className="flex gap-2.5 items-center">
                                                        <span className="flex-1 text-sm font-normal leading-5 text-[#0a0a0a] truncate">
                                                            {ticket.passenger_name || "Passageiro (editar)"}
                                                        </span>
                                                        <EditPassengerNameDialog
                                                            ticketId={ticket.id}
                                                            currentName={ticket.passenger_name}
                                                        />
                                                    </div>
                                                </TableCell>
                                                <TableCell className="h-[49px] px-2 py-2">
                                                    <span className="text-sm font-normal leading-5 text-[#0a0a0a]">
                                                        {ticket.pnr}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="h-[49px] px-2 py-2">
                                                    <span className="text-sm font-normal leading-5 text-[#0a0a0a]">
                                                        {ticket.passenger_lastname?.toUpperCase() || ""}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="h-[49px] px-2 py-2">
                                                    <div
                                                        className="inline-flex items-center justify-center h-[22px] px-2.5 py-0.5 rounded-lg"
                                                        style={{ backgroundColor: checkinBadge.bg }}
                                                    >
                                                        <span
                                                            className="text-xs font-medium leading-4"
                                                            style={{ color: checkinBadge.text }}
                                                        >
                                                            {checkinBadge.label}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="h-[49px] px-2 py-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-normal leading-5 text-[#0a0a0a]">
                                                            {origin || "N/A"}
                                                        </span>
                                                        <HugeiconsIcon icon={Airplane02Icon} className="size-4 text-[#fddb32]" />
                                                        <span className="text-sm font-normal leading-5 text-[#0a0a0a]">
                                                            {destination || "N/A"}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="h-[49px] px-2 py-2">
                                                    <span className="text-sm font-normal leading-5 text-[#0a0a0a]">
                                                        {format(new Date(flightDate), "dd/MM/yyyy")}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="h-[49px] px-2 py-2">
                                                    <div className="flex justify-end gap-5">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-4 w-4 p-0 hover:bg-transparent"
                                                            asChild
                                                        >
                                                            <Link href={`/dashboard/flights/${ticket.id}/boarding-pass`}>
                                                                <HugeiconsIcon icon={FileDownloadIcon} className="size-4 text-[#2E7D5B]" />
                                                            </Link>
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-4 w-4 p-0 hover:bg-transparent"
                                                            asChild
                                                        >
                                                            <a
                                                                href={checkinUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <HugeiconsIcon icon={LinkSquare01Icon} className="size-4 text-[#546dfa]" />
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
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
