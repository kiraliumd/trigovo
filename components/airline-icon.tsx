"use client"

import Image from "next/image"
import { HugeiconsIcon } from '@hugeicons/react'
import { PlaneIcon } from '@hugeicons/core-free-icons'
import { cn } from "@/lib/utils"

interface AirlineIconProps {
    airline: string
    className?: string
}

export function AirlineIcon({ airline, className = "" }: AirlineIconProps) {
    const airlineUpper = airline?.toUpperCase() || ""

    // Mapeamento de SVGs e classes de fundo conforme Tailwind global
    const airlineConfig: Record<string, { bg: string; svg: string | null }> = {
        "LATAM": { bg: "bg-airline-latam", svg: "/Property 1=Latam.svg" },
        "GOL": { bg: "bg-airline-gol", svg: "/Property 1=Gol.svg" },
        "AZUL": { bg: "bg-airline-azul", svg: "/Property 1=Azul.svg" }
    }

    const config = airlineConfig[airlineUpper] || { bg: "bg-bg-secondary", svg: null }

    return (
        <div
            className={cn(
                "size-4 rounded-[2px] flex items-center justify-center shrink-0 overflow-hidden",
                config.bg,
                className
            )}
        >
            {config.svg ? (
                <Image
                    src={config.svg}
                    alt={airline}
                    width={16}
                    height={16}
                    className="size-4 object-contain"
                    unoptimized
                />
            ) : (
                <HugeiconsIcon icon={PlaneIcon} className="size-3 text-text-primary" />
            )}
        </div>
    )
}

