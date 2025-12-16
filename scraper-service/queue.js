const { Queue } = require('bullmq');
const IORedis = require('ioredis');

/**
 * =============================
 * CONFIGURAÇÃO REDIS
 * =============================
 */

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    throw new Error('❌ REDIS_URL não definida no .env');
}

// Detecta se é conexão segura (rediss://)
const isTls = redisUrl.startsWith('rediss://');

// 1. Cliente Redis Genérico (para Cache Manual)
const redisClient = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 30000,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {})
});

// 2. Configuração de Conexão Compartilhada para o BullMQ
const connection = {
    url: redisUrl,
    connectTimeout: 30000,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {})
};

/**
 * =============================
 * FILA DE SCRAPING
 * =============================
 */

const scrapeQueue = new Queue('scrape-queue', { connection });

async function addScrapeJob(data) {
    return await scrapeQueue.add('scrape-job', data, {
        attempts: 1,
        backoff: undefined,
        // 🚨 CORREÇÃO AQUI: NÃO REMOVER IMEDIATAMENTE
        removeOnComplete: {
            age: 3600, // Manter jobs completados por 1 hora
            count: 1000 // Ou manter os últimos 1000
        },
        removeOnFail: {
            age: 24 * 3600 // Manter falhas por 24 horas (bom para debug)
        }
    });
}

async function getJob(jobId) {
    return await scrapeQueue.getJob(jobId);
}

/**
 * =============================
 * CACHE (REDIS MANUAL)
 * =============================
 */

function getCacheKey(pnr, lastname, provider) {
    return `scrape:${provider}:${pnr}:${lastname}`.toUpperCase();
}

async function getCachedResult(pnr, lastname, provider) {
    try {
        const key = getCacheKey(pnr, lastname, provider);
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('Erro Redis Cache Get:', e);
        return null;
    }
}

async function setCachedResult(pnr, lastname, provider, data, ttlSeconds = 300) {
    try {
        const key = getCacheKey(pnr, lastname, provider);
        await redisClient.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    } catch (e) {
        console.error('Erro Redis Cache Set:', e);
    }
}

module.exports = {
    scrapeQueue,
    addScrapeJob,
    getJob,
    getCachedResult,
    setCachedResult,
    connection
};