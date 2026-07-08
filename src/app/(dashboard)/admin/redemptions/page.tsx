import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, Gift } from "lucide-react";
import Link from "next/link";
import { RedemptionWorklist, type RewardGroup, type PersonAgg } from "@/components/admin/RedemptionWorklist";
import type { RewardRedemption } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminRedemptionsPage() {
  const supabase = await createClient();

  // 미들웨어가 auth + role 체크 후 헤더 전달 (없으면 직접 확인)
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  const { data: redemptions } = await supabase
    .from("reward_redemptions")
    .select("id, user_id, reward_code, reward_name, reward_type, stamp_cost, status, admin_note, fulfilled_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows: RewardRedemption[] = (redemptions as RewardRedemption[]) ?? [];

  // 유저 닉네임
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: users } = userIds.length
    ? await supabase.from("users").select("id, name, phone").in("id", userIds)
    : { data: [] };
  const userMap = new Map(
    (users ?? []).map((u) => [u.id, { name: u.name as string, phone: u.phone as string | null }])
  );

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  // 상품별 → 사람별 집계 (전화번호 발송 운영용)
  const groupMap = new Map<string, Map<string, PersonAgg>>();
  for (const r of pending) {
    let people = groupMap.get(r.reward_name);
    if (!people) {
      people = new Map();
      groupMap.set(r.reward_name, people);
    }
    const u = userMap.get(r.user_id);
    const person = people.get(r.user_id);
    if (person) {
      person.count += 1;
      person.ids.push(r.id);
      if (r.created_at > person.latestAt) person.latestAt = r.created_at;
    } else {
      people.set(r.user_id, {
        userId: r.user_id,
        name: u?.name ?? "(탈퇴 유저)",
        phone: u?.phone ?? null,
        count: 1,
        ids: [r.id],
        latestAt: r.created_at,
      });
    }
  }
  const groups: RewardGroup[] = [...groupMap.entries()]
    .map(([rewardName, people]) => {
      const arr = [...people.values()].sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
      return {
        rewardName,
        total: arr.reduce((s, p) => s + p.count, 0),
        people: arr,
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="p-2 -ml-2 hover:bg-neutral-800 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight">스탬프 보상 발행</h1>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              처리 대기 {pending.length}건 · 전체 {rows.length}건
            </p>
          </div>
        </div>

        {/* 처리 대기 — 상품별 → 사람별(전화번호·개수) 워크리스트 */}
        <h2 className="text-[13px] font-black text-neutral-300 px-1 mb-3">
          처리 대기 · 상품별
        </h2>
        {pending.length === 0 ? (
          <div className="text-center py-12 space-y-2 mb-8">
            <Gift className="w-9 h-9 text-neutral-700 mx-auto" />
            <p className="text-[14px] font-bold text-neutral-400">대기 중인 발행이 없습니다</p>
          </div>
        ) : (
          <div className="mb-8">
            <RedemptionWorklist groups={groups} />
          </div>
        )}

        {/* 처리 완료/취소 (최근) */}
        {done.length > 0 && (
          <>
            <h2 className="text-[13px] font-black text-neutral-300 px-1 mb-3">처리 완료 · 취소</h2>
            <div className="space-y-2">
              {done.slice(0, 100).map((r) => {
                const u = userMap.get(r.user_id);
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/60 bg-[#141414] px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-white truncate">
                        {r.reward_name}
                        <span className="text-neutral-500 font-normal"> · {u?.name ?? "?"}</span>
                      </div>
                      {r.admin_note && (
                        <div className="text-[11px] text-neutral-500 truncate mt-0.5">📝 {r.admin_note}</div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-black ${
                        r.status === "fulfilled"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-neutral-700/40 text-neutral-400"
                      }`}
                    >
                      {r.status === "fulfilled" ? "지급완료" : "취소·환불"}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
