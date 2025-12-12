const express = require('express');
const { chromium, webkit, devices } = require('playwright'); // Adicionado webkit e devices
const stealth = require('puppeteer-extra-plugin-stealth');
const { chromium: chromiumExtra } = require('playwright-extra');

// Configura stealth para os robôs baseados em Chromium (Latam/Azul)
chromiumExtra.use(stealth());

const app = express();
app.use(express.json());

// --- CONFIGURAÇÃO DE PROXY ---
const PROXY_SERVER = 'http://p.webshare.io:80';
const PROXY_PASSWORD = '5so72ui3knmj';
const TOTAL_PROXIES = 250;

function getRandomProxy() {
    const randomIndex = Math.floor(Math.random() * TOTAL_PROXIES) + 1;
    return {
        server: PROXY_SERVER,
        username: `xtweuspr-BR-${randomIndex}`,
        password: PROXY_PASSWORD
    };
}

async function launchBrowser(type = 'chromium', proxyConfig) {
    console.log(`🔌 Iniciando ${type.toUpperCase()} com ${proxyConfig.username}...`);

    if (type === 'webkit') {
        // WebKit é o motor do Safari (iPhone)
        return await webkit.launch({
            headless: false, // Mude para false para ver a janelinha do "celular"
            proxy: proxyConfig
        });
    }

    return await chromiumExtra.launch({
        headless: true,
        proxy: proxyConfig,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu']
    });
}

// ============================================================================
// 1. SCRAPER GOL (MODO IPHONE 13 - WEBKIT)
// ============================================================================
async function scrapeGol(pnr, lastname, origin) {
    if (!origin) throw new Error('Origem é obrigatória para GOL.');

    let browser = null;
    try {
        const currentProxy = getRandomProxy();

        // USA WEBKIT (SAFARI) PARA SIMULAR IPHONE REAL
        browser = await launchBrowser('webkit', currentProxy);

        // Carrega predefinição de iPhone 13 Pro
        const iPhone = devices['iPhone 13 Pro'];

        const context = await browser.newContext({
            ...iPhone, // Aplica UserAgent, Viewport, Touch, PixelRatio de iPhone
            locale: 'pt-BR',
            timezoneId: 'America/Sao_Paulo',
            ignoreHTTPSErrors: true,
            navigationTimeout: 120000 // 2 minutos
        });

        // --- STEALTH MOBILE (Ajuste Fino) ---
        await context.addInitScript(() => {
            // Remove marca de robô
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

            // WebKit Mobile não tem plugins, mas garantimos que não vaze nada estranho
            Object.defineProperty(navigator, 'plugins', { get: () => [] });

            // Falsifica bateria (comum em celulares)
            if (navigator.getBattery) {
                navigator.getBattery = () => Promise.resolve({
                    charging: false,
                    chargingTime: Infinity,
                    dischargingTime: 18000,
                    level: 0.85 // 85% de bateria
                });
            }
        });

        const page = await context.newPage();
        console.log(`🚀 [GOL Mobile] Iniciando: ${pnr}`);

        // 1. Listener de API
        const apiPromise = page.waitForResponse(
            res => res.status() === 200 &&
                (res.url().includes('retrieve') || res.url().includes('Booking')) &&
                res.headers()['content-type']?.includes('application/json'),
            { timeout: 90000 }
        ).catch(() => null);

        // 2. Navegação (Versão Mobile da GOL)
        // A URL é a mesma, o site se adapta pelo User-Agent
        console.log('📱 Acessando GOL via iPhone...');
        await page.goto('https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // 3. Preenchimento (Layout Mobile)
        console.log('Preenchendo formulário...');

        // PNR
        const pnrInput = page.locator('#input-reservation-ticket, input[name="codigoReserva"]').first();
        await pnrInput.waitFor({ state: 'visible', timeout: 30000 });
        await pnrInput.tap(); // .tap() é o clique de toque no mobile
        await pnrInput.fill(pnr);

        // Origem
        const originInput = page.locator('#input-departure, input[name="origem"]').first();
        await originInput.tap();
        await originInput.pressSequentially(origin, { delay: 300 });
        await page.waitForTimeout(2000);
        // No mobile, o enter as vezes não funciona bem no dropdown, forçamos seleção visual
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        // Sobrenome
        const lastNameInput = page.locator('#input-last-name, input[name="sobrenome"]').first();
        await lastNameInput.tap();
        await lastNameInput.fill(lastname);
        await lastNameInput.blur(); // Fecha teclado virtual se existir

        // 4. Buscar
        console.log('Tocando em Continuar...');
        const submitBtn = page.locator('button, gds-button').filter({ hasText: /Continuar|Encontrar/i }).first();

        // Espera botão ficar ativo
        await page.waitForTimeout(1000);
        await submitBtn.tap();

        // 5. Captura
        console.log('Aguardando resposta...');

        const response = await Promise.race([
            apiPromise,
            page.waitForSelector('text=Houve um erro', { timeout: 15000 }).then(() => 'BLOCKED').catch(() => null),
            page.waitForTimeout(60000).then(() => 'TIMEOUT')
        ]);

        if (response === 'BLOCKED') {
            await page.screenshot({ path: 'debug-gol-mobile-blocked.png' });
            throw new Error('GOL Mobile bloqueou.');
        }

        if (response === 'TIMEOUT' || !response) throw new Error('Timeout: API GOL não respondeu.');

        const json = await response.json();
        const pnrData = json?.response?.pnrRetrieveResponse?.pnr;

        if (!pnrData) throw new Error('JSON GOL vazio.');

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
        console.error('Erro GOL Mobile:', error.message);
        if (page) await page.screenshot({ path: 'error-gol-mobile.png' }).catch(() => { });
        throw error;
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}

// ============================================================================
// 2. SCRAPER LATAM (Chromium Desktop - MANTIDO)
// ============================================================================
async function scrapeLatam(pnr, lastname) {
    let browser = null;
    try {
        const currentProxy = getRandomProxy();
        browser = await launchBrowser('chromium', currentProxy); // Usa função wrapper

        const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR', ignoreHTTPSErrors: true });
        const page = await context.newPage();

        const apiPromise = page.waitForResponse(res => res.status() === 200 && (res.url().includes('boarding-pass') || res.url().includes('record') || res.url().includes('trip')) && res.headers()['content-type']?.includes('json'), { timeout: 60000 }).catch(() => null);

        await page.goto(`https://www.latamairlines.com/br/pt/cartao-de-embarque?orderId=${pnr}&lastName=${lastname}&tripPassengerId=ADT_1&segmentIndex=0&itineraryId=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const response = await apiPromise;
        if (!response) throw new Error('API LATAM não respondeu.');
        const data = await response.json();

        // Parse LATAM Simplificado (Mantenha o seu original completo aqui)
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
            return { name: `${p.firstName} ${p.lastName}`.toUpperCase(), seat: bp?.seatNumber || null, group: bp?.group || null, baggage: { hasPersonalItem: true, hasCarryOn: true, hasChecked: false } };
        });

        return {
            flightNumber: trips[0].segments[0].flightNumber,
            departureDate: trips[0].segments[0].date,
            origin: trips[0].segments[0].origin,
            destination: trips[trips.length - 1].segments[trips[trips.length - 1].segments.length - 1].destination,
            itinerary_details: { trips, passengers: passengerList }
        };
    } finally { if (browser) await browser.close(); }
}

// ============================================================================
// 3. SCRAPER AZUL (Chromium Desktop - MANTIDO)
// ============================================================================
async function scrapeAzul(pnr, origin) {
    let browser = null;
    try {
        const currentProxy = getRandomProxy();
        browser = await launchBrowser('chromium', currentProxy);

        const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR', ignoreHTTPSErrors: true });
        await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
        const page = await context.newPage();

        const apiPromise = page.waitForResponse(async res => {
            if (res.status() !== 200) return false;
            try { const body = await res.json(); return body.data?.journeys || body.journeys; } catch (e) { return false; }
        }, { timeout: 60000 }).catch(() => null);

        await page.goto(`https://www.voeazul.com.br/br/pt/home/minhas-viagens?pnr=${pnr}&origin=${origin}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const response = await apiPromise;
        if (!response) throw new Error('API Azul não respondeu.');
        const json = await response.json();
        const data = json.data || json;

        // Parse Azul Simplificado
        const trips = data.journeys.map((journey, index) => {
            const segments = journey.segments.map((seg) => ({
                flightNumber: `${seg.identifier.carrierCode}${seg.identifier.flightNumber}`,
                origin: seg.identifier.departureStation,
                destination: seg.identifier.arrivalStation,
                date: seg.identifier.std,
                arrivalDate: seg.identifier.sta,
                duration: 'Voo Azul',
                airline: 'AZUL'
            }));
            return { type: index === 0 ? 'IDA' : 'VOLTA', segments };
        });
        const passengerList = data.passengers.map(p => ({ name: `${p.name.first} ${p.name.last}`.toUpperCase(), seat: "Não marcado", group: "—", baggage: { hasPersonalItem: true, hasCarryOn: true, hasChecked: p.bagCount > 0 } }));

        return {
            flightNumber: trips[0].segments[0].flightNumber,
            departureDate: trips[0].segments[0].date,
            origin: trips[0].segments[0].origin,
            destination: trips[trips.length - 1].segments[trips[trips.length - 1].segments.length - 1].destination,
            itinerary_details: { trips, passengers: passengerList }
        };
    } finally { if (browser) await browser.close(); }
}

// --- RETRY ---
async function scrapeWithRetry(fn, ...args) {
    for (let i = 1; i <= 3; i++) {
        try {
            console.log(`\n🔄 Tentativa ${i}/3...`);
            return await fn(...args);
        } catch (error) {
            console.error(`❌ Falha ${i}: ${error.message}`);
            if (i === 3) throw error;
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// --- SERVER ---
app.post('/scrape', async (req, res) => {
    const { airline, pnr, lastname, origin } = req.body;
    try {
        let result;
        if (airline === 'GOL') result = await scrapeWithRetry(scrapeGol, pnr, lastname, origin);
        else if (airline === 'LATAM') result = await scrapeWithRetry(scrapeLatam, pnr, lastname);
        else if (airline === 'AZUL') result = await scrapeWithRetry(scrapeAzul, pnr, origin);
        else throw new Error('Cia não suportada.');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 8080;
const server = app.listen(PORT, () => console.log(`Scraper Service running on ${PORT}`));
server.setTimeout(300000);