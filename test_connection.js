const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function getEnvVars() {
    const envPath = path.resolve(__dirname, '.env.local');
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8');
    const vars = {};
    content.split('\n').forEach(line => {
        // Basic parser for .env files
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            vars[match[1]] = (match[2] || "").trim();
        }
    });
    return vars;
}

const env = getEnvVars();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    try {
        const { data, error, count } = await supabase.from('clubs').select('*', { count: 'exact', head: true });
        if (error) {
            console.error('Supabase connection failed:', error.message);
        } else {
            console.log('Supabase connection successful!');
            console.log('Clubs count:', count);
        }
    } catch (err) {
        console.error('Error during connection test:', err.message);
    }
}

testConnection();
