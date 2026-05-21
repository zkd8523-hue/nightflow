import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

interface ClubRequest {
  id: string;
  user_id: string | null;
  club_name: string;
  area: string | null;
  note: string | null;
  created_at: string;
}

export default async function AdminClubRequestsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") redirect("/");

  const { data: requests } = await supabase
    .from("club_requests")
    .select("id, user_id, club_name, area, note, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows: ClubRequest[] = requests ?? [];

  // 요청자 닉네임 조회
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x))];
  const { data: users } = userIds.length
    ? await supabase.from("users").select("id, name").in("id", userIds)
    : { data: [] };
  const userMap = new Map((users ?? []).map((u) => [u.id, u.name as string]));

  // 클럽명 정규화 후 빈도 집계
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const freq = new Map<string, { display: string; count: number; areas: Set<string>; latest: string }>();
  for (const r of rows) {
    const key = normalize(r.club_name);
    const cur = freq.get(key);
    if (cur) {
      cur.count += 1;
      if (r.area) cur.areas.add(r.area);
      if (r.created_at > cur.latest) cur.latest = r.created_at;
    } else {
      freq.set(key, {
        display: r.club_name.trim(),
        count: 1,
        areas: new Set(r.area ? [r.area] : []),
        latest: r.created_at,
      });
    }
  }
  const ranked = [...freq.values()].sort((a, b) => b.count - a.count || (b.latest > a.latest ? 1 : -1));

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="p-2 -ml-2 hover:bg-neutral-800 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight">클럽 요청 (영업 리드)</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              유저가 직접 요청한 클럽 · 총 {rows.length}건 · 고유 {ranked.length}개
            </p>
          </div>
        </div>

        {/* 상위 요청 클럽 — 영업 우선순위 */}
        {ranked.length > 0 && (
          <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <h2 className="text-[13px] font-black text-white">요청 많은 클럽 TOP 10</h2>
            </div>
            {ranked.slice(0, 10).length === 0 ? (
              <p className="text-[12px] text-neutral-500">아직 요청이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {ranked.slice(0, 10).map((r, i) => (
                  <div
                    key={r.display}
                    className="flex items-center justify-between gap-3 py-2 border-b border-neutral-800 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[11px] font-black text-neutral-500 w-5 tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-white truncate">{r.display}</p>
                        {r.areas.size > 0 && (
                          <p className="text-[11px] text-neutral-500 truncate">
                            {[...r.areas].join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-black shrink-0">
                      {r.count}건
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* 전체 요청 목록 */}
        {rows.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Sparkles className="w-10 h-10 text-neutral-700 mx-auto" />
            <p className="text-[15px] font-bold text-neutral-400">아직 클럽 요청이 없습니다</p>
            <p className="text-[12px] text-neutral-600">
              조각 리스트에서 유저가 클럽을 요청하면 여기에 표시돼요
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-[13px] font-black text-neutral-300 px-1">최근 요청 (최신순)</h2>
            {rows.map((r) => (
              <Card key={r.id} className="bg-[#1C1C1E] border-neutral-800/50 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-black text-white truncate">{r.club_name}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-500">
                      {r.area && (
                        <>
                          <span>{r.area}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>
                        {r.user_id
                          ? userMap.get(r.user_id) ?? "(탈퇴 유저)"
                          : "비로그인"}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-neutral-600 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {r.note && (
                  <p className="text-[12.5px] text-neutral-400 leading-relaxed mt-2 whitespace-pre-wrap break-words">
                    {r.note}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
