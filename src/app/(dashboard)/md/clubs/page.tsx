import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, MapPin } from "lucide-react";

import { ClubList } from "./ClubList";

export default async function MDClubsPage() {
  const supabase = await createClient();

  // 1. Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2. Role check
  const { data: userData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!userData || (userData.role !== "md" && userData.role !== "admin")) {
    redirect("/");
  }

  // 3. Fetch MD's clubs
  const { data: clubs } = await supabase
    .from("clubs")
    .select("*")
    .eq("md_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="max-w-lg mx-auto pb-24">
        {/* Header */}
        <div className="px-6 pt-8 pb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">나의 클럽</h1>
              <p className="text-neutral-500 text-sm mt-1">신청한 클럽 {clubs?.length || 0}개</p>
            </div>
            <Link href="/md/clubs/new">
              <Button className="rounded-full bg-white text-black font-black hover:bg-neutral-200 h-10 px-3">
                <Plus className="w-4 h-4 mr-1" />
                추가
              </Button>
            </Link>
          </div>
        </div>

        {/* Club List */}
        <div className="px-4 space-y-3">
          {clubs && clubs.length > 0 ? (
            <ClubList initialClubs={clubs} />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-24 text-center space-y-6 bg-[#1C1C1E]/30 rounded-3xl border border-dashed border-neutral-800/50">
      <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
        <MapPin className="w-8 h-8 text-neutral-700" />
      </div>
      <div className="space-y-2 px-6">
        <p className="text-neutral-500 font-bold text-sm">신청한 클럽이 없습니다</p>
        <p className="text-neutral-600 text-xs leading-relaxed">
          클럽을 신청하면 관리자 승인 후<br />
          경매를 시작할 수 있습니다
        </p>
      </div>
      <Link href="/md/clubs/new">
        <Button className="rounded-full bg-white text-black font-black hover:bg-neutral-200 h-10 px-6 mx-auto">
          <Plus className="w-4 h-4 mr-1" />
          클럽 신청하기
        </Button>
      </Link>
    </div>
  );
}
