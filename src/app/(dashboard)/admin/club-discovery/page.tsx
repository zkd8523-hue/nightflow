import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ClubDiscoveryList } from "@/components/admin/ClubDiscoveryList";

export const dynamic = "force-dynamic";

interface RegistryRow {
  id: string;
  name_raw: string;
  area_guess: string | null;
  venue_type: string | null;
  event_count: number;
  first_seen: string | null;
  last_seen: string | null;
  status: string;
}

export default async function ClubDiscoveryPage() {
  const supabase = await createClient();

  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", authUser.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const { data } = await supabase
    .from("club_name_registry")
    .select("id, name_raw, area_guess, venue_type, event_count, first_seen, last_seen, status")
    .eq("status", "unmatched")
    .order("event_count", { ascending: false })
    .returns<RegistryRow[]>();

  const rows = data ?? [];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          관리자 홈
        </Link>

        <header className="mb-1">
          <h1 className="text-xl font-black">미등록 클럽 발굴</h1>
        </header>
        <p className="mb-6 text-sm text-neutral-500">
          힙합플레이야 캘린더 등에서 공연 이력이 확인됐지만 NightFlow에는 등록되지 않은 장소입니다.
          공연장·라이브홀 등 클럽이 아닌 곳도 섞여 있어 자동 분류합니다. 지역·인스타 핸들을 입력하면 바로 클럽으로
          등록됩니다.
        </p>

        <ClubDiscoveryList rows={rows} />
      </div>
    </div>
  );
}
