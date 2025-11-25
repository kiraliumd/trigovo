import { subHours, isAfter, isBefore } from 'date-fns';

export type Airline = 'LATAM' | 'GOL' | 'AZUL';

interface CheckinStatusResult {
    isCheckinOpen: boolean;
    description: string;
}

export function calculateCheckinStatus(airline: Airline, flightDate: Date): CheckinStatusResult {
    const now = new Date();
    let hoursBefore = 48;

    if (airline === 'AZUL') {
        hoursBefore = 72;
    }

    // Check-in opens X hours before flight
    const checkinOpensAt = subHours(flightDate, hoursBefore);

    // Check-in usually closes 1 hour before flight (Standard rule, can be adjusted)
    const checkinClosesAt = subHours(flightDate, 1);

    if (isAfter(now, checkinOpensAt) && isBefore(now, checkinClosesAt)) {
        return {
            isCheckinOpen: true,
            description: `Check-in aberto! Iniciou em ${checkinOpensAt.toLocaleString('pt-BR')}.`,
        };
    } else if (isBefore(now, checkinOpensAt)) {
        return {
            isCheckinOpen: false,
            description: `Check-in ainda não disponível. Abre em ${checkinOpensAt.toLocaleString('pt-BR')} (${hoursBefore}h antes do voo).`,
        };
    } else {
        return {
            isCheckinOpen: false,
            description: `Check-in encerrado. Fechou em ${checkinClosesAt.toLocaleString('pt-BR')}.`,
        };
    }
}

export function getCheckinUrl(airline: string, pnr: string, lastName: string) {
    switch (airline) {
        case 'LATAM':
            return `https://www.latamairlines.com/br/pt/checkin?orderId=${pnr}&lastName=${lastName}`
        case 'GOL':
            return 'https://b2c.voegol.com.br/check-in/'
        case 'AZUL':
            return 'https://www.voeazul.com.br/check-in'
        default:
            return '#'
    }
}
