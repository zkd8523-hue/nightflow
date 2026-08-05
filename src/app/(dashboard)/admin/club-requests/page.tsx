import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, Sparkles, TrendingUp, Star } from "lucide-react";
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

  // 미들웨어가 auth + role 체크를 완료하고 헤더로 전달
  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

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

  // 등록 클럽 수요 (Migration 504) — 클럽별로 "그 클럽을 선호 클럽으로 지정한 깃발"을 묶어서 보여준다.
  // 집계 숫자만으론 영업할 때 쓸 게 없어서(언제·얼마짜리 수요인지 모름) 깃발 날짜/예산까지 함께 노출.
  // has_md=false인데 지정이 쌓인 클럽 = "원하는데 파트너 MD가 없는 클럽" → 영업 최우선 타겟.
  const { data: demandPuzzles } = await supabase
    .from("puzzles")
    .select("id, event_date, total_budget, budget_per_person, target_count, area, preferred_club_ids, status")
    .neq("preferred_club_ids", "{}")
    .order("event_date", { ascending: false })
    .limit(300);

  const demandClubIds = [
    ...new Set((demandPuzzles ?? []).flatMap((p) => p.preferred_club_ids ?? [])),
  ];
  const { data: demandClubRows } = demandClubIds.length
    ? await supabase
        .from("clubs")
        .select("id, name, area, club_partners(md_id)")
        .in("id", demandClubIds)
    : { data: [] };

  type DemandFlag = { id: string; event_date: string; budget: number; target_count: number; area: string | null };
  const demandByClub = new Map<
    string,
    { id: string; name: string; area: string | null; has_md: boolean; flags: DemandFlag[] }
  >();
  for (const c of (demandClubRows ?? []) as unknown as {
    id: string; name: string; area: string | null; club_partners: { md_id: string }[] | null;
  }[]) {
    demandByClub.set(c.id, {
      id: c.id,
      name: c.name,
      area: c.area,
      has_md: (c.club_partners?.length ?? 0) > 0,
      flags: [],
    });
  }
  for (const p of demandPuzzles ?? []) {
    const budget = p.total_budget ?? (p.budget_per_person ?? 0) * (p.target_count ?? 1);
    for (const cid of p.preferred_club_ids ?? []) {
      demandByClub.get(cid)?.flags.push({
        id: p.id,
        event_date: p.event_date,
        budget,
        target_count: p.target_count,
        area: p.area,
      });
    }
  }
  // 지정 많은 클럽 우선, 같으면 파트너 없는 곳(영업 타겟) 먼저
  const demand = [...demandByClub.values()]
    .filter((c) => c.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length || Number(a.has_md) - Number(b.has_md));

  // "500000" → "50만원" (딱 떨어지면 만 단위, 아니면 원 단위 그대로)
  const fmtBudget = (n: number) =>
    n > 0 && n % 10000 === 0 ? `${(n / 10000).toLocaleString()}만원` : `${n.toLocaleString()}원`;
  const fmtDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return Number.isNaN(dt.getTime()) ? d : `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="p-2 -ml-2 hover:bg-muted rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight">클럽 요청 (영업 리드)</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              유저가 직접 요청한 클럽 · 총 {rows.length}건 · 고유 {ranked.length}개
            </p>
          </div>
        </div>

        {/* 상위 요청 클럽 — 영업 우선순위 */}
        {ranked.length > 0 && (
          <Card className="bg-card border-border/50 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-brand-amber" />
              <h2 className="text-[13px] font-black text-foreground">요청 많은 클럽 TOP 10</h2>
            </div>
            {ranked.slice(0, 10).length === 0 ? (
              <p className="text-[12px] text-muted-foreground">아직 요청이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {ranked.slice(0, 10).map((r, i) => (
                  <div
                    key={r.display}
                    className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[11px] font-black text-muted-foreground w-5 tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-foreground truncate">{r.display}</p>
                        {r.areas.size > 0 && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[...r.areas].join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-brand-amber text-[11px] font-black shrink-0">
                      {r.count}건
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* 등록 클럽 수요 — 깃발이 지정한 "오늘 가고싶은 클럽" 집계 (Migration 504) */}
        {demand.length > 0 && (
          <Card className="bg-card border-border/50 p-4 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-brand-amber" />
              <h2 className="text-[13px] font-black text-foreground">등록 클럽 수요 TOP</h2>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              깃발이 &ldquo;선호 클럽&rdquo;으로 지정한 수요 · 파트너 MD 없는 곳은 영업 타겟
            </p>
            <div className="space-y-4">
              {demand.map((c) => (
                <div key={c.id}>
                  {/* 클럽 헤더 */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-2">
                      <p className="text-[15px] font-black text-foreground truncate">{c.name}</p>
                      {c.area && <span className="text-[11px] text-muted-foreground shrink-0">{c.area}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!c.has_md && (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[11px] font-black whitespace-nowrap">
                          영업 타겟
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-brand-amber text-[11px] font-black">
                        {c.flags.length}건
                      </span>
                    </div>
                  </div>
                  {/* 그 클럽을 지정한 깃발들 — 날짜 · 예산 · 인원 */}
                  <div className="mt-1.5 pl-3 border-l border-border space-y-1">
                    {c.flags.map((f) => (
                      <Link
                        key={`${c.id}-${f.id}`}
                        href={`/flags/${f.id}`}
                        className="flex items-center gap-2 text-[12.5px] hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors"
                      >
                        <span className="font-bold text-foreground tabular-nums shrink-0">
                          {fmtDate(f.event_date)}
                        </span>
                        <span className="font-bold text-money tabular-nums">{fmtBudget(f.budget)}</span>
                        <span className="text-muted-foreground shrink-0">{f.target_count}명</span>
                        {f.area && <span className="text-muted-foreground truncate">{f.area}</span>}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 전체 요청 목록 */}
        {rows.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Sparkles className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-[15px] font-bold text-muted-foreground">아직 클럽 요청이 없습니다</p>
            <p className="text-[12px] text-muted-foreground">
              파티 리스트에서 유저가 클럽을 요청하면 여기에 표시돼요
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-[13px] font-black text-foreground/80 px-1">최근 요청 (최신순)</h2>
            {rows.map((r) => (
              <Card key={r.id} className="bg-card border-border/50 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-black text-foreground truncate">{r.club_name}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
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
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {r.note && (
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-2 whitespace-pre-wrap break-words">
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
