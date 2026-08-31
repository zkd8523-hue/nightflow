import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import {
  DjCupCommentAdminList,
  type AdminCommentRow,
} from "@/components/admin/DjCupCommentAdminList";

// 숨김 처리 직후 목록이 바로 갱신되어야 한다.
export const dynamic = "force-dynamic";

export default async function AdminDjCupCommentsPage() {
  const supabase = await createClient();
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const { data, error } = await supabase.rpc("admin_list_dj_cup_comments", { p_limit: 200 });
  const rows = (data ?? []) as AdminCommentRow[];

  return (
    <div className="min-h-screen bg-background text-foreground pt-12 pb-24">
      <div className="max-w-4xl mx-auto px-6 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border hover:border-border transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">
              <MessageSquare className="w-3.5 h-3.5" />
              DJ Cup Comments
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter">DJ컵 댓글 관리</h1>
          <p className="text-muted-foreground font-medium">
            숨기면 목록에서 빠집니다. 지우는 게 아니라 되살릴 수 있어요.
          </p>
        </header>

        {error ? (
          <Card className="bg-card border-border p-6 text-red-400 text-sm">
            불러오기 실패 — 마이그레이션 621 적용 여부를 확인하세요.
          </Card>
        ) : (
          <DjCupCommentAdminList initialRows={rows} />
        )}
      </div>
    </div>
  );
}
