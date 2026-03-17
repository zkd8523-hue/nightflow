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

async function run() {
    const fileContent = fs.readFileSync('supabase/migrations/060_move_won_notification_to_db.sql', 'utf8');

    // Split by "CREATE OR REPLACE FUNCTION" to run each function separately
    // This is a bit hacky but raw SQL RPCs often only like one command or have issues with complex scripts
    const parts = fileContent.split(/CREATE OR REPLACE FUNCTION/g);

    console.log('📦 Applying migration 060 in parts...');

    for (let i = 1; i < parts.length; i++) {
        const query = 'CREATE OR REPLACE FUNCTION ' + parts[i];
        console.log(`Executing Part ${i}...`);
        const { error } = await supabase.rpc('sql', { query });
        if (error) {
            console.error(`❌ Part ${i} failed:`, error);
            process.exit(1);
        }
    }

    console.log('✅ Migration 060 applied successfully!');
}

run().catch(console.error);
