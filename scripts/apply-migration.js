const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function applyMigration() {
    const migrationPath = path.join(__dirname, '../supabase/migrations/20251231165000_enhance_flights_and_tickets.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const client = new Client({
        connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔄 Conectando ao banco de dados...');
        await client.connect();
        console.log('✅ Conectado. Aplicando migração...');

        await client.query(sql);

        console.log('🚀 Migração aplicada com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao aplicar migração:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

applyMigration();
