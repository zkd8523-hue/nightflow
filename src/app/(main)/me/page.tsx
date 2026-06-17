import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MyProfileRedirectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/me");
  }

  redirect(`/u/${user.id}`);
}
