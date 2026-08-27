import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { AdminArtistMergeList } from "@/components/admin/AdminArtistMergeList";

export const dynamic = "force-dynamic";

export default async function AdminArtistsPage() {
  const supabase = await createClient();

  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const { data: dupes } = await supabase.rpc("find_duplicate_artists");

  return <AdminArtistMergeList initialDupes={dupes ?? []} />;
}
