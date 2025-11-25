import { chromium } from 'playwright'

export type Airline = 'LATAM' | 'GOL' | 'AZUL'

export interface BookingDetails {
    flightNumber: string
    departureDate: string // ISO string
    origin: string
    destination: string
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

        // 2. Lógica de 3 Camadas para Cookies
        try {
            console.log('Tentando fechar cookies...')
            const cookieBtn = page.getByRole('button', { name: 'Aceite todos os cookies' })
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click()
                console.log('Botão de cookies clicado.')
            }
        } catch (error) {
            console.log('Clique falhou, tentando remover o banner via JS...')
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'))
                const targetBtn = buttons.find(b => b.innerText.includes('Aceite todos os cookies'))
                if (targetBtn) {
                    targetBtn.closest('div[role="dialog"]')?.remove() || targetBtn.closest('div')?.remove()
                }
            })
        }

        await page.waitForTimeout(1000)

        // --- DEBUG BLOCK START ---
        console.log('📸 Tirando screenshot de diagnóstico...');
        console.log('Page Title:', await page.title()); // Quero saber o título da página
        // Salva na raiz do projeto para fácil acesso
        await page.screenshot({ path: 'debug-latam-state.png', fullPage: true });

        // Salva o HTML também para vermos se é bloqueio de bot
        const htmlContent = await page.content();
        if (htmlContent.includes('Access Denied') || htmlContent.includes('Access to this page has been denied')) {
            console.error('⛔ BLOQUEIO DETECTADO: A Latam bloqueou o IP/Bot.');
            throw new Error('Bot Blocked by WAF');
        }
        // --- DEBUG BLOCK END ---

        // 1. Seleção Simplificada (para teste)
        const pnrInput = page.getByLabel(/Número de compra ou código/i).or(page.locator('#confirmationCode'))

        // 2. Garantir Visibilidade
        console.log('Aguardando input do PNR ficar visível...');
        await pnrInput.waitFor({ state: 'visible', timeout: 10000 });

        // 3. Interação
        await pnrInput.click();
        await pnrInput.pressSequentially(pnr, { delay: 150 });

        await page.waitForTimeout(500)

        const lastnameInput = page.getByLabel(/Sobrenome do passageiro/i)
        await lastnameInput.click()
        await lastnameInput.pressSequentially(lastname, { delay: 100 })

        await page.waitForTimeout(500)

        await page.getByRole('button', { name: 'Procurar' }).click()

        await page.waitForTimeout(5000)

        // Scroll Obrigatório
        await page.mouse.wheel(0, 1000)
        await page.waitForTimeout(2000)

        // 4. Anti-Noise Text Parsing Strategy
        const fullText = await page.evaluate(() => document.body.innerText);

        // CORTE DE SEGURANÇA: Jogar fora tudo antes de "Itinerário"
        const splitKeyword = 'Itinerário';
        const itineraryIndex = fullText.indexOf(splitKeyword);

        if (itineraryIndex === -1) {
            console.warn('Palavra-chave "Itinerário" não encontrada. Tentando extração bruta...');
        }

        // Trabalhamos apenas daqui para baixo se encontrou, senão usa tudo (fallback)
        const cleanText = itineraryIndex !== -1 ? fullText.substring(itineraryIndex) : fullText;
        console.log('DEBUG TEXTO LIMPO:', cleanText.substring(0, 300));

        // Mapeamento de meses PT-BR
        const monthMap: { [key: string]: string } = {
            'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
            'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
            'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
        };

        // Extração da DATA
        let departureDate = null;
        const dateRegex = /(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i;
        const dateMatch = cleanText.match(dateRegex);

        if (dateMatch) {
            const day = dateMatch[1].padStart(2, '0');
            const monthName = dateMatch[2].toLowerCase();
            const year = dateMatch[3];
            const month = monthMap[monthName];

            if (month) {
                departureDate = `${year}-${month}-${day}T12:00:00.000Z`; // Noon to be safe
            }
        }

        // Fallback se falhar a data: usar data de amanhã para não quebrar o banco
        if (!departureDate) {
            console.error('Data não encontrada no padrão esperado.');
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            departureDate = tomorrow.toISOString();
        }

        // Extração do NÚMERO DO VOO
        const flightRegex = /(LA\s?\d{3,4})/i;
        const flightMatch = cleanText.match(flightRegex);
        const flightNumber = flightMatch ? flightMatch[1].replace(/\s/g, '') : 'PENDENTE';

        // Extração da ROTA (Origem e Destino)
        // Buscar APENAS códigos entre parênteses (XXX)
        const iataRegex = /\(([A-Z]{3})\)/g;
        const matches = [...cleanText.matchAll(iataRegex)];
        const iataCodes = matches.map(m => m[1]);

        // Filtra códigos inválidos comuns
        const validIatas = iataCodes.filter(code => code !== 'BRL' && code !== 'USD');

        let origin = '---';
        let destination = '---';

        if (validIatas.length >= 2) {
            origin = validIatas[0];
            destination = validIatas[validIatas.length - 1];
        }

        // --- NOVA LÓGICA DE SEGMENTOS ---
        const segments: any[] = [];
        // Regex para capturar horários (HH:mm) e aeroportos (XXX) próximos
        // Exemplo simplificado: "10:00 (GRU) ... 14:00 (MIA)"
        // Vamos tentar capturar blocos de texto que pareçam voos

        // Estratégia: Dividir o texto em linhas e procurar padrões de voo
        const lines = cleanText.split('\n');
        let currentSegment: any = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Procura por voo (LA XXXX)
            const flightMatch = line.match(/(LA\s?\d{3,4})/i);
            if (flightMatch) {
                if (currentSegment.flight) {
                    segments.push(currentSegment);
                    currentSegment = {};
                }
                currentSegment.flight = flightMatch[1].replace(/\s/g, '');
            }

            // Procura por horário e aeroporto: 10:00 (GRU)
            const timeAirportMatch = line.match(/(\d{2}:\d{2})\s*\(?([A-Z]{3})\)?/);
            if (timeAirportMatch) {
                if (!currentSegment.departure) {
                    currentSegment.departure = {
                        time: timeAirportMatch[1],
                        airport: timeAirportMatch[2]
                    };
                } else if (!currentSegment.arrival) {
                    currentSegment.arrival = {
                        time: timeAirportMatch[1],
                        airport: timeAirportMatch[2]
                    };
                }
            }
        }
        // Push last segment if valid
        if (currentSegment.flight && currentSegment.departure) {
            segments.push(currentSegment);
        }

        // Se a lógica acima falhar, cria um segmento padrão com os dados gerais
        if (segments.length === 0) {
            segments.push({
                flight: flightNumber,
                departure: { time: '12:00', airport: origin },
                arrival: { time: '16:00', airport: destination }
            });
        }

        return {
            flightNumber,
            departureDate,
            origin,
            destination,
            itinerary_details: segments
        }

    } catch (error) {
        console.error(`Scraping failed for LATAM ${pnr}:`, error)
        await page.screenshot({ path: 'error-latam-input.png', fullPage: true });
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
