import { chromium } from 'playwright'

export type Airline = 'LATAM' | 'GOL' | 'AZUL'

export interface BookingDetails {
    flightNumber: string
    departureDate: string // ISO string
    origin: string
    destination: string
    itinerary_details?: any
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
]

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'https://scraper-voos-905122424233.southamerica-east1.run.app';

/**
 * Inicia um job de scraping no Cloud Run
 */
export async function submitScrapeJob(pnr: string, lastname: string, airline: Airline, origin?: string, agencyId?: string) {
    console.log(`📡 Enviando job para Cloud Run: ${airline} ${pnr}`);
    const submitUrl = SCRAPER_SERVICE_URL.endsWith('/scrape') ? SCRAPER_SERVICE_URL : `${SCRAPER_SERVICE_URL}/scrape`;

    const response = await fetch(submitUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.INTERNAL_API_KEY || ''
        },
        body: JSON.stringify({ pnr, lastname, airline, origin, agencyId }),
        cache: 'no-store'
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao enviar job (${response.status}): ${errorText}`);
    }

    return await response.json();
}

/**
 * Consulta o status de um job de scraping
 */
export async function getScraperJobStatus(jobId: string) {
    const baseUrl = SCRAPER_SERVICE_URL.replace(/\/scrape$/, '');
    const pollUrl = `${baseUrl}/scrape/${jobId}`;

    const response = await fetch(pollUrl, {
        cache: 'no-store',
        headers: {
            'x-api-key': process.env.INTERNAL_API_KEY || ''
        }
    });

    if (!response.ok) {
        throw new Error(`Erro ao consultar status (${response.status})`);
    }

    return await response.json();
}

export async function scrapeBooking(pnr: string, lastname: string, airline: Airline, origin?: string, agencyId?: string): Promise<BookingDetails> {
    // Se estivermos em produção ou forçado via ENV, usa o Cloud Run
    const useCloud = process.env.NODE_ENV === 'production' || process.env.USE_CLOUD_SCRAPER === 'true';

    if (useCloud) {
        console.log(`📡 Delegando scraping para Cloud Run (Async Queue): ${airline} ${pnr}`);
        try {
            // 1. Submit Job
            const submitResponse = await fetch(SCRAPER_SERVICE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.INTERNAL_API_KEY || ''
                },
                body: JSON.stringify({ pnr, lastname, airline, origin, agencyId }),
                cache: 'no-store'
            });

            if (!submitResponse.ok) {
                const errorText = await submitResponse.text();
                throw new Error(`Erro ao enviar job para Cloud Scraper (${submitResponse.status}): ${errorText}`);
            }

            const submitData = await submitResponse.json();
            const { jobId, status: initialStatus, result: initialResult } = submitData;

            console.log(`Job submetido. Status inicial: ${initialStatus}, JobID: ${jobId}`);

            // Caso 1: Sucesso Imediato (Cache Hit)
            if (initialStatus === 'completed' && initialResult) {
                console.log('⚡ Scraping retornado do cache imediatamente.');
                if (!initialResult.flightNumber && initialResult.pnr) {
                    console.warn("Aviso: flightNumber veio vazio do cache.");
                }
                return initialResult as BookingDetails;
            }

            // Caso 2: Job Enfileirado (Necessário Pooling)
            if (!jobId) {
                throw new Error('Servidor retornou status incompleto (sem jobId e sem resultado).');
            }

            // 2. Poll for Result
            let attempts = 0;
            const maxAttempts = 60; // 2 minutos (2s interval)
            const pollInterval = 2000;

            const pollUrl = SCRAPER_SERVICE_URL.replace('/scrape', `/scrape/${jobId}`);

            while (attempts < maxAttempts) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, pollInterval));

                const pollResponse = await fetch(pollUrl, {
                    cache: 'no-store',
                    headers: { 'x-api-key': process.env.INTERNAL_API_KEY || '' }
                });
                if (!pollResponse.ok) {
                    console.warn(`Erro ao consultar status do job ${jobId}: ${pollResponse.status}`);
                    continue;
                }

                const jobStatus = await pollResponse.json();
                console.log(`Job ${jobId} status: ${jobStatus.status} (Tentativa ${attempts}/${maxAttempts})`);

                if (jobStatus.status === 'completed') {
                    if (!jobStatus.result) throw new Error('Job completado mas sem resultado.');

                    // Normalização do resultado
                    const result = jobStatus.result;
                    // Garante que flightNumber venha preenchido
                    if (!result.flightNumber && result.pnr) {
                        // Fallback temporário se o scraper falhou no parse mas retornou o objeto
                        console.warn("Aviso: flightNumber veio vazio do scraper.");
                    }

                    return result as BookingDetails;
                }

                if (jobStatus.status === 'failed') {
                    throw new Error(`Job falhou no servidor: ${jobStatus.failedReason || 'Erro desconhecido'}`);
                }

                if (jobStatus.status === 'active' || jobStatus.status === 'waiting' || jobStatus.status === 'queued') {
                    continue; // Espera mais um pouco
                }
            }

            throw new Error('Timeout aguardando Cloud Scraper.');

        } catch (error) {
            console.error('Falha na comunicação com Scraper Service:', error);
            throw error;
        }
    }

    // --- MODO LOCAL (Mantém o código atual abaixo como fallback) ---
    console.log('🔧 Executando scraper localmente...');
    switch (airline) {
        case 'LATAM':
            return await scrapeLatam(pnr, lastname)
        case 'GOL':
            return await scrapeGol(pnr, lastname, origin)
        case 'AZUL':
            return await scrapeAzul(pnr, lastname, origin)
        default:
            throw new Error(`Airline ${airline} not supported`)
    }
}


// Wait, I need to be careful not to break existing code.
// The user asked to change the signature of scrapeBooking and scrapeGol.
// scrapeLatam and scrapeAzul also need to match if they are called by scrapeBooking.
// But scrapeBooking calls them.
// Let's update scrapeBooking first.

// Actually, I'll update scrapeBooking and scrapeGol. scrapeLatam and scrapeAzul can accept the extra arg or I can just pass it and ignore it if I update their signatures.
// Let's update all signatures to be safe.

// Chunk 1: Update scrapeBooking signature
// Chunk 2: Update scrapeGol signature and logic
// Chunk 3: Update scrapeLatam signature (optional, but good for consistency)
// Chunk 4: Update scrapeAzul signature (optional)

// Let's start with scrapeBooking and scrapeGol.

// ...
// Actually, I will just update scrapeBooking and scrapeGol for now as requested.
// "Altere a assinatura das funções scrapeBooking e scrapeGol para aceitar um novo parâmetro opcional: origin?: string."
// The user didn't explicitly ask to update scrapeLatam/Azul signatures, but scrapeBooking calls them.
// If I change scrapeBooking to take origin, I can pass it to scrapeGol.
// scrapeLatam(pnr, lastname) is fine.

// Let's update scrapeBooking.
// And scrapeGol.

// In scrapeGol:
// "Se origin for fornecido, tente preencher o input de origem (se existir na tela da GOL) ou use-o para validação."
// I need to find where the origin input is.
// "A GOL geralmente pede "Código" + "De onde você parte" OU "Sobrenome"."
// So I should look for an input for origin.

// Let's apply the changes.

// Helper para Proxy
function getProxyConfig() {
    if (process.env.PROXY_SERVER) {
        return {
            server: process.env.PROXY_SERVER,
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD
        }
    }
    return undefined
}

// Helper para lançar Browser com Proxy (Webshare)
async function launchBrowser() {
    const proxyConfig = {
        server: 'http://p.webshare.io:80',
        username: 'xtweuspr-country-BR', // Força IP Brasileiro
        password: '5so72ui3knmj'
    };

    console.log('🔌 Iniciando Browser com Proxy BR...');
    return await chromium.launch({
        headless: false, // Mantenha false para ver o robô trabalhando
        proxy: proxyConfig,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });
}

async function scrapeLatam(pnr: string, lastname: string): Promise<BookingDetails> {
    const browser = await launchBrowser();

    const context = await browser.newContext({
        userAgent: USER_AGENTS[0],
        viewport: { width: 1366, height: 768 },
        locale: 'pt-BR',
        ignoreHTTPSErrors: true
    })
    context.setDefaultNavigationTimeout(60000);;

    const page = await context.newPage();
    console.log(`Starting scrape for LATAM - PNR: ${pnr}`);

    try {
        // Navegação
        await page.goto('https://www.latamairlines.com/br/pt/minhas-viagens', { waitUntil: 'domcontentloaded' });

        // Limpeza de Cookies (Via JS, mais rápido)
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            btns.filter(b => b.innerText.match(/Aceitar|Cookie/i)).forEach(b => b.remove());
        });

        // Preenchimento
        console.log('Preenchendo dados...');
        const pnrInput = page.getByLabel(/Número de compra ou código/i).or(page.locator('#confirmationCode')).first();
        await pnrInput.waitFor({ state: 'visible', timeout: 30000 });
        await pnrInput.click();
        await pnrInput.pressSequentially(pnr, { delay: 150 });

        const lastnameInput = page.getByLabel(/Sobrenome do passageiro/i).first();
        await lastnameInput.click();
        await lastnameInput.pressSequentially(lastname, { delay: 100 });

        console.log('Buscando...');
        await page.getByRole('button', { name: 'Procurar' }).click();

        // Espera o resultado carregar (Estratégia Scroll)
        await page.waitForTimeout(5000);
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(2000);

        // Extração via Texto
        const fullText = await page.evaluate(() => document.body.innerText);
        const splitKeyword = 'Itinerário';
        const itineraryIndex = fullText.indexOf(splitKeyword);
        const cleanText = itineraryIndex !== -1 ? fullText.substring(itineraryIndex) : fullText;

        console.log('Texto extraído (Resumo):', cleanText.substring(0, 100));

        // Parsing (Regex)
        const monthMap: { [key: string]: string } = {
            'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04', 'maio': '05', 'junho': '06',
            'julho': '07', 'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
        };

        let departureDate = new Date().toISOString();
        const dateRegex = /(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i;
        const dateMatch = cleanText.match(dateRegex);
        if (dateMatch) {
            const day = dateMatch[1].padStart(2, '0');
            const month = monthMap[dateMatch[2].toLowerCase()] || '01';
            departureDate = `${dateMatch[3]}-${month}-${day}T12:00:00.000Z`;
        }

        const flightRegex = /(LA\s?\d{3,4})/i;
        const flightMatch = cleanText.match(flightRegex);
        const flightNumber = flightMatch ? flightMatch[1].replace(/\s/g, '') : 'PENDENTE';

        const iataRegex = /\(([A-Z]{3})\)/g;
        const matches = [...cleanText.matchAll(iataRegex)].map(m => m[1]).filter(c => c !== 'BRL' && c !== 'USD');

        let origin = matches[0] || '---';
        let destination = matches[matches.length - 1] || '---';

        return {
            flightNumber,
            departureDate,
            origin,
            destination,
            itinerary_details: {
                passengers: [{ name: 'Passageiro (Ver Site)', seat: '--' }],
                segments: [{ flightNumber, origin, destination, date: departureDate }]
            }
        };

    } catch (error) {
        console.error('Erro Scraper:', error instanceof Error ? error.message : error);
        if (browser) await page.screenshot({ path: 'error-latam.png' });
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

// --- SCRAPER GOL (Via Interceptação de JSON) ---
async function scrapeGol(pnr: string, lastname: string, origin?: string): Promise<BookingDetails> {
    const browser = await chromium.launch({
        headless: true, // Cloud Run exige headless true
        slowMo: 100, // Reduzido para não ser TÃO lento, mas ainda humano
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
    })

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        permissions: ['geolocation', 'notifications']
    })

    // --- SUPER STEALTH INJECTION ---
    await context.addInitScript(() => {
        // 1. Overwrite webdriver
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        // 2. Mock Chrome object
        // @ts-ignore
        window.chrome = {
            runtime: {},
            loadTimes: function () { },
            csi: function () { },
            app: {}
        };

        // 3. Mock Permissions
        const originalQuery = window.navigator.permissions.query;
        // @ts-ignore
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );

        // 4. Mock Plugins (Fake length)
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });

        // 5. Mock Languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['pt-BR', 'pt', 'en-US', 'en'],
        });
    });

    const page = await context.newPage()

    // Prevent crash if promise is not awaited due to error
    let apiPromise = page.waitForResponse(res =>
        res.status() === 200 &&
        (res.url().includes('retrieve') || res.url().includes('Booking')) &&
        res.headers()['content-type']?.includes('application/json'),
        { timeout: 60000 }
    ).catch(() => null);

    try {
        console.log(`Starting scrape for GOL - PNR: ${pnr}`)

        // 1. Navegação Blindada
        try {
            await page.goto('https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem', {
                waitUntil: 'commit',
                timeout: 60000
            });
        } catch (e) {
            console.error('Erro de conexão inicial GOL (Proxy?):', e)
            throw new Error('Falha na conexão inicial com o site da GOL. Verifique o Proxy.')
        }

        // Espera explícita por QUALQUER input
        try {
            console.log('Aguardando inputs carregarem...');
            await page.waitForSelector('input', { timeout: 45000 });
        } catch (e) {
            console.error('Site GOL não carregou inputs. Tentando screenshot...');
            await page.screenshot({ path: 'debug-gol-load-fail.png' });
            throw new Error('Site da GOL demorou demais para responder.');
        }

        // 2. COOKIE BANNER (Importante para parecer humano)
        try {
            const cookieBtn = page.getByRole('button', { name: /aceitar|concordo|fechar/i }).first();
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                console.log('Aceitando cookies...');
                await cookieBtn.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {
            // Ignora se não tiver banner
        }

        // Interação Humana (Mouse Jitter)
        await page.mouse.move(Math.random() * 500, Math.random() * 500);
        await page.waitForTimeout(500);

        console.log('Tentando localizar inputs visualmente...');

        // 3. Preenchimento dos Campos
        // PNR
        const pnrInput = page.getByPlaceholder(/código|reserva/i).or(page.locator('input[type="text"]').nth(0));
        await pnrInput.waitFor({ state: 'visible', timeout: 30000 });
        await pnrInput.click({ force: true });
        await page.waitForTimeout(300); // Delay humano
        await pnrInput.fill(pnr);

        // ORIGEM
        if (origin) {
            console.log(`Preenchendo Origem: ${origin}`);
            const originInput = page.getByPlaceholder(/onde|origem/i).or(page.locator('input[type="text"]').nth(1));

            await originInput.click({ force: true });
            await originInput.clear();
            await page.waitForTimeout(500);

            await originInput.pressSequentially(origin, { delay: 200 + Math.random() * 100 }); // Digitação variável
            console.log('Aguardando dropdown de sugestões...');
            await page.waitForTimeout(2500);

            // Estratégia Híbrida de Seleção
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

        // SOBRENOME
        console.log('Preenchendo sobrenome...');
        const lastnameInput = page.getByPlaceholder(/sobrenome/i).or(page.locator('input[type="text"]').nth(origin ? 2 : 1));
        await lastnameInput.click({ force: true });
        await page.waitForTimeout(300);
        await lastnameInput.fill(lastname);

        // 4. ESTRATÉGIA DE SUBMISSÃO (Mouse Real)
        console.log('Preparando para buscar...');

        const submitBtn = page.locator('button[type="submit"], button')
            .filter({ hasText: /encontrar|buscar|continuar|pesquisar/i })
            .first();

        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });

        // Loop de segurança: espera o atributo 'disabled' sumir
        await page.waitForFunction(
            el => el && !el.hasAttribute('disabled') && !el.classList.contains('disabled'),
            await submitBtn.elementHandle()
        ).catch(() => console.log('Aviso: Timeout esperando botão habilitar, tentando clicar mesmo assim...'));

        // Move o mouse suavemente até o botão
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

        // Fallback: Enter
        try {
            await page.waitForTimeout(3000);
            if (page.url().includes('encontrar-viagem')) {
                console.log('Tentativa 2: Pressionando ENTER...');
                const inputToFocus = page.getByPlaceholder(/sobrenome/i).or(page.locator('input[type="text"]').nth(origin ? 2 : 1));
                await inputToFocus.focus();
                await page.keyboard.press('Enter');
            }
        } catch (e) { }

        // 5. Captura do JSON
        console.log('Aguardando dados da GOL...');
        const response = await apiPromise;

        if (!response) {
            throw new Error('API da GOL não respondeu ou timeout ocorreu.');
        }

        const json = await response.json();
        const pnrData = json?.response?.pnrRetrieveResponse?.pnr || json?.pnrRetrieveResponse?.pnr;

        if (!pnrData) throw new Error('JSON inválido ou reserva não encontrada.');

        const trips = pnrData.itinerary.itineraryParts.map((part: any, index: number) => {
            const segments = part.segments.map((seg: any) => ({
                flightNumber: `${seg.flight.airlineCode}${seg.flight.flightNumber}`,
                origin: seg.origin,
                destination: seg.destination,
                date: seg.departure,
                departureDate: seg.departure,
                arrivalDate: seg.arrival,
                duration: `${Math.floor(seg.duration / 60)}h ${seg.duration % 60}m`,
                airline: 'GOL',
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

        const passengerList = pnrData.passengers.map((p: any) => ({
            name: `${p.passengerDetails.firstName} ${p.passengerDetails.lastName}`.toUpperCase(),
            seat: "Assento não marcado",
            group: "—",
            baggage: { hasPersonalItem: true, hasCarryOn: true, hasChecked: false }
        }));

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

// --- SCRAPER AZUL (Via Interceptação de JSON) ---
async function scrapeAzul(pnr: string, lastname: string, origin?: string): Promise<BookingDetails> {
    if (!origin) throw new Error('Para buscar na Azul, é obrigatório informar o Aeroporto de Origem (ex: VCP).');

    const browser = await chromium.launch({
        headless: true, // Cloud Run exige headless true
        slowMo: 200,
        proxy: getProxyConfig(),
        args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    })

    const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1366, height: 768 },
        locale: 'pt-BR'
    })

    // Stealth básico
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage()

    try {
        console.log(`Starting scrape for AZUL - PNR: ${pnr} / Origin: ${origin}`)

        // 1. Listener de API Inteligente (Content-Based)
        // Em vez de adivinhar a URL, vamos inspecionar o CONTEÚDO do JSON.
        // Procuramos por { data: { journeys: [...] } }
        const apiPromise = page.waitForResponse(async res => {
            // Filtros básicos de performance
            if (res.status() !== 200) return false;
            const contentType = res.headers()['content-type'] || '';
            if (!contentType.includes('application/json')) return false;

            const url = res.url();
            // Ignora assets, analytics, etc.
            if (!url.includes('voeazul.com.br') && !url.includes('azul')) return false;

            try {
                // Clone o response para não consumir o stream se não for o que queremos (embora no Playwright isso seja tratado)
                const body = await res.json();

                // Debug: Logar URLs de APIs encontradas
                // console.log(`[AZUL DEBUG] JSON em ${url}: keys=${Object.keys(body)}`);

                // Verificação da Estrutura
                if (body?.data?.journeys || body?.journeys) {
                    console.log(`[MATCH] JSON de reserva encontrado na URL: ${url}`);
                    return true;
                }
            } catch (e) {
                // Ignora erros de parse (ex: json inválido)
            }
            return false;
        }, { timeout: 60000 });

        // 2. Navegação Direta (URL Mágica)
        // A Azul permite deeplink com PNR e Origem
        const directUrl = `https://www.voeazul.com.br/br/pt/home/minhas-viagens?pnr=${pnr}&origin=${origin}`;

        try {
            await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.error('Erro de conexão inicial AZUL (Proxy?):', e)
            throw new Error('Falha na conexão inicial com o site da AZUL. Verifique o Proxy.')
        }

        // Se a URL direta não disparar a API imediatamente, espera um pouco ou tenta clicar em algo
        // Geralmente o site carrega sozinho com os parâmetros na URL

        // 3. Captura e Parse
        console.log('Aguardando JSON da Azul...');
        const response = await apiPromise;
        const json = await response.json();

        // Normaliza a estrutura (pode vir em json.data ou direto na raiz)
        const data = json.data?.journeys ? json.data : (json.journeys ? json : null);

        if (!data || !data.journeys) throw new Error('JSON da Azul inválido ou reserva não encontrada.');

        // --- PARSE DOS DADOS (Estrutura Azul) ---
        // A. Viagens (Trips - Ida/Volta)
        // Na Azul, cada item em 'journeys' é uma perna (Ida ou Volta)
        const trips = data.journeys.map((journey: any, index: number) => {
            const segments = journey.segments.map((seg: any) => {
                const info = seg.identifier;
                // Calcula duração em horas/min
                const start = new Date(info.std).getTime();
                const end = new Date(info.sta).getTime();
                const diffMins = Math.floor((end - start) / 60000);
                const hours = Math.floor(diffMins / 60);
                const minutes = diffMins % 60;

                return {
                    flightNumber: `${info.carrierCode}${info.flightNumber}`, // Ex: AD4017
                    origin: info.departureStation,
                    destination: info.arrivalStation,
                    date: info.std, // ISO (2025-11-27T15:35:00)
                    arrivalDate: info.sta,
                    duration: `${hours} h ${minutes} min`,
                    airline: 'AZUL'
                }
            });
            return {
                type: index === 0 ? 'IDA' : 'VOLTA',
                segments: segments
            };
        });

        // B. Passageiros e Assentos
        // A Azul linka passageiros aos segmentos via 'passengerKey'
        const passengerList = data.passengers.map((p: any) => {
            // Tenta achar o assento no primeiro segmento da primeira jornada
            // A estrutura é complexa: journey -> segments -> passengerSegment -> seat
            let seat = "Não marcado";
            try {
                const firstJourney = data.journeys[0];
                const firstSegment = firstJourney.segments[0];
                const paxSeg = firstSegment.passengerSegment.find((ps: any) => ps.passengerKey === p.passengerKey);
                if (paxSeg && paxSeg.seat && paxSeg.seat.designator) {
                    seat = paxSeg.seat.designator; // Ex: "19A"
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

        // C. Dados Flat para o Banco
        const firstLeg = trips[0].segments[0];
        const lastTrip = trips[trips.length - 1];
        const lastLeg = lastTrip.segments[lastTrip.segments.length - 1];

        return {
            flightNumber: firstLeg.flightNumber,
            departureDate: firstLeg.date,
            origin: firstLeg.origin,
            destination: lastLeg.destination, // Destino final da viagem
            itinerary_details: {
                trips: trips,
                passengers: passengerList
            }
        }

    } catch (error) {
        console.error(`Azul Scraper Error:`, error)
        await page.screenshot({ path: 'error-azul-debug.png' })
        throw new Error('Falha ao processar reserva Azul.')
    } finally {
        await browser.close()
    }
}
