const { chromium } = require('playwright');

// TENTATIVA 1: Usuário BR (O que estamos usando)
const PROXY_BR = {
    server: 'http://p.webshare.io:80',
    username: 'xtweuspr-1-country-BR',
    password: '5so72ui3knmj'
};

// TENTATIVA 2: Usuário Global (Backup)
const PROXY_GLOBAL = {
    server: 'http://p.webshare.io:80',
    username: 'xtweuspr-1',
    password: '5so72ui3knmj'
};

async function checkConnection(proxyConfig, label) {
    console.log(`\n🔵 Testando ${label}...`);
    let browser;
    try {
        browser = await chromium.launch({
            headless: false,
            proxy: proxyConfig
        });

        const page = await browser.newPage();

        // 1. Teste de IP (Rápido)
        console.log('   Pingando API de IP...');
        const t1 = Date.now();
        await page.goto('https://api.ipify.org?format=json', { timeout: 15000 });
        const ip = await page.evaluate(() => document.body.innerText);
        console.log(`   ✅ IP OK (${Date.now() - t1}ms): ${ip}`);

        // 2. Teste da LATAM (Real)
        console.log('   Tentando abrir LATAM...');
        const t2 = Date.now();
        await page.goto('https://www.latamairlines.com/br/pt/minhas-viagens', {
            waitUntil: 'commit',
            timeout: 30000
        });
        console.log(`   ✅ LATAM Carregou (${Date.now() - t2}ms)`);

    } catch (e) {
        console.error(`   ❌ FALHA: ${e.message}`);
    } finally {
        if (browser) await browser.close();
    }
}

(async () => {
    await checkConnection(PROXY_BR, 'Proxy BR (xtweuspr-1-country-BR)');
    await checkConnection(PROXY_GLOBAL, 'Proxy Global (xtweuspr-1)');
})();