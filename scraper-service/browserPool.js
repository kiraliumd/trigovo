const { chromium } = require('playwright');
const { chromium: chromiumExtra } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');

chromiumExtra.use(stealth());

class BrowserPool {
    constructor() {
        this.browser = null;
        this.isInitializing = false;
        this.initPromise = null;
    }

    async init() {
        if (this.browser) return;
        if (this.isInitializing) return this.initPromise;

        this.isInitializing = true;
        this.initPromise = (async () => {
            try {
                console.log('🚀 Inicializando Browser Pool...');
                // Usando chromiumExtra para stealth mode
                this.browser = await chromiumExtra.launch({
                    headless: process.env.HEADLESS !== 'false' && process.env.PLAYWRIGHT_HEADLESS !== 'false',
                    slowMo: process.env.HEADLESS === 'false' ? 100 : 0,     // Desacelera apenas se não for headless
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage', // Importante para Docker
                        '--disable-accelerated-2d-canvas',
                        '--disable-gpu'
                    ]
                });
                console.log('✅ Browser Pool inicializado.');
            } catch (error) {
                console.error('❌ Falha ao inicializar Browser Pool:', error);
                this.isInitializing = false;
                throw error;
            }
        })();

        return this.initPromise;
    }

    async withPage(callback, options = {}) {
        if (!this.browser) await this.init();

        const contextOptions = {
            viewport: { width: 1366, height: 768 },
            locale: 'pt-BR',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...options
        };

        const context = await this.browser.newContext(contextOptions);

        // Ocultar webdriver
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        const page = await context.newPage();

        try {
            return await callback(page);
        } finally {
            await page.close();
            await context.close();
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.isInitializing = false;
        }
    }
}

// Exporta uma instância única (Singleton)
module.exports = new BrowserPool();
