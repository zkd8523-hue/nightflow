import { test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test("debug - find MD user and clubs", async () => {
  const { data: mdUser } = await supabase
    .from("users")
    .select("id, email, name, role, md_status")
    .eq("email", "e2e-md@nightflow.com")
    .single();
  console.log("MD User:", JSON.stringify(mdUser));

  if (mdUser) {
    const { data: clubs } = await supabase
      .from("clubs")
      .select("id, name, status, md_id, floor_plan_url")
      .eq("md_id", mdUser.id);
    console.log("MD Clubs:", JSON.stringify(clubs));
  }

  const { data: allClubs } = await supabase
    .from("clubs")
    .select("id, name, status, md_id")
    .limit(10);
  console.log("All Clubs:", JSON.stringify(allClubs));
});
