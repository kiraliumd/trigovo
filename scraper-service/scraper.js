const { chromium: chromiumExtra } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Ativa plugin stealth
chromiumExtra.use(stealth());

// Arquivo de sessão (Cookies da GOL)
const SESSION_FILE = path.join(__dirname, 'session_gol.json');

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

async function launchBrowser(useProxy) {
    let proxyConfig = undefined;

    if (useProxy) {
        proxyConfig = getRandomProxy();
        console.log(`🔌 Conectando via Proxy (${proxyConfig.username})...`);
    } else {
        console.log(`⚡ Conectando via Direta (Sem Proxy)...`);
    }

    return await chromiumExtra.launch({
        headless: true, // Em produção, true
        proxy: proxyConfig,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-position=0,0'
        ]
    });
}

// ============================================================================
// 1. GOL (Mantido o código funcional com TAB)
// ============================================================================
async function scrapeGol({ pnr, lastname, origin, useProxy }) {
    if (typeof pnr !== 'string' || typeof lastname !== 'string') throw new Error('Dados inválidos.');

    let browser = null;
    try {
        console.log(`🖥️ [GOL] Iniciando: ${pnr} (${lastname}) | Proxy: ${useProxy ? 'SIM' : 'NÃO'}`);
        browser = await launchBrowser(useProxy);

        let contextOptions = {
            viewport: { width: 1920, height: 1080 },
            locale: 'pt-BR',
            timezoneId: 'America/Sao_Paulo',
            ignoreHTTPSErrors: true
        };

        if (fs.existsSync(SESSION_FILE)) {
            try {
                contextOptions.storageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
            } catch (e) { }
        }

        const context = await browser.newContext(contextOptions);
        await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
        const page = await context.newPage();

        const apiPromise = page.waitForResponse(
            res => res.status() === 200 &&
                (res.url().includes('retrieve') || res.url().includes('Booking')) &&
                res.headers()['content-type']?.includes('application/json'),
            { timeout: 70000 }
        ).catch(() => null);

        console.log('Navegando para GOL...');
        await page.goto('https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Preenchendo formulário...');
        const inputPnr = page.locator('#input-reservation-ticket');
        const inputOrigin = page.locator('#input-departure');
        const inputLastname = page.locator('#input-last-name');

        await inputPnr.click();
        await inputPnr.press('Control+A'); await inputPnr.press('Backspace');
        await inputPnr.pressSequentially(pnr, { delay: 200 });

        console.log(`✈️ Selecionando Origem: ${origin}...`);
        await inputOrigin.click();
        await inputOrigin.press('Control+A'); await inputOrigin.press('Backspace');
        await inputOrigin.pressSequentially(origin, { delay: 400 });

        await page.waitForTimeout(2500);

        // TAB TAB ENTER
        await page.keyboard.press('Tab'); await page.waitForTimeout(500);
        await page.keyboard.press('Tab'); await page.waitForTimeout(500);
        await page.keyboard.press('Enter'); await page.waitForTimeout(1000);

        await inputLastname.click();
        await inputLastname.press('Control+A'); await inputLastname.press('Backspace');
        await inputLastname.pressSequentially(lastname, { delay: 200 });

        console.log('Buscando...');
        const submitBtn = page.locator('#submit-button').filter({ hasText: /Continuar/i }).first();
        const closePopupBtn = page.locator('gds-modal button, .modal-close, button:has-text("Ok")').first();
        await page.waitForTimeout(1000);

        let success = false;
        let attempts = 0;

        while (attempts < 3 && !success) {
            attempts++;
            if (await submitBtn.isEnabled()) await submitBtn.click();
            else await inputLastname.press('Enter');

            try {
                const race = await Promise.race([
                    apiPromise.then(res => ({ type: 'api', data: res })),
                    page.waitForSelector('.pnr-info, text=Meu voo', { timeout: 10000 }).then(() => ({ type: 'visual_success' })),
                    page.waitForSelector('text=Houve um erro', { timeout: 5000 }).then(() => ({ type: 'popup' })),
                    page.waitForSelector('text=Access Denied', { timeout: 5000 }).then(() => ({ type: 'block' }))
                ]);

                if (race.type === 'visual_success' || (race.type === 'api' && race.data)) {
                    success = true;
                } else if (race.type === 'popup') {
                    if (await closePopupBtn.isVisible()) await closePopupBtn.click();
                    await page.waitForTimeout(1000);
                } else if (race.type === 'block') throw new Error('Bloqueio GOL.');
            } catch (e) { }
        }

        try {
            const storage = await context.storageState();
            fs.writeFileSync(SESSION_FILE, JSON.stringify(storage));
        } catch (e) { }

        const apiResponse = await apiPromise;
        if (apiResponse) {
            try {
                const json = await apiResponse.json();
                const pnrData = json?.response?.pnrRetrieveResponse?.pnr || json?.pnrRetrieveResponse?.pnr;
                if (pnrData) return parseGolJson(pnrData, pnr, origin, useProxy);
            } catch (e) { }
        }

        const bodyText = await page.locator('body').innerText();
        const match = bodyText.match(/G3\s?(\d{4})/);
        let flightNumber = match ? `G3${match[1]}` : '---';
        if (flightNumber === '---' && !apiResponse) throw new Error('Falha: Dados não encontrados.');

        return {
            flightNumber,
            departureDate: new Date().toISOString(),
            origin,
            status: 'Confirmado',
            pnr,
            method: useProxy ? 'Proxy' : 'Direct'
        };

    } catch (error) {
        console.error(`❌ Erro GOL: ${error.message}`);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

function parseGolJson(pnrData, pnr, origin, useProxy) {
    const segment = pnrData.itinerary.itineraryParts[0].segments[0];
    const passengers = pnrData.passengers.map(p => ({
        name: `${p.passengerDetails.firstName} ${p.passengerDetails.lastName}`.toUpperCase(),
        seat: "Check-in não feito",
        baggage: { hasChecked: false }
    }));
    return {
        flightNumber: `${segment.flight.airlineCode}${segment.flight.flightNumber}`,
        departureDate: segment.departure,
        origin: segment.origin,
        destination: segment.destination,
        status: 'Confirmado',
        pnr,
        method: useProxy ? 'Proxy' : 'Direct',
        itinerary_details: { trips: [], passengers }
    };
}

// ============================================================================
// 2. LATAM (CORRIGIDO PARA EVITAR ERRO NULL NO BANCO)
// ============================================================================
async function scrapeLatam({ pnr, lastname, useProxy }) {
    let browser = null;
    try {
        console.log(`✈️ [LATAM] Iniciando: ${pnr} | Proxy: ${useProxy ? 'SIM' : 'NÃO'}`);
        browser = await launchBrowser(useProxy);

        const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
        const page = await context.newPage();

        // Listener genérico
        const apiPromise = page.waitForResponse(
            res => res.status() === 200 &&
                (res.url().includes('boarding-pass') || res.url().includes('record') || res.url().includes('trip')) &&
                res.headers()['content-type']?.includes('json'),
            { timeout: 45000 }
        ).catch(() => null);

        const url = `https://www.latamairlines.com/br/pt/cartao-de-embarque?orderId=${pnr}&lastName=${lastname}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const response = await apiPromise;
        if (!response) throw new Error('API LATAM não retornou JSON.');

        const data = await response.json();
        console.log('📦 JSON LATAM recebido. Iniciando parse...');

        // --- PARSE SEGURO E DIRETO ---
        // Se itineraryParts estiver faltando, o JSON é inútil para nós
        if (!data.itineraryParts || data.itineraryParts.length === 0) {
            throw new Error('JSON inválido: itineraryParts vazio.');
        }

        // 1. EXTRAÇÃO DIRETA DO VOO PRINCIPAL (Prioridade Máxima)
        // Isso garante que flightNumber nunca seja null se o JSON for válido
        const firstSeg = data.itineraryParts[0].segments[0];
        const rawCode = firstSeg.airlineCode || 'LA';
        const rawNum = firstSeg.flightNumber || '';

        // Normalização: Evita duplicar código (Ex: LALA3197 -> LA3197)
        let finalFlightNumber = rawNum.replace(/\s/g, ''); // Remove espaços
        if (!finalFlightNumber.startsWith(rawCode)) {
            finalFlightNumber = `${rawCode}${finalFlightNumber}`;
        }

        // Validação final antes de retornar
        if (!finalFlightNumber || finalFlightNumber.length < 3) {
            throw new Error(`Número do voo inválido ou vazio: ${finalFlightNumber}`);
        }

        console.log(`✅ Voo extraído com sucesso: ${finalFlightNumber}`);

        // 2. Extração de Passageiros e Assentos
        const passengers = (data.passengers || []).map(p => {
            const bp = (data.boardingPasses || []).find(b => b.passengerId === p.passengerId);
            const bags = bp?.baggage || [];
            const hasChecked = bags.some(b => b.baggageAllowanceType === 'CHECKED_BAG' || b.maximumWeight > 12);

            return {
                name: `${p.firstName} ${p.lastName}`.toUpperCase(),
                seat: bp?.seatNumber || "Assento não marcado",
                baggage: {
                    hasPersonalItem: true,
                    hasCarryOn: true,
                    hasChecked: hasChecked
                }
            };
        });

        // 3. Montagem de Detalhes da Viagem (Trips)
        const trips = data.itineraryParts.map((part, index) => {
            const segments = part.segments.map(seg => ({
                flightNumber: `${seg.airlineCode}${seg.flightNumber}`.replace(/\s/g, ''),
                origin: seg.departure?.airport?.airportCode,
                destination: seg.arrival?.airport?.airportCode,
                date: seg.departure?.dateTime?.isoValue, // Normalize to 'date' for frontend
                departureDate: seg.departure?.dateTime?.isoValue, // Keep for backward compat
                arrivalDate: seg.arrival?.dateTime?.isoValue,
                duration: seg.duration || part.totalDuration
            }));
            return {
                type: index === 0 ? 'IDA' : 'VOLTA',
                segments: segments
            };
        });

        // Retorno Seguro
        return {
            flightNumber: finalFlightNumber, // Garantido não ser null
            departureDate: firstSeg.departure?.dateTime?.isoValue || new Date().toISOString(),
            origin: firstSeg.departure?.airport?.airportCode || '---',
            destination: firstSeg.arrival?.airport?.airportCode || '---',
            status: 'Confirmado',
            pnr: pnr,
            method: useProxy ? 'Proxy' : 'Direct',
            itinerary_details: {
                trips: trips,
                passengers: passengers
            }
        };

    } catch (error) {
        console.error(`❌ Erro LATAM: ${error.message}`);
        throw error;
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}

// ============================================================================
// 3. AZUL
// ============================================================================
async function scrapeAzul({ pnr, origin, useProxy }) {
    let browser = null;
    try {
        console.log(`✈️ [AZUL] Iniciando: ${pnr} | Proxy: ${useProxy ? 'SIM' : 'NÃO'}`);
        browser = await launchBrowser(useProxy);
        const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
        const page = await context.newPage();
        const apiPromise = page.waitForResponse(async res => {
            if (res.status() !== 200) return false;
            try { const body = await res.json(); return body.data?.journeys || body.journeys; } catch (e) { return false; }
        }, { timeout: 60000 }).catch(() => null);
        await page.goto(`https://www.voeazul.com.br/br/pt/home/minhas-viagens?pnr=${pnr}&origin=${origin}`, { waitUntil: 'domcontentloaded' });
        const response = await apiPromise;
        if (!response) throw new Error('API Azul não respondeu.');
        const json = await response.json();
        const data = json.data || json;
        return {
            flightNumber: `${data.journeys[0].segments[0].identifier.carrierCode}${data.journeys[0].segments[0].identifier.flightNumber}`,
            departureDate: data.journeys[0].segments[0].identifier.std,
            origin: data.journeys[0].segments[0].identifier.departureStation,
            status: 'Confirmado', pnr, itinerary_details: { trips: [], passengers: [] }
        };
    } finally { if (browser) await browser.close().catch(() => { }); }
}

module.exports = { scrapeGol, scrapeLatam, scrapeAzul };