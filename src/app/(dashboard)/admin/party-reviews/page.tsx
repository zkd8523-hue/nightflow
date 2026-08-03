import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, ThumbsUp, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Stats {
  answered_total: number;
  visited_yes: number;
  visited_no: number;
  not_visited_reasons: { reason: string; count: number }[];
  reviews_total: number;
  likes_total: number;
  top_tags: { tag: string; count: number }[];
}

interface ReviewRow {
  id: string;
  area: string | null;
  event_date: string | null;
  reviewer_name: string | null;
  reviewee_name: string | null;
  liked: boolean;
  tags: string[];
  created_at: string;
}

export default async function AdminPartyReviewsPage() {
  const supabase = await createClient();
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const [{ data }, { data: listData }] = await Promise.all([
    supabase.rpc("admin_party_review_stats"),
    supabase.rpc("admin_list_party_reviews", { p_limit: 100 }),
  ]);
  const s = (data ?? {}) as Partial<Stats>;
  const rows = (listData ?? []) as ReviewRow[];
  const visitRate = s.answered_total ? Math.round(((s.visited_yes ?? 0) / s.answered_total) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
          <Link href="/admin" className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover:bg-card">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-[16px] font-black tracking-tight">파티 리뷰 집계</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">
        {/* 방문 응답 */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-black text-brand-amber">🎉 파티 방문 응답</h2>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="응답" value={s.answered_total ?? 0} />
            <Stat label="다녀옴" value={s.visited_yes ?? 0} tone="text-green-400" />
            <Stat label="안 감" value={s.visited_no ?? 0} tone="text-red-400" />
          </div>
          <div className="rounded-xl bg-card border border-border px-4 py-3">
            <p className="text-[12px] text-muted-foreground">방문 전환율 (응답 중)</p>
            <p className="text-[22px] font-black text-brand-amber tabular-nums">{visitRate}%</p>
          </div>
        </section>

        {/* 미방문 사유 */}
        {(s.not_visited_reasons?.length ?? 0) > 0 && (
          <section className="space-y-2">
            <h2 className="text-[13px] font-black text-foreground/80">미방문 사유</h2>
            <div className="space-y-1.5">
              {s.not_visited_reasons!.map((r) => (
                <div key={r.reason} className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2">
                  <span className="text-[13px] text-foreground/90">{r.reason}</span>
                  <span className="text-[13px] font-bold text-muted-foreground tabular-nums">{r.count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 상호 리뷰 */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-black text-brand-amber">👍 파티원 상호 리뷰</h2>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="총 리뷰" value={s.reviews_total ?? 0} />
            <Stat label="좋았어요 👍" value={s.likes_total ?? 0} tone="text-amber-400" />
          </div>
          {(s.top_tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {s.top_tags!.map((t) => (
                <span key={t.tag} className="inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-full bg-amber-500/12 text-brand-amber border border-amber-500/25">
                  {t.tag} <span className="text-muted-foreground tabular-nums">{t.count}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 개별 리뷰 — 누가 누구에게 */}
        <section className="space-y-2">
          <h2 className="text-[13px] font-black text-foreground/80">개별 리뷰 (누가 → 누구에게)</h2>
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">아직 리뷰가 없어요</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl bg-card border border-border p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[13px] font-bold">
                    <span className="text-foreground">{r.reviewer_name ?? "익명"}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-brand-amber">{r.reviewee_name ?? "익명"}</span>
                    {r.liked && <ThumbsUp className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                  </div>
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 text-brand-amber border border-amber-500/25">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10.5px] text-muted-foreground">
                    {r.area ?? ""} {r.event_date ?? ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-card border border-border px-3 py-3 text-center">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-[20px] font-black tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
