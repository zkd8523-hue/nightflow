import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, History } from "lucide-react";
import Link from "next/link";
import { ClubChangeLogList } from "@/components/admin/ClubChangeLogList";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "클럽 변경 이력 — NightFlow Admin",
};

export default async function AdminClubChangeLogPage() {
  const supabase = await createClient();

  // 미들웨어가 auth + role 체크를 완료하고 헤더로 전달
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const { data: logs } = await supabase
    .from("club_change_log")
    .select(`
      id, club_id, changed_by, field, old_value, new_value, created_at,
      club:clubs(id, name, area)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  // 변경자 닉네임 조회
  const changerIds = [
    ...new Set((logs ?? []).map((l) => l.changed_by).filter((x): x is string => !!x)),
  ];
  const { data: changers } = changerIds.length
    ? await supabase
        .from("users")
        .select("id, display_name, name")
        .in("id", changerIds)
    : { data: [] };

  const changerMap = new Map<string, { display_name: string | null; name: string | null }>();
  for (const c of changers ?? []) {
    changerMap.set(c.id, { display_name: c.display_name, name: c.name });
  }

  const rows = (logs ?? []).map((l) => ({
    id: l.id as string,
    club_id: l.club_id as string,
    changed_by: l.changed_by as string | null,
    field: l.field as string,
    old_value: l.old_value as unknown,
    new_value: l.new_value as unknown,
    created_at: l.created_at as string,
    club: l.club as unknown as { id: string; name: string; area: string | null } | null,
    changer_name: l.changed_by
      ? changerMap.get(l.changed_by)?.display_name ?? changerMap.get(l.changed_by)?.name ?? "—"
      : "—",
  }));

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-3xl mx-auto p-5">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-muted-foreground text-sm font-bold hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          관리자 홈
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <History className="w-5 h-5 text-brand-amber" />
          <h1 className="text-2xl font-black text-foreground tracking-tight">클럽 변경 이력</h1>
        </div>
        <p className="text-[12px] text-muted-foreground mb-5">
          파트너와 admin이 변경한 태그·영업시간 이력. 필요 시 롤백 가능.
        </p>

        <ClubChangeLogList rows={rows} />
      </div>
    </div>
  );
}
