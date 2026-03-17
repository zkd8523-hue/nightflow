import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MDSettingsForm } from "@/components/md/MDSettingsForm";

export default async function MDSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!userData) redirect("/");

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <MDSettingsForm user={userData} />
    </div>
  );
}
