"use client"

import * as React from "react"
import Image from "next/image"
import { HugeiconsIcon } from "@hugeicons/react"
import {
    DashboardSquare02Icon,
    AirplaneTakeOff01Icon,
    Settings01Icon,
    CustomerSupportIcon,
    ChatFeedback01Icon,
    UnfoldMoreIcon,
    Award04Icon,
} from "@hugeicons/core-free-icons"

import { NavUser } from "@/components/nav-user"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

// Menu da seção Plataforma
const plataformaItems = [
    {
        title: "Visão geral",
        url: "/dashboard",
        icon: DashboardSquare02Icon,
    },
    {
        title: "Gestão de bilhetes",
        url: "/dashboard/flights",
        icon: AirplaneTakeOff01Icon,
    },
]

// Menu da seção Suporte
const suporteItems = [
    {
        title: "Configurações",
        url: "/dashboard/settings",
        icon: Settings01Icon,
    },
    {
        title: "Ajuda e suporte",
        url: "#",
        icon: CustomerSupportIcon,
    },
    {
        title: "Sugestões",
        url: "#",
        icon: ChatFeedback01Icon,
    },
]

export function AppSidebar({ user }: { user: { name: string; email: string } }) {
    const pathname = usePathname()

    return (
        <Sidebar
            collapsible="icon"
            variant="sidebar"
            className="!bg-white border-r border-[#e6e9f2] [&_[data-sidebar=sidebar]]:!bg-white [&_[data-sidebar=sidebar]]:!text-[#191e3b]"
        >
            <SidebarHeader className="p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            size="lg"
                            asChild
                            className="gap-2 p-2 hover:!bg-brand-yellow-light data-[state=open]:!bg-transparent"
                        >
                            <Link href="/dashboard" className="gap-2">
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand-yellow shrink-0">
                                    <Image
                                        src="/Trigovo-icon-logo.svg"
                                        alt="Trigovo"
                                        width={19}
                                        height={16}
                                        className="w-[19px] h-4 object-contain"
                                        unoptimized
                                    />
                                </div>
                                <div className="flex flex-col gap-0 leading-none min-w-0 group-data-[collapsible=icon]:hidden">
                                    <span className="text-sm font-semibold leading-5 text-text-primary">Trigovo</span>
                                    <span className="text-xs font-normal leading-4 text-text-primary">Free</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent className="p-2">
                {/* Seção Plataforma */}
                <SidebarGroup className="p-0">
                    <SidebarGroupLabel className="!text-xs !font-normal !leading-4 !text-text-primary !opacity-70 px-2 py-0 h-8 flex items-center group-data-[collapsible=icon]:hidden">
                        Plataforma
                    </SidebarGroupLabel>
                    <SidebarMenu className="gap-1">
                        {plataformaItems.map((item) => {
                            const isActive = pathname === item.url
                            return (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={isActive}
                                        tooltip={item.title}
                                        className={cn(
                                            "h-8 gap-2 pl-2 pr-8 py-2 rounded-md",
                                            isActive
                                                ? "!bg-brand-yellow-light !text-text-primary font-medium hover:!bg-brand-yellow-light data-[active=true]:!bg-brand-yellow-light"
                                                : "!text-text-primary font-normal hover:!bg-brand-yellow-light"
                                        )}
                                    >
                                        <Link href={item.url} className="flex items-center gap-2">
                                            <HugeiconsIcon icon={item.icon} className="size-4 shrink-0 text-text-primary" />
                                            <span className={cn(
                                                "text-sm leading-5 group-data-[collapsible=icon]:hidden",
                                                isActive ? "font-medium" : "font-normal"
                                            )}>
                                                {item.title}
                                            </span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            )
                        })}
                    </SidebarMenu>
                </SidebarGroup>

                {/* Seção Suporte */}
                <SidebarGroup className="p-0">
                    <SidebarGroupLabel className="!text-xs !font-normal !leading-4 !text-text-primary !opacity-70 px-2 py-0 h-8 flex items-center group-data-[collapsible=icon]:hidden">
                        Suporte
                    </SidebarGroupLabel>
                    <SidebarMenu className="gap-1">
                        {suporteItems.map((item) => {
                            const isActive = pathname === item.url
                            return (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={isActive}
                                        tooltip={item.title}
                                        className={cn(
                                            "h-8 gap-2 pl-2 pr-8 py-2 rounded-md",
                                            isActive
                                                ? "!bg-brand-yellow-light !text-text-primary font-medium hover:!bg-brand-yellow-light data-[active=true]:!bg-brand-yellow-light"
                                                : "!text-text-primary font-normal hover:!bg-brand-yellow-light"
                                        )}
                                    >
                                        <Link href={item.url} className="flex items-center gap-2">
                                            <HugeiconsIcon icon={item.icon} className="size-4 shrink-0 text-text-primary" />
                                            <span className="text-sm font-normal leading-5 text-text-primary group-data-[collapsible=icon]:hidden">
                                                {item.title}
                                            </span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            )
                        })}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-2">
                <NavUser user={user} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
