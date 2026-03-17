const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL ||
  `postgresql://postgres.ihqztsakxczzsxfvdkpq:${process.env.SUPABASE_DB_PASSWORD}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`;

async function applyMigration() {
  const migrationFile = process.argv[2] || 'supabase/migrations/063_fix_schema_integrity.sql';
  const sql = fs.readFileSync(migrationFile, 'utf8');

  const client = new Client({ connectionString });

  try {
    console.log(`🔌 Connecting to database...`);
    await client.connect();
    console.log(`✅ Connected`);

    console.log(`📦 Applying migration: ${migrationFile}`);
    await client.query(sql);
    console.log(`✅ Migration applied successfully!`);
  } catch (error) {
    console.error(`❌ Migration failed:`, error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration().catch(console.error);
