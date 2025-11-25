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

export async function scrapeBooking(pnr: string, lastname: string, airline: Airline): Promise<BookingDetails> {
    switch (airline) {
        case 'LATAM':
            return await scrapeLatam(pnr, lastname)
        case 'GOL':
            return await scrapeGol(pnr, lastname)
        case 'AZUL':
            return await scrapeAzul(pnr, lastname)
        default:
            throw new Error(`Airline ${airline} not supported`)
    }
}

async function scrapeLatam(pnr: string, lastname: string): Promise<BookingDetails> {
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1280, height: 720 }
    })
    const page = await context.newPage()

    try {
        console.log(`Starting scrape for LATAM - PNR: ${pnr}`)

        await page.goto('https://www.latamairlines.com/br/pt/minhas-viagens', { waitUntil: 'domcontentloaded' })

        // 1. Espera Inicial para animação
        await page.waitForTimeout(3000)

        // 2. Lógica de Cookies
        try {
            console.log('Tentando fechar cookies...')
            const cookieBtn = page.getByRole('button', { name: 'Aceite todos os cookies' })
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click()
            }
        } catch (error) {
            // Ignora erro de cookie
        }

        await page.waitForTimeout(1000)

        // 3. Login
        const pnrInput = page.getByLabel(/Número de compra ou código/i).or(page.locator('#confirmationCode'))
        await pnrInput.waitFor({ state: 'visible', timeout: 10000 });
        await pnrInput.click();
        await pnrInput.pressSequentially(pnr, { delay: 100 });

        const lastnameInput = page.getByLabel(/Sobrenome do passageiro/i)
        await lastnameInput.click()
        await lastnameInput.pressSequentially(lastname, { delay: 100 })

        console.log('Dados preenchidos. Clicando em Procurar...');
        await page.getByRole('button', { name: 'Procurar' }).click()

        await page.waitForTimeout(5000)
        await page.mouse.wheel(0, 1000) // Scroll para garantir que elementos carreguem
        await page.waitForTimeout(2000)

        // --- NOVA ESTRATÉGIA: CLIQUE E INTERCEPTAÇÃO NA NOVA ABA ---

        // 1. Localizar e Clicar no Botão (Estratégia Robusta)
        console.log('Procurando botão de Cartão de Embarque...')
        const boardingPassBtn = page.locator('button, a')
            .filter({ hasText: /Cartão de embarque|Boarding Pass/i })
            .first();

        await boardingPassBtn.waitFor({ state: 'visible', timeout: 15000 });
        console.log('Botão encontrado!');

        // 2. Preparar para a Nova Aba (Popup)
        const popupPromise = context.waitForEvent('page');

        // Clique forçado para garantir
        await boardingPassBtn.click({ force: true });

        // 3. Capturar a Nova Aba
        const newPage = await popupPromise;
        await newPage.waitForLoadState('domcontentloaded');
        console.log('Nova aba aberta. Título:', await newPage.title());

        // 4. Interceptar o JSON na NOVA ABA
        console.log('Aguardando JSON de detalhes na nova aba...');

        // O endpoint pode variar, vamos monitorar padrões comuns
        const response = await newPage.waitForResponse(
            (res) => {
                const url = res.url();
                const method = res.request().method();
                const status = res.status();
                const contentType = res.headers()['content-type'] || '';

                // Debug para ver o que está passando
                if (url.includes('boarding-pass') || url.includes('record') || url.includes('trip')) {
                    console.log(`Detectado: ${method} ${status} ${url} [${contentType}]`);
                }

                return (
                    status === 200 &&
                    method === 'GET' && // Ignora OPTIONS
                    contentType.includes('application/json') && // Garante que é JSON
                    (url.includes('boarding-pass') || url.includes('record') || url.includes('trip'))
                );
            },
            { timeout: 30000 }
        );

        await newPage.waitForTimeout(1000); // Respira 1s para garantir o download do corpo
        const data = await response.json();
        console.log('JSON lido com sucesso. Tamanho:', JSON.stringify(data).length);
        // console.log('JSON Preview:', JSON.stringify(data).substring(0, 200));

        // 5. Processamento dos Dados
        // Ajuste conforme a estrutura real retornada. O usuário sugeriu itineraryParts e passengers.
        const itineraryParts = data.itineraryParts || data.trip?.itineraryParts || [];
        const passengers = data.passengers || data.trip?.passengers || [];
        const boardingPasses = data.boardingPasses || [];

        if (!itineraryParts || itineraryParts.length === 0) {
            // Tenta fallback para estrutura 'record' se for diferente
            throw new Error('Estrutura de itinerário não encontrada no JSON capturado.');
        }

        // Pega os segmentos do primeiro itinerário (geralmente Ida)
        // Se houver volta, estaria em itineraryParts[1]
        // Vamos pegar TODOS os segmentos de TODAS as partes
        const allSegments: any[] = [];
        itineraryParts.forEach((part: any) => {
            if (part.segments) {
                allSegments.push(...part.segments);
            }
        });

        const flightSegments = allSegments.map((seg: any) => ({
            flightNumber: `${seg.airlineCode}${seg.flightNumber}`,
            origin: seg.departure?.airport?.airportCode || '---',
            destination: seg.arrival?.airport?.airportCode || '---',
            date: seg.departure?.dateTime?.isoValue,
            arrivalDate: seg.arrival?.dateTime?.isoValue,
            duration: seg.duration || seg.deltaTime // Tenta ambos
        }));

        // Cruzamento de Passageiros com Assentos
        const passengerList = passengers.map((p: any) => {
            const bp = boardingPasses.find((b: any) => b.passengerId === p.id || b.passengerId === p.passengerId);
            return {
                name: `${p.firstName} ${p.lastName}`.toUpperCase(),
                seat: bp?.seatNumber || "Não marcado",
                group: bp?.boardingGroup || "C"
            };
        });

        // 6. Fechar abas e Retornar
        await newPage.close();

        return {
            flightNumber: flightSegments[0].flightNumber,
            origin: flightSegments[0].origin,
            destination: flightSegments[flightSegments.length - 1].destination,
            departureDate: flightSegments[0].date, // Mapeado para departureDate na interface
            itinerary_details: {
                segments: flightSegments,
                passengers: passengerList,
                source: 'NEW_TAB_API'
            }
        };

    } catch (error) {
        console.error(`Scraping failed for LATAM ${pnr}:`, error)
        // Screenshot da página original
        await page.screenshot({ path: 'debug-fail-main.png', fullPage: true });

        // Tenta screenshot da nova aba se ela existir no contexto (difícil acessar aqui se newPage não foi definida no escopo superior)
        // Mas o erro geralmente ocorre antes ou durante.

        throw new Error(`Failed to fetch booking details: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
        await browser.close()
    }
}

async function scrapeGol(pnr: string, lastname: string): Promise<BookingDetails> {
    console.log('TODO: Implementar scraper da GOL');
    throw new Error('Integração GOL em desenvolvimento');
}

async function scrapeAzul(pnr: string, lastname: string): Promise<BookingDetails> {
    console.log('TODO: Implementar scraper da AZUL');
    throw new Error('Integração AZUL em desenvolvimento');
}
