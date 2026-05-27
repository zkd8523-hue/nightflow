import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, Flag } from "lucide-react";
import Link from "next/link";
import { ClubInfoReportsList } from "@/components/admin/ClubInfoReportsList";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "클럽 정보 신고 — NightFlow Admin",
};

export default async function AdminClubInfoReportsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") redirect("/");

  const { data: reports } = await supabase
    .from("club_info_reports")
    .select(`
      id, club_id, reporter_id, category, message, status,
      admin_note, reviewed_at, created_at,
      club:clubs(id, name, area)
    `)
    .order("status", { ascending: true }) // pending이 먼저
    .order("created_at", { ascending: false })
    .limit(200);

  const reporterIds = [
    ...new Set((reports ?? []).map((r) => r.reporter_id).filter((x): x is string => !!x)),
  ];
  const { data: reporters } = reporterIds.length
    ? await supabase
        .from("users")
        .select("id, display_name, name, role")
        .in("id", reporterIds)
    : { data: [] };

  const reporterMap = new Map<
    string,
    { display_name: string | null; name: string | null; role: string }
  >();
  for (const r of reporters ?? []) {
    reporterMap.set(r.id, {
      display_name: r.display_name,
      name: r.name,
      role: r.role,
    });
  }

  const rows = (reports ?? []).map((r) => {
    const reporter = r.reporter_id ? reporterMap.get(r.reporter_id) : null;
    return {
      id: r.id as string,
      club_id: r.club_id as string,
      reporter_id: r.reporter_id as string | null,
      category: (r.category as string | null) ?? null,
      message: r.message as string,
      status: r.status as "pending" | "resolved" | "rejected",
      admin_note: r.admin_note as string | null,
      reviewed_at: r.reviewed_at as string | null,
      created_at: r.created_at as string,
      club: r.club as unknown as { id: string; name: string; area: string | null } | null,
      reporter_name: reporter
        ? reporter.display_name ?? reporter.name ?? "—"
        : "(익명/탈퇴)",
      reporter_role: reporter?.role ?? null,
    };
  });

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="max-w-3xl mx-auto p-5">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-neutral-500 text-sm font-bold hover:text-white transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          관리자 홈
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <Flag className="w-5 h-5 text-amber-400" />
          <h1 className="text-2xl font-black text-white tracking-tight">클럽 정보 신고</h1>
          {pendingCount > 0 && (
            <span className="ml-1 text-[12px] font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
              {pendingCount} pending
            </span>
          )}
        </div>
        <p className="text-[12px] text-neutral-500 mb-5">
          유저/MD가 신고한 클럽 정보 오류. 검토 후 클럽 정보를 직접 수정하고 처리 상태를 갱신하세요.
        </p>

        <ClubInfoReportsList rows={rows} />
      </div>
    </div>
  );
}
