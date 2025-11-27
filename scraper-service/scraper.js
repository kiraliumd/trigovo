const { chromium } = require('playwright');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getProxyConfig() {
    if (process.env.PROXY_SERVER) {
        return {
            server: process.env.PROXY_SERVER,
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD
        };
    }
    return undefined;
}

async function scrapeBooking(pnr, lastname, airline, origin) {
    switch (airline) {
        case 'LATAM':
            return await scrapeLatam(pnr, lastname);
        case 'GOL':
            return await scrapeGol(pnr, lastname, origin);
        case 'AZUL':
            return await scrapeAzul(pnr, lastname, origin);
        default:
            throw new Error(`Airline ${airline} not supported`);
    }
}

async function scrapeLatam(pnr, lastname) {
    const browser = await chromium.launch({
        headless: true,
        proxy: getProxyConfig(),
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    try {
        console.log(`Starting scrape for LATAM - PNR: ${pnr}`);

        try {
            await page.goto('https://www.latamairlines.com/br/pt/minhas-viagens', { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.error('Erro de conexão inicial (Proxy?):', e);
            throw new Error('Falha na conexão inicial com o site da LATAM. Verifique o Proxy.');
        }

        await page.waitForTimeout(3000);

        try {
            const cookieBtn = page.getByRole('button', { name: 'Aceite todos os cookies' });
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click();
            }
        } catch (error) {
            // Ignora erro de cookie
        }

        await page.waitForTimeout(1000);

        const pnrInput = page.getByLabel(/Número de compra ou código/i).or(page.locator('#confirmationCode'));
        await pnrInput.waitFor({ state: 'visible', timeout: 10000 });
        await pnrInput.click();
        await pnrInput.pressSequentially(pnr, { delay: 100 });

        const lastnameInput = page.getByLabel(/Sobrenome do passageiro/i);
        await lastnameInput.click();
        await lastnameInput.pressSequentially(lastname, { delay: 100 });

        console.log('Dados preenchidos. Clicando em Procurar...');
        await page.getByRole('button', { name: 'Procurar' }).click();

        await page.waitForTimeout(5000);
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(2000);

        console.log('Procurando botão de Cartão de Embarque...');
        const boardingPassBtn = page.locator('button, a')
            .filter({ hasText: /Cartão de embarque|Boarding Pass/i })
            .first();

        await boardingPassBtn.waitFor({ state: 'visible', timeout: 15000 });
        console.log('Botão encontrado!');

        const popupPromise = context.waitForEvent('page');
        await boardingPassBtn.click({ force: true });

        const newPage = await popupPromise;
        await newPage.waitForLoadState('domcontentloaded');
        console.log('Nova aba aberta. Título:', await newPage.title());

        console.log('Aguardando JSON de detalhes na nova aba...');
        const response = await newPage.waitForResponse(
            (res) => {
                const url = res.url();
                const method = res.request().method();
                const status = res.status();
                const contentType = res.headers()['content-type'] || '';

                if (url.includes('boarding-pass') || url.includes('record') || url.includes('trip')) {
                    console.log(`Detectado: ${method} ${status} ${url} [${contentType}]`);
                }

                return (
                    status === 200 &&
                    method === 'GET' &&
                    contentType.includes('application/json') &&
                    (url.includes('boarding-pass') || url.includes('record') || url.includes('trip'))
                );
            },
            { timeout: 30000 }
        );

        await newPage.waitForTimeout(1000);
        const data = await response.json();
        console.log('JSON lido com sucesso. Tamanho:', JSON.stringify(data).length);

        const itineraryParts = data.itineraryParts || data.trip?.itineraryParts || [];
        const passengers = data.passengers || data.trip?.passengers || [];
        const boardingPasses = data.boardingPasses || [];

        if (!itineraryParts || itineraryParts.length === 0) {
            throw new Error('Estrutura de itinerário não encontrada no JSON capturado.');
        }

        const allSegments = [];
        itineraryParts.forEach((part) => {
            if (part.segments) {
                allSegments.push(...part.segments);
            }
        });

        const flightSegments = allSegments.map((seg) => ({
            flightNumber: `${seg.airlineCode}${seg.flightNumber}`,
            origin: seg.departure?.airport?.airportCode || '---',
            destination: seg.arrival?.airport?.airportCode || '---',
            date: seg.departure?.dateTime?.isoValue,
            arrivalDate: seg.arrival?.dateTime?.isoValue,
            duration: seg.duration || seg.deltaTime
        }));

        const passengerList = passengers.map((p) => {
            const bp = boardingPasses.find((b) => b.passengerId === p.id || b.passengerId === p.passengerId);
            return {
                name: `${p.firstName} ${p.lastName}`.toUpperCase(),
                seat: bp?.seatNumber || "Não marcado",
                group: bp?.boardingGroup || "C"
            };
        });

        await newPage.close();

        return {
            flightNumber: flightSegments[0].flightNumber,
            origin: flightSegments[0].origin,
            destination: flightSegments[flightSegments.length - 1].destination,
            departureDate: flightSegments[0].date,
            itinerary_details: {
                segments: flightSegments,
                passengers: passengerList,
                source: 'NEW_TAB_API'
            }
        };

    } catch (error) {
        console.error(`Scraping failed for LATAM ${pnr}:`, error);
        await page.screenshot({ path: 'debug-fail-main.png', fullPage: true });
        throw new Error(`Failed to fetch booking details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        await browser.close();
    }
}

async function scrapeGol(pnr, lastname, origin) {
    const browser = await chromium.launch({
        headless: true,
        slowMo: 100,
        proxy: getProxyConfig(),
        args: [
            '--disable-blink-features=AutomationControlled',
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        permissions: ['geolocation', 'notifications']
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = {
            runtime: {},
            loadTimes: function () { },
            csi: function () { },
            app: {}
        };
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        Object.defineProperty(navigator, 'languages', {
            get: () => ['pt-BR', 'pt', 'en-US', 'en'],
        });
    });

    const page = await context.newPage();

    let apiPromise = page.waitForResponse(res =>
        res.status() === 200 &&
        (res.url().includes('retrieve') || res.url().includes('Booking')) &&
        res.headers()['content-type']?.includes('application/json'),
        { timeout: 60000 }
    ).catch(() => null);

    try {
        console.log(`Starting scrape for GOL - PNR: ${pnr}`);

        try {
            await page.goto('https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem', {
                waitUntil: 'commit',
                timeout: 60000
            });
        } catch (e) {
            console.error('Erro de conexão inicial GOL (Proxy?):', e);
            throw new Error('Falha na conexão inicial com o site da GOL. Verifique o Proxy.');
        }

        try {
            console.log('Aguardando inputs carregarem...');
            await page.waitForSelector('input', { timeout: 45000 });
        } catch (e) {
            console.error('Site GOL não carregou inputs. Tentando screenshot...');
            await page.screenshot({ path: 'debug-gol-load-fail.png' });
            throw new Error('Site da GOL demorou demais para responder.');
        }

        try {
            const cookieBtn = page.getByRole('button', { name: /aceitar|concordo|fechar/i }).first();
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                console.log('Aceitando cookies...');
                await cookieBtn.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {
        }

        await page.mouse.move(Math.random() * 500, Math.random() * 500);
        await page.waitForTimeout(500);

        console.log('Tentando localizar inputs visualmente...');

        const pnrInput = page.getByPlaceholder(/código|reserva/i).or(page.locator('input[type="text"]').nth(0));
        await pnrInput.waitFor({ state: 'visible', timeout: 30000 });
        await pnrInput.click({ force: true });
        await page.waitForTimeout(300);
        await pnrInput.fill(pnr);

        if (origin) {
            console.log(`Preenchendo Origem: ${origin}`);
            const originInput = page.getByPlaceholder(/onde|origem/i).or(page.locator('input[type="text"]').nth(1));

            await originInput.click({ force: true });
            await originInput.clear();
            await page.waitForTimeout(500);

            await originInput.pressSequentially(origin, { delay: 200 + Math.random() * 100 });
            console.log('Aguardando dropdown de sugestões...');
            await page.waitForTimeout(2500);

            try {
                const suggestion = page.locator('li, div[role="option"], .m-list-item')
                    .filter({ hasText: origin })
                    .first();

                if (await suggestion.isVisible({ timeout: 3000 })) {
                    console.log('Sugestão encontrada visualmente. Clicando...');
                    await suggestion.click({ force: true });
                } else {
                    throw new Error('Sugestão visual não apareceu');
                }
            } catch (e) {
                console.log('Fallback: Tentando selecionar via Teclado (ArrowDown + Enter)...');
                await originInput.press('ArrowDown');
                await page.waitForTimeout(500);
                await originInput.press('Enter');
                await page.waitForTimeout(500);
                await originInput.press('Tab');
            }
            await page.waitForTimeout(1000);
        }

        console.log('Preenchendo sobrenome...');
        const lastnameInput = page.getByPlaceholder(/sobrenome/i).or(page.locator('input[type="text"]').nth(origin ? 2 : 1));
        await lastnameInput.click({ force: true });
        await page.waitForTimeout(300);
        await lastnameInput.fill(lastname);

        console.log('Preparando para buscar...');

        const submitBtn = page.locator('button[type="submit"], button')
            .filter({ hasText: /encontrar|buscar|continuar|pesquisar/i })
            .first();

        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });

        await page.waitForFunction(
            el => el && !el.hasAttribute('disabled') && !el.classList.contains('disabled'),
            await submitBtn.elementHandle()
        ).catch(() => console.log('Aviso: Timeout esperando botão habilitar, tentando clicar mesmo assim...'));

        const box = await submitBtn.boundingBox();
        if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
            await page.waitForTimeout(200);
            await page.mouse.down();
            await page.waitForTimeout(100);
            await page.mouse.up();
        } else {
            await submitBtn.click({ force: true });
        }

        try {
            await page.waitForTimeout(3000);
            if (page.url().includes('encontrar-viagem')) {
                console.log('Tentativa 2: Pressionando ENTER...');
                const inputToFocus = page.getByPlaceholder(/sobrenome/i).or(page.locator('input[type="text"]').nth(origin ? 2 : 1));
                await inputToFocus.focus();
                await page.keyboard.press('Enter');
            }
        } catch (e) { }

        console.log('Aguardando dados da GOL...');
        const response = await apiPromise;

        if (!response) {
            throw new Error('API da GOL não respondeu ou timeout ocorreu.');
        }

        const json = await response.json();

        const pnrData = json?.response?.pnrRetrieveResponse?.pnr;
        if (!pnrData) throw new Error('JSON inválido ou reserva não encontrada.');

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

        const passengerList = pnrData.passengers.map((p) => ({
            name: `${p.passengerDetails.firstName} ${p.passengerDetails.lastName}`.toUpperCase(),
            seat: "Não marcado",
            group: "—",
            baggage: { hasPersonalItem: true, hasCarryOn: true, hasChecked: false }
        }));

        const firstLeg = trips[0].segments[0];
        const lastLeg = trips[0].segments[trips[0].segments.length - 1];

        return {
            flightNumber: firstLeg.flightNumber,
            departureDate: firstLeg.date,
            origin: firstLeg.origin,
            destination: lastLeg.destination,
            itinerary_details: { trips, passengers: passengerList }
        };

    } catch (error) {
        console.error(`GOL Scraper Error:`, error);
        await page.screenshot({ path: 'error-gol-debug.png' });
        throw error;
    } finally {
        await browser.close();
    }
}

async function scrapeAzul(pnr, lastname, origin) {
    if (!origin) throw new Error('Para buscar na Azul, é obrigatório informar o Aeroporto de Origem (ex: VCP).');

    const browser = await chromium.launch({
        headless: true,
        slowMo: 200,
        proxy: getProxyConfig(),
        args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });

    const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1366, height: 768 },
        locale: 'pt-BR'
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    try {
        console.log(`Starting scrape for AZUL - PNR: ${pnr} / Origin: ${origin}`);

        const apiPromise = page.waitForResponse(async res => {
            if (res.status() !== 200) return false;
            const contentType = res.headers()['content-type'] || '';
            if (!contentType.includes('application/json')) return false;

            const url = res.url();
            if (!url.includes('voeazul.com.br') && !url.includes('azul')) return false;

            try {
                const body = await res.json();
                if (body?.data?.journeys || body?.journeys) {
                    console.log(`[MATCH] JSON de reserva encontrado na URL: ${url}`);
                    return true;
                }
            } catch (e) {
            }
            return false;
        }, { timeout: 60000 });

        const directUrl = `https://www.voeazul.com.br/br/pt/home/minhas-viagens?pnr=${pnr}&origin=${origin}`;

        try {
            await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.error('Erro de conexão inicial AZUL (Proxy?):', e);
            throw new Error('Falha na conexão inicial com o site da AZUL. Verifique o Proxy.');
        }

        console.log('Aguardando JSON da Azul...');
        const response = await apiPromise;
        const json = await response.json();

        const data = json.data?.journeys ? json.data : (json.journeys ? json : null);

        if (!data || !data.journeys) throw new Error('JSON da Azul inválido ou reserva não encontrada.');

        const trips = data.journeys.map((journey, index) => {
            const segments = journey.segments.map((seg) => {
                const info = seg.identifier;
                const start = new Date(info.std).getTime();
                const end = new Date(info.sta).getTime();
                const diffMins = Math.floor((end - start) / 60000);
                const hours = Math.floor(diffMins / 60);
                const minutes = diffMins % 60;

                return {
                    flightNumber: `${info.carrierCode}${info.flightNumber}`,
                    origin: info.departureStation,
                    destination: info.arrivalStation,
                    date: info.std,
                    arrivalDate: info.sta,
                    duration: `${hours} h ${minutes} min`,
                    airline: 'AZUL'
                };
            });
            return {
                type: index === 0 ? 'IDA' : 'VOLTA',
                segments: segments
            };
        });

        const passengerList = data.passengers.map((p) => {
            let seat = "Não marcado";
            try {
                const firstJourney = data.journeys[0];
                const firstSegment = firstJourney.segments[0];
                const paxSeg = firstSegment.passengerSegment.find((ps) => ps.passengerKey === p.passengerKey);
                if (paxSeg && paxSeg.seat && paxSeg.seat.designator) {
                    seat = paxSeg.seat.designator;
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

        const firstLeg = trips[0].segments[0];
        const lastTrip = trips[trips.length - 1];
        const lastLeg = lastTrip.segments[lastTrip.segments.length - 1];

        return {
            flightNumber: firstLeg.flightNumber,
            departureDate: firstLeg.date,
            origin: firstLeg.origin,
            destination: lastLeg.destination,
            itinerary_details: {
                trips: trips,
                passengers: passengerList
            }
        };

    } catch (error) {
        console.error(`Azul Scraper Error:`, error);
        await page.screenshot({ path: 'error-azul-debug.png' });
        throw new Error('Falha ao processar reserva Azul.');
    } finally {
        await browser.close();
    }
}

module.exports = { scrapeBooking };
