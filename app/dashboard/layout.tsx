import { AppSidebar } from "@/components/app-sidebar"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Check if agency has completed onboarding
    const { data: agency } = await supabase
        .from('agencies')
        .select('cnpj, name')
        .eq('id', user.id)
        .single()

    if (!agency?.cnpj) {
        redirect('/onboarding')
    }

    const userData = {
        name: agency?.name || user.email || 'Usuário',
        email: user.email || '',
    }

    return (
        <SidebarProvider
            defaultOpen={true}
            style={{
                "--sidebar-width": "255px",
                "--sidebar-width-mobile": "20rem",
            } as React.CSSProperties}
        >
            <AppSidebar user={userData} />

            <SidebarInset className="overflow-hidden">
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-white sticky top-0 z-10">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink href="/dashboard">Plataforma</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>Visão Geral</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </header>

                <div className="flex flex-1 flex-col gap-4 p-6 pt-6 bg-gray-50/50 min-h-[calc(100vh-4rem)]">
                    <div className="w-full max-w-[1600px] mx-auto">
                        {children}
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
