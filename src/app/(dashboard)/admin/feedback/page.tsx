import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, MessageSquare, Star } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

interface FeedbackRow {
  name: string;
  rating: number;
  comment: string | null;
  platform: string | null;
  created_at: string;
}
interface Summary {
  success: boolean;
  total?: number;
  avg?: number | null;
  dist?: Record<string, number>;
  recent?: FeedbackRow[];
}

export default async function AdminFeedbackPage() {
  const supabase = await createClient();
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const { data } = await supabase.rpc("admin_app_feedback_summary");
  const s = (data as Summary) ?? { success: false };
  const total = s.total ?? 0;
  const avg = s.avg ?? 0;
  const dist = s.dist ?? {};
  const recent = s.recent ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground pt-12 pb-24">
      <div className="max-w-4xl mx-auto px-6 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border hover:border-border transition-colors">
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">
              <MessageSquare className="w-3.5 h-3.5" />
              App Feedback
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter">앱 피드백</h1>
          <p className="text-muted-foreground font-medium">네이티브 앱 유저가 남긴 별점·의견</p>
        </header>

        {!s.success ? (
          <Card className="bg-card border-border p-6 text-red-400 text-sm">
            불러오기 실패 — 마이그레이션 486 적용 여부를 확인하세요.
          </Card>
        ) : (
          <>
            <div className="flex gap-4 flex-wrap">
              <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[120px]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">응답 수</span>
                <span className="text-3xl font-black text-foreground">{total.toLocaleString()}</span>
              </Card>
              <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[120px]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Star className="w-3 h-3" /> 평균 별점
                </span>
                <span className="text-3xl font-black text-brand-amber">{avg || "—"}</span>
              </Card>
              <Card className="bg-card border-border p-4 flex flex-col gap-1 min-w-[200px]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">별점 분포</span>
                <div className="flex items-end gap-1.5 pt-1">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <div key={n} className="flex flex-col items-center gap-0.5">
                      <span className="text-[13px] font-black text-foreground">{dist[String(n)] ?? 0}</span>
                      <span className="text-[10px] text-muted-foreground">{n}★</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-2">
              {recent.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">아직 받은 피드백이 없어요.</p>
              ) : (
                recent.map((r, i) => (
                  <Card key={i} className="bg-card border-border p-4 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-brand-amber font-black text-[14px] whitespace-nowrap">{"★".repeat(r.rating)}<span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span></span>
                        <span className="text-[13px] font-bold text-foreground truncate">{r.name}</span>
                        {r.platform && <span className="text-[10px] text-muted-foreground uppercase">{r.platform}</span>}
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                      </span>
                    </div>
                    {r.comment && <p className="text-[13px] text-foreground/80 leading-relaxed">{r.comment}</p>}
                  </Card>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
