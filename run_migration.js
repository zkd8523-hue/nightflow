const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Supabase connection string format: postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
const connectionString = process.env.DATABASE_URL || 
  `postgresql://postgres.ihqztsakxczzsxfvdkpq:${process.env.SUPABASE_DB_PASSWORD}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`;

async function runMigration() {
  const client = new Client({ connectionString });
  
  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected');
    
    console.log('\n📦 Step 1: Adding effective_end_at column...');
    await client.query(`
      ALTER TABLE auctions ADD COLUMN IF NOT EXISTS effective_end_at TIMESTAMPTZ
        GENERATED ALWAYS AS (COALESCE(extended_end_at, auction_end_at)) STORED;
    `);
    console.log('✅ Column added');
    
    console.log('\n📦 Step 2: Creating index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auctions_effective_end
        ON auctions(effective_end_at) WHERE status = 'active';
    `);
    console.log('✅ Index created');
    
    console.log('\n🧪 Verifying...');
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'auctions' AND column_name = 'effective_end_at';
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Migration successful!');
      console.log('Column info:', result.rows[0]);
    } else {
      console.log('❌ Column not found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

runMigration();
