const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        db: {
            schema: 'public'
        }
    }
);

async function applyMigration() {
    console.log('📦 Applying migration 060_move_won_notification_to_db.sql...');

    const sqlContent = fs.readFileSync('supabase/migrations/060_move_won_notification_to_db.sql', 'utf8');
    const parts = sqlContent.split(/CREATE OR REPLACE FUNCTION/g);

    for (let i = 1; i < parts.length; i++) {
        const query = 'CREATE OR REPLACE FUNCTION ' + parts[i];
        try {
            const { error } = await supabase.rpc('sql', { query });
            if (error) throw error;
            console.log(`✅ Part ${i} 적용 완료`);
        } catch (e) {
            console.error(`❌ Part ${i} 실패:`, e.message || e);
            process.exit(1);
        }
    }

    console.log('✅ 모든 작업 완료!');
}

applyMigration().catch(console.error);
