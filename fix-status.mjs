import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/gimmingi/project 1/nightflow/.env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const names = ["Dawn","NB2","Times","MUSE SEOUL","Frame Seoul","vurt.","Orgasm Valley","LUKA","Shelter","NYAPI","Cakeshop","Bolero","MING","Macaroni Funky Club","Peach Lounge","Club Enter","Dibs"];
const { data, error } = await supabase.from("clubs")
  .update({ status: "approved" })
  .in("name", names)
  .neq("status", "approved")
  .select("name, status");
if (error) { console.error(error); process.exit(1); }
console.log(`✅ ${data.length}곳 status → approved`);
for (const c of data) console.log(`  ${c.name}`);
