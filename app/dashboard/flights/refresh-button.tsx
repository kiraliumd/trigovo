'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { startScraperJob, checkScraperJobStatus, saveScraperResult } from '@/app/actions/fetch-booking'
import { toast } from 'sonner'
import { Loading03Icon } from '@hugeicons/core-free-icons'

interface RefreshButtonProps {
    ticketId: string
    pnr: string
    lastName: string
    airline: string
}

export function RefreshButton({ ticketId, pnr, lastName, airline }: RefreshButtonProps) {
    const [loading, setLoading] = useState(false)

    const handleRefresh = async () => {
        setLoading(true)
        try {
            // 1. Iniciar Job
            const startResult = await startScraperJob(pnr, lastName, airline as any)

            let bookingData = startResult.initialResult;

            // 2. Polling
            if (startResult.jobId && !bookingData) {
                const pollInterval = 3000;
                const maxAttempts = 40;
                let attempts = 0;

                while (attempts < maxAttempts) {
                    attempts++;
                    await new Promise(r => setTimeout(r, pollInterval));
                    const job = await checkScraperJobStatus(startResult.jobId);

                    if (job.status === 'completed') {
                        bookingData = job.result;
                        break;
                    } else if (job.status === 'failed') {
                        throw new Error(job.error || 'Falha ao atualizar voo.');
                    }
                }
            }

            if (!bookingData) throw new Error('Timeout ao atualizar voo.');

            // 3. Salvar
            await saveScraperResult(pnr, airline as any, bookingData, lastName)
            toast.success('Voo atualizado com sucesso!')

        } catch (error: any) {
            console.error('Refresh error:', error)
            toast.error(error.message || 'Erro ao atualizar')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={loading}>
            <HugeiconsIcon icon={Refresh01Icon} className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh</span>
        </Button>
    )
}
