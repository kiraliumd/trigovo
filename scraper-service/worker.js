require('dotenv').config();
const { Worker } = require('bullmq');
const scrapers = require('./scraper');
const { connection, setCachedResult } = require('./queue');

// ==============================
// WORKER
// ==============================

let workerInstance = null;

function startWorker() {
    if (process.env.ENABLE_WORKER !== 'true') {
        console.log('🚫 Worker desabilitado. Apenas API responderá.');
        return null;
    }

    if (workerInstance) return workerInstance;

    console.log('👷 Iniciando Worker (Lógica: Direto -> Fallback Proxy)...');

    workerInstance = new Worker(
        'scrape-queue',
        async (job) => {
            const { airline, pnr, lastname, origin } = job.data;
            const logPrefix = `[Job ${job.id} | ${airline} ${pnr}]`;

            console.log(`${logPrefix} 🚀 Iniciando processamento...`);

            // Função auxiliar para chamar o scraper correto
            const executeScraper = async (useProxy) => {
                const params = { pnr, lastname, origin, useProxy }; // Passa a flag useProxy

                if (airline === 'GOL') return await scrapers.scrapeGol(params);
                if (airline === 'LATAM') return await scrapers.scrapeLatam(params);
                if (airline === 'AZUL') return await scrapers.scrapeAzul(params);
                throw new Error(`Cia não suportada: ${airline}`);
            };

            let result = null;

            try {
                // ---------------------------------------------------------
                // TENTATIVA 1: CONEXÃO DIRETA (SEM PROXY)
                // ---------------------------------------------------------
                console.log(`${logPrefix} 1️⃣ Tentando Conexão DIRETA (Sem Proxy)...`);
                result = await executeScraper(false); // useProxy = false
                console.log(`${logPrefix} ✅ Sucesso na conexão direta!`);

            } catch (directError) {
                // ---------------------------------------------------------
                // FALLBACK: TENTATIVA 2: VIA PROXY RESIDENCIAL
                // ---------------------------------------------------------
                console.warn(`${logPrefix} ⚠️ Falha Direta: "${directError.message}". Ativando Proxy...`);

                try {
                    console.log(`${logPrefix} 2️⃣ Tentando VIA PROXY...`);
                    result = await executeScraper(true); // useProxy = true
                    console.log(`${logPrefix} ✅ Sucesso via Proxy!`);
                } catch (proxyError) {
                    // ---------------------------------------------------------
                    // FALHA FINAL
                    // ---------------------------------------------------------
                    const errorMsg = `Falha dupla (Direta + Proxy). Último erro: ${proxyError.message}`;
                    console.error(`${logPrefix} ❌ ${errorMsg}`);

                    return {
                        status: 'ERROR',
                        message: errorMsg,
                        details: 'Esgotadas tentativas sem e com proxy.'
                    };
                }
            }

            // Se chegou aqui, temos um resultado (de uma das duas tentativas)
            if (result && result.flightNumber) {
                await setCachedResult(pnr, lastname, airline, result, 300);
            }

            return result;
        },
        {
            connection,
            concurrency: 5,
            limiter: { max: 10, duration: 1000 },
            lockDuration: 60000
        }
    );

    workerInstance.on('failed', (job, err) => {
        console.error(`[Job ${job.id}] ☠️ Erro Crítico BullMQ: ${err.message}`);
    });

    return workerInstance;
}

async function stopWorker() {
    if (workerInstance) {
        console.log('🛑 Parando Worker...');
        await workerInstance.close();
        workerInstance = null;
    }
}

module.exports = { startWorker, stopWorker };