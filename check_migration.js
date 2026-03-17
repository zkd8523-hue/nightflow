const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndApplyMigration() {
  // Check if effective_end_at column exists
  const { data, error } = await supabase
    .from('auctions')
    .select('effective_end_at')
    .limit(1);
  
  if (error && error.message.includes('effective_end_at')) {
    console.log('❌ effective_end_at 컬럼이 없습니다. 마이그레이션 필요.');
    
    // Apply migration
    const migrationSQL = `
ALTER TABLE auctions ADD COLUMN effective_end_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(extended_end_at, auction_end_at)) STORED;

CREATE INDEX idx_auctions_effective_end ON auctions(effective_end_at) WHERE status = 'active';
    `;
    
    const { error: applyError } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    if (applyError) {
      console.log('마이그레이션 실패:', applyError);
    } else {
      console.log('✅ 마이그레이션 적용 완료!');
    }
  } else {
    console.log('✅ effective_end_at 컬럼이 이미 존재합니다.');
  }
}

checkAndApplyMigration().catch(console.error);
