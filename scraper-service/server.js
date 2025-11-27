const express = require('express');
const { chromium } = require('playwright');
const app = express();
app.use(express.json());

// --- CONFIGURAÇÃO DE ROTAÇÃO DE PROXY (WEBSHARE BR) ---
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
        headless: false, // Visual para debug
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

// --- SCRAPER LATAM SIMPLIFICADO ---
async function scrapeLatam(pnr, lastname) {
    let browser = null;
    try {
        // 1. Setup (Mantenha a rotação de proxy que já existe)
        const currentProxy = getRandomProxy();
        browser = await launchBrowser(currentProxy);

        const context = await browser.newContext({
            viewport: { width: 1366, height: 768 },
            locale: 'pt-BR',
            ignoreHTTPSErrors: true
        });
        const page = await context.newPage();

        // 2. Listener de API (O Segredo dos Dados)
        const apiPromise = page.waitForResponse(
            res => res.status() === 200 && res.headers()['content-type']?.includes('json') &&
                (res.url().includes('boarding-pass') || res.url().includes('record') || res.url().includes('trip')),
            { timeout: 90000 }
        ).catch(() => null);

        console.log(`Navegando LATAM (${currentProxy.username})...`);
        await page.goto('https://www.latamairlines.com/br/pt/minhas-viagens', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 3. LIMPEZA DE TELA (JavaScript Puro)
        // Removemos o banner na força bruta para não atrapalhar o clique
        await page.evaluate(() => {
            document.querySelectorAll('button').forEach(b => {
                if (b.innerText.match(/Aceitar|Cookies/i)) b.remove();
            });
            // Remove overlays comuns
            document.querySelectorAll('[class*="cookie"], [id*="cookie"]').forEach(e => e.remove());
        });

        // 4. INTERAÇÃO (Direta e Forçada)
        console.log('Preenchendo dados...');

        // PNR
        const pnrInput = page.locator('#confirmationCode, input[name="bookingCode"]').first();
        await pnrInput.waitFor({ state: 'attached', timeout: 30000 }); // 'attached' é mais rápido que 'visible'
        await pnrInput.fill(pnr, { force: true }); // Ignora bloqueios visuais

        // Sobrenome
        const lastInput = page.locator('input[name="passengerLastName"], input[name="lastName"]').first();
        await lastInput.fill(lastname, { force: true });

        // Buscar
        console.log('Clicando buscar...');
        const btn = page.getByRole('button', { name: /Procurar|Buscar/i }).first();
        await btn.click({ force: true });

        // 5. RESULTADO
        console.log('Aguardando JSON...');
        const response = await apiPromise;
        if (!response) throw new Error('API não respondeu. Tentativa falhou.');

        const data = await response.json();

        // --- PARSE DA LATAM (Mantido) ---
        const itinerary = data.itineraryParts[0];
        const passengers = data.passengers;

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
            return { type: index === 0 ? 'IDA' : 'VOLTA', segments: segments };
        });

        const passengerList = passengers.map(p => {
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
        console.error('Erro Scraper:', error.message);
        // Screenshot para você ver o que houve
        if (browser) await page.screenshot({ path: 'debug-error-latam.png' });
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

// --- FUNÇÃO DE RETRY ---
async function scrapeWithRetry(fn, pnr, lastname, retries = 3) {
    for (let i = 1; i <= retries; i++) {
        try {
            console.log(`\n🚀 Tentativa ${i}/${retries}...`);
            return await fn(pnr, lastname);
        } catch (error) {
            console.error(`❌ Tentativa ${i} falhou. Tentando próximo proxy...`);
            if (i === retries) throw new Error(`Falha final após ${retries} tentativas: ${error.message}`);
        }
    }
}

// --- ROTA DA API ---
app.post('/scrape', async (req, res) => {
    const { airline, pnr, lastname } = req.body;
    try {
        let result;
        if (airline === 'LATAM') {
            result = await scrapeWithRetry(scrapeLatam, pnr, lastname);
        } else {
            throw new Error(`Cia ${airline} ainda não implementada.`);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
    console.log(`Scraper Service listening on port ${PORT}`);
});
server.setTimeout(300000);