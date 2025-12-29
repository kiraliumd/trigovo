const { chromium: chromiumExtra } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');

// Ativa plugin stealth
chromiumExtra.use(stealth());

// Arquivo de sessão (Cookies da GOL)
const SESSION_FILE = path.join(__dirname, 'session_gol.json');

// --- CONFIGURAÇÃO DE PROXY ---
const PROXY_SERVER = process.env.PROXY_SERVER;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;
const TOTAL_PROXIES = parseInt(process.env.TOTAL_PROXIES || '250');

// Perfis para parecer mais humano
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function jitter(baseMs, jitterRatio = 0.35) {
    const delta = baseMs * jitterRatio;
    return baseMs + (Math.random() * 2 - 1) * delta;
}

async function humanPause(baseMs = 400) {
    return new Promise(resolve => setTimeout(resolve, jitter(baseMs)));
}

function getRandomProxy() {
    if (!PROXY_SERVER || !PROXY_USERNAME || !PROXY_PASSWORD) return undefined;
    const randomIndex = randomInt(1, TOTAL_PROXIES);
    return {
        server: PROXY_SERVER,
        username: `${PROXY_USERNAME}-${randomIndex}`,
        password: PROXY_PASSWORD
    };
}

async function humanMouseMove(page) {
    const { width, height } = page.viewportSize();
    const targetX = randomInt(width * 0.2, width * 0.8);
    const targetY = randomInt(height * 0.2, height * 0.8);
    await page.mouse.move(targetX, targetY, { steps: randomInt(8, 15) });
    await humanPause(250);
}

async function humanClick(page, locator) {
    const box = await locator.boundingBox().catch(() => null);
    if (box) {
        const x = box.x + box.width * Math.random();
        const y = box.y + box.height * Math.random();
        await page.mouse.move(x, y, { steps: randomInt(5, 10) });
        await humanPause(120);
        await page.mouse.down();
        await humanPause(80);
        await page.mouse.up();
    } else {
        await locator.click({ delay: jitter(80) });
    }
}

async function humanType(locator, text, minDelay = 60, maxDelay = 140) {
    for (const ch of text) {
        await locator.type(ch, { delay: randomInt(minDelay, maxDelay) });
    }
}

async function warmup(page) {
    await humanMouseMove(page);
    await page.keyboard.down('Shift');
    await page.keyboard.up('Shift');
    await humanPause(300);
}

async function applyHumanHeaders(page) {
    await page.setExtraHTTPHeaders({
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'dnt': '1',
        'sec-ch-ua': '"Chromium";v="120", "Not(A:Brand";v="8", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    });
}

function buildContextOptions(base = {}) {
    const userAgent = USER_AGENTS[randomInt(0, USER_AGENTS.length - 1)];
    const viewport = { width: randomInt(1280, 1680), height: randomInt(720, 1050) };
    return {
        viewport,
        userAgent,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        colorScheme: 'light',
        permissions: ['geolocation'],
        geolocation: { latitude: -23.5505, longitude: -46.6333 },
        ...base
    };
}

async function applyAntiBotScripts(context) {
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        Object.defineProperty(Notification, 'permission', { get: () => 'default' });
        window.chrome = window.chrome || { runtime: {} };
        window.navigator.languages = ['pt-BR', 'pt', 'en-US'];
        window.navigator.plugins = [{ name: 'Chrome PDF Plugin' }];
    });
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
        headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
        proxy: proxyConfig,
        slowMo: randomInt(35, 95),
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
async function scrapeGol({ pnr, lastname, origin, useProxy, agencyId }) {
    if (typeof pnr !== 'string' || typeof lastname !== 'string') throw new Error('Dados inválidos.');

    let browser = null;
    try {
        console.log(`🖥️ [GOL] Iniciando: ${pnr} (${lastname}) | Proxy: ${useProxy ? 'SIM' : 'NÃO'}`);
        browser = await launchBrowser(useProxy);

        let contextOptions = buildContextOptions({ ignoreHTTPSErrors: true });

        // Tenta carregar sessão do Supabase (por Agência)
        if (agencyId && supabase) {
            console.log(`📥 Carregando sessão GOL do banco para a agência: ${agencyId}`);
            try {
                const { data: agency } = await supabase
                    .from('agencies')
                    .select('gol_session')
                    .eq('id', agencyId)
                    .single();

                if (agency?.gol_session) {
                    contextOptions.storageState = agency.gol_session;
                    console.log('✅ Sessão carregada do banco.');
                }
            } catch (e) {
                console.warn('⚠️ Falha ao ler sessão do banco:', e.message);
            }
        }

        const context = await browser.newContext(contextOptions);
        await applyAntiBotScripts(context);
        const page = await context.newPage();
        await applyHumanHeaders(page);
        await warmup(page);

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

        await humanClick(page, inputPnr);
        await inputPnr.press('Control+A'); await inputPnr.press('Backspace');
        await humanType(inputPnr, pnr);

        console.log(`✈️ Selecionando Origem: ${origin}...`);
        await humanClick(page, inputOrigin);
        await inputOrigin.press('Control+A'); await inputOrigin.press('Backspace');
        await humanType(inputOrigin, origin, 90, 180);

        await page.waitForTimeout(2500);

        // TAB TAB ENTER
        await page.keyboard.press('Tab'); await page.waitForTimeout(500);
        await page.keyboard.press('Tab'); await page.waitForTimeout(500);
        await page.keyboard.press('Enter'); await page.waitForTimeout(1000);

        await humanClick(page, inputLastname);
        await inputLastname.press('Control+A'); await inputLastname.press('Backspace');
        await humanType(inputLastname, lastname, 80, 160);

        console.log('Buscando...');
        const submitBtn = page.locator('#submit-button').filter({ hasText: /Continuar/i }).first();
        const closePopupBtn = page.locator('gds-modal button, .modal-close, button:has-text("Ok")').first();
        await page.waitForTimeout(1000);

        let success = false;
        let attempts = 0;

        while (attempts < 3 && !success) {
            attempts++;
            if (await submitBtn.isEnabled()) await humanClick(page, submitBtn);
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

        // Salva a sessão no Supabase após o processamento
        if (agencyId && supabase) {
            try {
                const storage = await context.storageState();
                const { error } = await supabase
                    .from('agencies')
                    .update({ gol_session: storage })
                    .eq('id', agencyId);

                if (error) throw error;
                console.log(`📤 Sessão GOL salva no banco para a agência: ${agencyId}`);
            } catch (e) {
                console.warn('⚠️ Falha ao salvar sessão no banco:', e.message);
            }
        }

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
    if (!pnrData || !pnrData.itinerary || !pnrData.itinerary.itineraryParts) {
        throw new Error('PNR data structure is invalid');
    }

    const trips = pnrData.itinerary.itineraryParts.map((part, index) => {
        const segments = part.segments.map(seg => ({
            flightNumber: `${seg.flight.airlineCode}${seg.flight.flightNumber}`,
            origin: seg.origin,
            destination: seg.destination,
            date: seg.departure,
            departureDate: seg.departure,
            arrivalDate: seg.arrival,
            duration: `${Math.floor(seg.duration / 60)}h ${seg.duration % 60}m`,
            status: seg.segmentStatusCode?.segmentStatus || 'CONFIRMED'
        }));
        return {
            type: index === 0 ? 'IDA' : 'VOLTA',
            segments: segments
        };
    });

    const firstLeg = trips[0].segments[0];
    const lastTrip = trips[trips.length - 1];
    const lastLeg = lastTrip.segments[lastTrip.segments.length - 1];

    const passengers = pnrData.passengers.map(p => {
        // Tenta encontrar o assento no primeiro segmento
        let seat = "Assento não marcado";
        // GOL JSON structure for seats is usually in segments or SSRs, 
        // but often not present in the main PNR object until check-in.

        return {
            name: `${p.passengerDetails.firstName} ${p.passengerDetails.lastName}`.toUpperCase(),
            seat: seat,
            baggage: {
                hasPersonalItem: true,
                hasCarryOn: true,
                hasChecked: false // GOL doesn't always show this clearly in this JSON
            }
        };
    });

    return {
        flightNumber: firstLeg.flightNumber,
        departureDate: firstLeg.departureDate,
        origin: firstLeg.origin,
        destination: lastLeg.destination,
        status: firstLeg.status === 'CONFIRMED' ? 'Confirmado' : 'Outro',
        pnr: pnr,
        method: useProxy ? 'Proxy' : 'Direct',
        itinerary_details: {
            trips: trips,
            passengers: passengers
        }
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

        const context = await browser.newContext(buildContextOptions());
        await applyAntiBotScripts(context);
        const page = await context.newPage();
        await applyHumanHeaders(page);
        await warmup(page);

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
        const context = await browser.newContext(buildContextOptions());
        await applyAntiBotScripts(context);
        const page = await context.newPage();
        await applyHumanHeaders(page);
        await warmup(page);
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