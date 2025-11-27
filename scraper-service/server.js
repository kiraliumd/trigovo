const express = require('express');
const { chromium } = require('playwright');
const app = express();

app.use(express.json());

// --- CONFIGURAÇÃO DE PROXY (WEBSHARE BR) ---
const PROXY_SERVER = 'http://p.webshare.io:80';
const PROXY_PASSWORD = '5so72ui3knmj';
const TOTAL_PROXIES = 250;

function getRandomProxy() {
    const randomIndex = Math.floor(Math.random() * TOTAL_PROXIES) + 1;
    const username = `xtweuspr-BR-${randomIndex}`;
    console.log(`🎲 Sorteado Proxy: ${username}`);
    return {
        server: PROXY_SERVER,
        username: username,
        password: PROXY_PASSWORD
    };
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function launchBrowser(proxyConfig) {
    console.log(`🔌 Iniciando Browser com ${proxyConfig.username}...`);
    return await chromium.launch({
        headless: true, // Em produção/Cloud Run, sempre TRUE
        proxy: proxyConfig,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--start-maximized'
        ]
    });
}

// ============================================================================
// 1. SCRAPER LATAM (Via URL Direta)
// ============================================================================
async function scrapeLatam(pnr, lastname) {
    let browser = null;
    try {
        const currentProxy = getRandomProxy();
        browser = await launchBrowser(currentProxy);

        const context = await browser.newContext({
            viewport: { width: 1366, height: 768 },
            locale: 'pt-BR',
            ignoreHTTPSErrors: true,
            navigationTimeout: 60000
        });

        const page = await context.newPage();
        console.log(`🚀 [LATAM] Iniciando: ${pnr}`);

        const apiPromise = page.waitForResponse(
            res => res.status() === 200 &&
                (res.url().includes('boarding-pass') || res.url().includes('record') || res.url().includes('trip')) &&
                res.headers()['content-type']?.includes('application/json'),
            { timeout: 60000 }
        ).catch(() => null);

        // URL Direta do Cartão de Embarque (Pula login)
        const directUrl = `https://www.latamairlines.com/br/pt/cartao-de-embarque?orderId=${pnr}&lastName=${lastname}&tripPassengerId=ADT_1&segmentIndex=0&itineraryId=1`;

        console.log('Navegando via URL Direta...');
        await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Aguardando JSON...');
        const response = await apiPromise;

        if (!response) throw new Error('API LATAM não respondeu.');

        const data = await response.json();

        // --- PARSE LATAM ---
        const trips = data.itineraryParts.map((part, index) => {
            const segments = part.segments.map((seg) => ({
                flightNumber: `${seg.airlineCode}${seg.flightNumber}`,
                origin: seg.departure.airport.airportCode,
                destination: seg.arrival.airport.airportCode,
                date: seg.departure.dateTime.isoValue,
                arrivalDate: seg.arrival.dateTime.isoValue,
                duration: seg.deltaTime,
                airline: 'LATAM'
            }));
            return { type: index === 0 ? 'IDA' : 'VOLTA', segments };
        });

        const passengerList = data.passengers.map(p => {
            const bp = data.boardingPasses?.find(b => b.passengerId === p.passengerId);
            const bags = bp?.baggage || [];
            return {
                name: `${p.firstName} ${p.lastName}`.toUpperCase(),
                seat: bp?.seatNumber || null,
                group: bp?.group || null,
                baggage: {
                    hasPersonalItem: bags.some(b => b.baggageAllowanceType === 'PERSONAL_ITEM' && b.totalUnits > 0),
                    hasCarryOn: bags.some(b => b.baggageAllowanceType === 'CARRYON_SMALL' && b.totalUnits > 0),
                    hasChecked: bags.some(b => (b.baggageAllowanceType === 'CHECKED' || b.baggageAllowanceType === 'UP_TO_23KG') && b.totalUnits > 0)
                }
            };
        });

        const firstSeg = trips[0].segments[0];
        const lastTrip = trips[trips.length - 1];
        const lastSeg = lastTrip.segments[lastTrip.segments.length - 1];

        return {
            flightNumber: firstSeg.flightNumber,
            departureDate: firstSeg.date,
            origin: firstSeg.origin,
            destination: lastSeg.destination,
            itinerary_details: { trips, passengers: passengerList }
        };

    } catch (error) {
        console.error('Erro LATAM:', error.message);
        if (browser) await page.screenshot({ path: 'error-latam.png' }).catch(() => { });
        throw error;
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}

// ============================================================================
// 2. SCRAPER AZUL (Via URL Direta)
// ============================================================================
async function scrapeAzul(pnr, origin) {
    if (!origin) throw new Error('Origem é obrigatória para AZUL.');

    let browser = null;
    try {
        const currentProxy = getRandomProxy();
        browser = await launchBrowser(currentProxy);

        const context = await browser.newContext({
            viewport: { width: 1366, height: 768 },
            locale: 'pt-BR',
            ignoreHTTPSErrors: true,
            navigationTimeout: 60000
        });

        // Stealth para Azul
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        const page = await context.newPage();
        console.log(`🚀 [AZUL] Iniciando: ${pnr} / ${origin}`);

        const apiPromise = page.waitForResponse(async res => {
            if (res.status() !== 200) return false;
            const url = res.url();
            if ((url.includes('retrieve') || url.includes('booking') || url.includes('my-trips')) &&
                res.headers()['content-type']?.includes('application/json')) {
                try {
                    const body = await res.json();
                    if (body.data?.journeys || body.journeys) return true;
                } catch (e) { }
            }
            return false;
        }, { timeout: 60000 }).catch(() => null);

        const directUrl = `https://www.voeazul.com.br/br/pt/home/minhas-viagens?pnr=${pnr}&origin=${origin}`;
        console.log('Navegando via URL Azul...');
        await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Aguardando JSON...');
        const response = await apiPromise;
        if (!response) throw new Error('API Azul não respondeu.');

        const json = await response.json();
        const data = json.data || json;

        if (!data.journeys) throw new Error('JSON da Azul inválido.');

        // --- PARSE AZUL ---
        const trips = data.journeys.map((journey, index) => {
            const segments = journey.segments.map((seg) => {
                const info = seg.identifier;
                const start = new Date(info.std).getTime();
                const end = new Date(info.sta).getTime();
                const diffMins = Math.floor((end - start) / 60000);
                return {
                    flightNumber: `${info.carrierCode}${info.flightNumber}`,
                    origin: info.departureStation,
                    destination: info.arrivalStation,
                    date: info.std,
                    arrivalDate: info.sta,
                    duration: `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`,
                    airline: 'AZUL'
                };
            });
            return { type: index === 0 ? 'IDA' : 'VOLTA', segments };
        });

        const passengerList = data.passengers.map(p => {
            let seat = "Não marcado";
            try {
                for (const journey of data.journeys) {
                    for (const seg of journey.segments) {
                        const paxSeg = seg.passengerSegment.find(ps => ps.passengerKey === p.passengerKey);
                        if (paxSeg?.seat?.designator) {
                            seat = paxSeg.seat.designator;
                            break;
                        }
                    }
                    if (seat !== "Não marcado") break;
                }
            } catch (e) { }

            return {
                name: `${p.name.first} ${p.name.last}`.toUpperCase(),
                seat: seat,
                group: "—",
                baggage: {
                    hasPersonalItem: true,
                    hasCarryOn: true,
                    hasChecked: p.bagCount > 0
                }
            };
        });

        const firstSeg = trips[0].segments[0];
        const lastTrip = trips[trips.length - 1];
        const lastSeg = lastTrip.segments[lastTrip.segments.length - 1];

        return {
            flightNumber: firstSeg.flightNumber,
            departureDate: firstSeg.date,
            origin: firstSeg.origin,
            destination: lastSeg.destination,
            itinerary_details: { trips, passengers: passengerList }
        };

    } catch (error) {
        console.error('Erro AZUL:', error.message);
        if (browser) await page.screenshot({ path: 'error-azul.png' }).catch(() => { });
        throw error;
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}

// ============================================================================
// 3. SCRAPER GOL (Via URL Direta)
// ============================================================================
async function scrapeGol(pnr, lastname, origin) {
    if (!origin) throw new Error('Origem é obrigatória para GOL.');

    let browser = null;
    try {
        const currentProxy = getRandomProxy();
        browser = await launchBrowser(currentProxy);

        const context = await browser.newContext({
            viewport: { width: 1366, height: 768 },
            locale: 'pt-BR',
            ignoreHTTPSErrors: true,
            navigationTimeout: 60000
        });

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        const page = await context.newPage();
        console.log(`🚀 [GOL] Iniciando: ${pnr} / ${origin}`);

        const apiPromise = page.waitForResponse(res =>
            res.status() === 200 &&
            (res.url().includes('retrieve') || res.url().includes('Booking')) &&
            res.headers()['content-type']?.includes('application/json'),
            { timeout: 60000 }
        ).catch(() => null);

        const directUrl = `https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem?codigoReserva=${pnr}&origem=${origin}&sobrenome=${lastname}`;

        console.log('Navegando via URL GOL...');
        await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Aguardando JSON...');
        const response = await apiPromise;

        if (!response) throw new Error('API GOL não respondeu.');

        const json = await response.json();
        const pnrData = json?.response?.pnrRetrieveResponse?.pnr;

        if (!pnrData) throw new Error('JSON GOL inválido.');

        // --- PARSE GOL ---
        const trips = pnrData.itinerary.itineraryParts.map((part, index) => {
            const segments = part.segments.map((seg) => ({
                flightNumber: `${seg.flight.airlineCode}${seg.flight.flightNumber}`,
                origin: seg.origin,
                destination: seg.destination,
                date: seg.departure,
                arrivalDate: seg.arrival,
                duration: `${Math.floor(seg.duration / 60)}h ${seg.duration % 60}m`,
                airline: 'GOL'
            }));
            return { type: index === 0 ? 'IDA' : 'VOLTA', segments };
        });

        const passengerList = pnrData.passengers.map(p => ({
            name: `${p.passengerDetails.firstName} ${p.passengerDetails.lastName}`.toUpperCase(),
            seat: "Não marcado",
            group: "—",
            baggage: { hasPersonalItem: true, hasCarryOn: true, hasChecked: false }
        }));

        const firstSeg = trips[0].segments[0];
        const lastTrip = trips[trips.length - 1];
        const lastSeg = lastTrip.segments[lastTrip.segments.length - 1];

        return {
            flightNumber: firstSeg.flightNumber,
            departureDate: firstSeg.date,
            origin: firstSeg.origin,
            destination: lastSeg.destination,
            itinerary_details: { trips, passengers: passengerList }
        };

    } catch (error) {
        console.error('Erro GOL:', error.message);
        if (browser) await page.screenshot({ path: 'error-gol.png' }).catch(() => { });
        throw error;
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}

// --- CONTROLE DE RETRY ---
async function scrapeWithRetry(fn, ...args) {
    const retries = 3;
    for (let i = 1; i <= retries; i++) {
        try {
            console.log(`\n🔄 Tentativa ${i}/${retries}...`);
            return await fn(...args);
        } catch (error) {
            console.error(`❌ Falha na tentativa ${i}: ${error.message}`);
            if (i === retries) throw error;
        }
    }
}

// --- SERVER ---
app.post('/scrape', async (req, res) => {
    const { airline, pnr, lastname, origin } = req.body;
    try {
        let result;
        if (airline === 'LATAM') {
            result = await scrapeWithRetry(scrapeLatam, pnr, lastname);
        } else if (airline === 'AZUL') {
            result = await scrapeWithRetry(scrapeAzul, pnr, origin);
        } else if (airline === 'GOL') {
            result = await scrapeWithRetry(scrapeGol, pnr, lastname, origin);
        } else {
            throw new Error(`Cia ${airline} ainda não implementada.`);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 8080;
const server = app.listen(PORT, () => {
    console.log(`Scraper Service listening on port ${PORT}`);
});
server.setTimeout(300000);