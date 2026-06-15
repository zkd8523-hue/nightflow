import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, Ban, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  inappropriate_content: { label: "부적절 콘텐츠", color: "bg-red-500/20 text-red-400" },
  scam_suspect: { label: "사기 의심", color: "bg-orange-500/20 text-orange-400" },
  harassment: { label: "불쾌한 응대", color: "bg-amber-500/20 text-amber-400" },
  spam: { label: "스팸/반복", color: "bg-purple-500/20 text-purple-400" },
  other: { label: "기타", color: "bg-neutral-700/30 text-neutral-300" },
};

const SHOW_LIMIT = 200;

export default async function AdminUserBlocksPage() {
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

  // 차단 목록 조회 (최신순)
  const { data: blocks } = await supabase
    .from("user_blocks")
    .select("id, blocker_id, blocked_id, reason, memo, created_at")
    .order("created_at", { ascending: false })
    .limit(SHOW_LIMIT);

  const blockerIds = [...new Set((blocks || []).map((b) => b.blocker_id))];
  const blockedIds = [...new Set((blocks || []).map((b) => b.blocked_id))];
  const userIds = [...new Set([...blockerIds, ...blockedIds])];

  const { data: users } = userIds.length > 0
    ? await supabase
        .from("users")
        .select("id, name, display_name, role, md_status, is_blocked, strike_count")
        .in("id", userIds)
    : { data: [] };

  const userMap = new Map(
    (users || []).map((u) => [u.id, u])
  );

  // 피차단자(blocked_id)별 누적 카운트
  const blockedCountMap = new Map<string, number>();
  (blocks || []).forEach((b) => {
    blockedCountMap.set(b.blocked_id, (blockedCountMap.get(b.blocked_id) || 0) + 1);
  });

  // 통계
  const total = blocks?.length || 0;
  const last24h = (blocks || []).filter((b) => {
    const ts = new Date(b.created_at).getTime();
    return Date.now() - ts < 24 * 60 * 60 * 1000;
  }).length;
  const dangerUsers = Array.from(blockedCountMap.entries()).filter(
    ([, count]) => count >= 3
  ).length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/admin"
            className="p-2 -ml-2 hover:bg-neutral-800 rounded-xl transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight">사용자 차단 관리</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              유저가 신고한 차단 사유 모니터링 · 최근 {SHOW_LIMIT}건
            </p>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
            <p className="text-2xl font-black text-white">{total}</p>
            <p className="text-[11px] text-neutral-500 font-medium mt-1">전체 차단</p>
          </Card>
          <Card className="bg-[#1C1C1E] border-neutral-800/50 p-4 text-center">
            <p className="text-2xl font-black text-amber-400">{last24h}</p>
            <p className="text-[11px] text-neutral-500 font-medium mt-1">최근 24h</p>
          </Card>
          <Card
            className={`p-4 text-center border ${
              dangerUsers > 0
                ? "bg-red-500/10 border-red-500/40"
                : "bg-[#1C1C1E] border-neutral-800/50"
            }`}
          >
            <p
              className={`text-2xl font-black ${
                dangerUsers > 0 ? "text-red-400" : "text-neutral-600"
              }`}
            >
              {dangerUsers}
            </p>
            <p className="text-[11px] text-neutral-500 font-medium mt-1">
              3회 이상 차단
            </p>
          </Card>
        </div>

        {/* 위험 사용자 강조 섹션 */}
        {dangerUsers > 0 && (
          <Card className="bg-red-500/5 border-red-500/30 p-4 mb-5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[13px] font-bold text-red-300 mb-2">
                  3명 이상의 유저에게 차단당한 사용자 ({dangerUsers}명)
                </p>
                <div className="space-y-1.5">
                  {Array.from(blockedCountMap.entries())
                    .filter(([, count]) => count >= 3)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([uid, count]) => {
                      const u = userMap.get(uid) as
                        | {
                            display_name?: string | null;
                            name?: string | null;
                            role?: string;
                            is_blocked?: boolean;
                          }
                        | undefined;
                      const display =
                        u?.display_name || u?.name || uid.slice(0, 8);
                      return (
                        <div
                          key={uid}
                          className="flex items-center justify-between bg-black/30 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-white">
                              {display}
                            </span>
                            {u?.role && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded">
                                {u.role.toUpperCase()}
                              </span>
                            )}
                            {u?.is_blocked && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-red-500/30 text-red-300 rounded font-bold">
                                정지됨
                              </span>
                            )}
                          </div>
                          <Link
                            href={`/admin/users?q=${uid}`}
                            className="text-[12px] font-bold text-red-300 hover:text-red-200"
                          >
                            {count}회 →
                          </Link>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* 차단 목록 */}
        {!blocks || blocks.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Ban className="w-10 h-10 text-neutral-700 mx-auto" />
            <p className="text-[15px] font-bold text-neutral-400">
              아직 차단 기록이 없습니다
            </p>
            <p className="text-[12px] text-neutral-600">
              유저가 다른 사용자를 차단하면 여기에 표시됩니다
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {blocks.map((block) => {
              const blocker = userMap.get(block.blocker_id) as
                | {
                    display_name?: string | null;
                    name?: string | null;
                  }
                | undefined;
              const blocked = userMap.get(block.blocked_id) as
                | {
                    display_name?: string | null;
                    name?: string | null;
                    role?: string;
                    is_blocked?: boolean;
                  }
                | undefined;

              const reasonMeta =
                REASON_LABELS[block.reason] || REASON_LABELS.other;
              const blockedTotal = blockedCountMap.get(block.blocked_id) || 0;
              const isHighRisk = blockedTotal >= 3;

              return (
                <Card
                  key={block.id}
                  className={`p-4 border ${
                    isHighRisk
                      ? "bg-red-500/5 border-red-500/30"
                      : "bg-[#1C1C1E] border-neutral-800/50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${reasonMeta.color}`}
                      >
                        {reasonMeta.label}
                      </span>
                      {isHighRisk && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-500/30 text-red-300 rounded font-bold">
                          ⚠ {blockedTotal}회 차단됨
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-neutral-600 font-medium">
                      {new Date(block.created_at).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[13px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-500 font-medium w-12">
                        피차단
                      </span>
                      <span className="text-white font-bold">
                        {blocked?.display_name ||
                          blocked?.name ||
                          block.blocked_id.slice(0, 8)}
                      </span>
                      {blocked?.role && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded">
                          {blocked.role.toUpperCase()}
                        </span>
                      )}
                      <Link
                        href={`/admin/users?q=${block.blocked_id}`}
                        className="ml-auto text-[11px] text-amber-400 hover:text-amber-300 font-bold"
                      >
                        프로필 →
                      </Link>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-500 font-medium w-12">
                        차단자
                      </span>
                      <span className="text-neutral-300">
                        {blocker?.display_name ||
                          blocker?.name ||
                          block.blocker_id.slice(0, 8)}
                      </span>
                    </div>
                    {block.memo && (
                      <div className="mt-2 p-2.5 bg-black/30 rounded-lg border border-neutral-800/50">
                        <p className="text-[12px] text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                          {block.memo}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
