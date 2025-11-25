import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function migrate() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

    if (!connectionString) {
        console.error('❌ No database connection string found in .env.local (checked DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL)');
        process.exit(1);
    }

    const client = new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        const migrationFile = path.join(process.cwd(), 'supabase/migrations/20251124213000_add_itinerary_details.sql');
        const sql = fs.readFileSync(migrationFile, 'utf8');

        console.log(`🚀 Executing migration: ${path.basename(migrationFile)}`);
        await client.query(sql);

        console.log('✅ Migration executed successfully');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate();
