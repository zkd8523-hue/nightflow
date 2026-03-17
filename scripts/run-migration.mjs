import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  "https://ihqztsakxczzsxfvdkpq.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration(filename) {
  const filepath = resolve(__dirname, "../supabase/migrations", filename);
  const sql = readFileSync(filepath, "utf-8");

  console.log(`\n--- Running: ${filename} ---`);

  const { data, error } = await supabase.rpc("exec_sql", { sql_string: sql });

  if (error) {
    // exec_sql RPC가 없으면 직접 실행 시도
    console.log(`RPC not available, trying direct SQL...`);

    // SQL을 statement 단위로 분리해서 실행
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const stmt of statements) {
      if (stmt.trim().length === 0) continue;
      console.log(`Executing: ${stmt.substring(0, 60)}...`);
    }

    console.error(`Error: ${error.message}`);
    console.log(
      "\nPlease run the SQL manually in Supabase SQL Editor:"
    );
    console.log(
      "https://supabase.com/dashboard/project/ihqztsakxczzsxfvdkpq/sql/new"
    );
    return false;
  }

  console.log(`Success: ${filename}`);
  return true;
}

async function main() {
  console.log("Running NightFlow migrations...\n");

  await runMigration("001_initial_schema.sql");
  await runMigration("002_functions.sql");
}

main().catch(console.error);
