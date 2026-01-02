"use client"

import { useState, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
    UnfoldMoreIcon,
    Logout01Icon,
    SparklesIcon,
} from "@hugeicons/core-free-icons"

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useAuth } from "@/components/auth-provider"

export function NavUser({
    user,
}: {
    user: {
        name: string
        email: string
        avatar?: string
    }
}) {
    const [mounted, setMounted] = useState(false)
    const { isMobile } = useSidebar()
    const { signOut } = useAuth()

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton
                        size="lg"
                        className="gap-2 p-2 hover:!bg-[#fff7d6] data-[state=open]:bg-transparent"
                    >
                        <UserAvatar name={user.name} className="h-8 w-8 rounded-lg shrink-0" />
                        <div className="flex flex-col flex-1 text-left leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                            <span className="text-sm font-semibold leading-5 text-text-primary truncate">
                                {user.name}
                            </span>
                            <span className="text-xs font-normal leading-4 text-text-primary truncate">
                                {user.email}
                            </span>
                        </div>
                        <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto size-4 shrink-0 text-text-primary group-data-[collapsible=icon]:hidden" />
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        )
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="gap-2 p-2 hover:!bg-[#fff7d6] data-[state=open]:bg-transparent"
                        >
                            <UserAvatar name={user.name} className="h-8 w-8 rounded-lg shrink-0" />
                            <div className="flex flex-col flex-1 text-left leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                                <span className="text-sm font-semibold leading-5 text-text-primary truncate">
                                    {user.name}
                                </span>
                                <span className="text-xs font-normal leading-4 text-text-primary truncate">
                                    {user.email}
                                </span>
                            </div>
                            <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto size-4 shrink-0 text-text-primary group-data-[collapsible=icon]:hidden" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                        side={isMobile ? "bottom" : "right"}
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <UserAvatar name={user.name} className="h-8 w-8 rounded-lg" />
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">{user.name}</span>
                                    <span className="truncate text-xs">{user.email}</span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <HugeiconsIcon icon={SparklesIcon} className="mr-2 h-4 w-4" />
                                Upgrade to Pro
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => signOut()}>
                            <HugeiconsIcon icon={Logout01Icon} className="mr-2 h-4 w-4" />
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
