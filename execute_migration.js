const https = require('https');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

const sql = `
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS effective_end_at TIMESTAMPTZ
  GENERATED ALWAYS AS (COALESCE(extended_end_at, auction_end_at)) STORED;

CREATE INDEX IF NOT EXISTS idx_auctions_effective_end
  ON auctions(effective_end_at) WHERE status = 'active';
`;

const data = JSON.stringify({ query: sql });

const options = {
  hostname: `${PROJECT_REF}.supabase.co`,
  port: 443,
  path: '/rest/v1/rpc/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Length': data.length,
    'Prefer': 'return=minimal'
  }
};

console.log('📦 Executing migration 020_effective_end_at.sql...');
console.log('Project:', PROJECT_REF);

const req = https.request(options, (res) => {
  let body = '';
  
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body || '(empty)');
    
    if (res.statusCode === 200 || res.statusCode === 204) {
      console.log('✅ Migration executed successfully!');
      
      // Verify by calling close-expired-auctions
      console.log('\n🧪 Testing close-expired-auctions...');
      const testReq = https.request({
        hostname: `${PROJECT_REF}.supabase.co`,
        port: 443,
        path: '/functions/v1/close-expired-auctions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      }, (testRes) => {
        let testBody = '';
        testRes.on('data', (chunk) => { testBody += chunk; });
        testRes.on('end', () => {
          console.log('Test result:', testBody);
          if (!testBody.includes('error') || testBody.includes('count')) {
            console.log('✅ close-expired-auctions now working!');
          }
        });
      });
      testReq.end();
    } else {
      console.log('❌ Migration failed');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error);
});

req.write(data);
req.end();
