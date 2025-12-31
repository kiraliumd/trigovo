import { NextResponse } from 'next/server';
import { validatePNR } from '@/lib/pnr-validator';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { pnr, lastName } = await request.json();

        if (!pnr || !lastName) {
            return NextResponse.json(
                { error: 'PNR and Last Name are required' },
                { status: 400 }
            );
        }

        const result = await validatePNR(pnr, lastName);

        if (!result.isValid) {
            return NextResponse.json(
                { error: result.error || 'Invalid PNR' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            flightNumber: result.flightNumber,
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
