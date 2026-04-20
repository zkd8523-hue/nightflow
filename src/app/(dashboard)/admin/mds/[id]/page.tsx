import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { MDHealthScore, MDSanction, User } from "@/types/database";
import { computeHealthStatus, getGradeLabel } from "@/lib/utils/mdHealth";
import { MDHealthBadge } from "@/components/admin/MDHealthBadge";
import { MDSanctionPanel } from "@/components/admin/MDSanctionPanel";
import { formatPrice } from "@/lib/utils/format";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

export default async function MDDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userData?.role !== "admin") redirect("/");

  // MD 유저 정보 조회 (기본 + 제재 상태)
  const { data: mdUser } = await supabase
    .from("users")
    .select("id, name, display_name, area, md_status, created_at, role")
    .eq("id", id)
    .single();

  if (!mdUser || (mdUser.role !== "md" && mdUser.md_status === null)) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-400 mb-4">MD를 찾을 수 없습니다</p>
          <Link href="/admin/mds" className="text-white underline">
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  // MD Health Score 조회 (선택적 - 없으면 기본 정보만 표시)
  const { data: mdData } = await supabase
    .from("md_health_scores")
    .select("*")
    .eq("md_id", id)
    .single<MDHealthScore>();

  // 제재 이력 조회
  const { data: sanctions } = await supabase
    .from("md_sanctions")
    .select("*")
    .eq("md_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  // MD 경매 내역 조회
  const { data: auctions } = await supabase
    .from("auctions")
    .select("id, status, start_price, current_bid, bid_count, created_at, auction_date")
    .eq("md_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const hasHealthData = !!mdData;
  const status = hasHealthData ? computeHealthStatus(mdData) : undefined;
  const lastActive = mdData?.last_auction_date
    ? dayjs(mdData.last_auction_date).fromNow()
    : "활동 없음";

  const metrics = hasHealthData
    ? [
        { label: "총 경매", value: `${mdData.total_auctions}건`, color: "text-white" },
        { label: "낙찰", value: `${mdData.won_auctions}건`, color: "text-white" },
        {
          label: "낙찰 총액",
          value: mdData.total_won_amount > 0 ? formatPrice(mdData.total_won_amount) : "—",
          color: "text-green-500",
        },
        {
          label: "낙찰률",
          value: mdData.total_auctions > 0 ? `${mdData.sell_through_rate}%` : "—",
          color:
            mdData.sell_through_rate >= 60
              ? "text-green-500"
              : mdData.sell_through_rate >= 40
                ? "text-amber-500"
                : mdData.total_auctions > 0
                  ? "text-red-500"
                  : "text-neutral-600",
        },
        {
          label: "노쇼",
          value: `${mdData.noshow_count}건`,
          color: mdData.noshow_count > 0 ? "text-red-500" : "text-neutral-600",
        },
        {
          label: "방문확인률",
          value: mdData.confirm_rate > 0 ? `${mdData.confirm_rate}%` : "—",
          color: "text-white",
        },
        {
          label: "취소율",
          value: mdData.total_auctions > 0 ? `${mdData.cancel_rate}%` : "—",
          color:
            mdData.cancel_rate > 25
              ? "text-red-500"
              : mdData.cancel_rate > 10
                ? "text-amber-500"
                : "text-white",
        },
        { label: "마지막 활동", value: lastActive, color: mdData.flag_dormant ? "text-red-500" : "text-white" },
      ]
    : [];

  const statusMap: Record<string, { label: string; color: string }> = {
    active: { label: "진행중", color: "text-green-500" },
    won: { label: "낙찰", color: "text-green-500" },
    unsold: { label: "유찰", color: "text-neutral-500" },
    cancelled: { label: "취소", color: "text-red-500" },
    scheduled: { label: "예정", color: "text-amber-500" },
    draft: { label: "초안", color: "text-neutral-600" },
    confirmed: { label: "방문확인", color: "text-green-500" },
  };

  const mdName = mdData?.name || mdUser.display_name || mdUser.name || "알 수 없음";
  const mdArea = mdData?.area || mdUser.area || "미지정";

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-12 pb-24">
      <div className="max-w-3xl mx-auto px-6 space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/mds"
              className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-neutral-400" />
            </Link>
            <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase tracking-widest text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5" />
              MD Detail
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center text-xl font-black text-white">
              {mdName[0] || "?"}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black">{mdName} MD</h1>
                {status && <MDHealthBadge status={status} size="md" />}
                {mdUser.md_status === "suspended" && (
                  <span className="text-[10px] font-black text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                    SUSPENDED
                  </span>
                )}
                {mdUser.md_status === "revoked" && (
                  <span className="text-[10px] font-black text-neutral-500 bg-neutral-500/10 px-2 py-0.5 rounded-full">
                    REVOKED
                  </span>
                )}
              </div>
              <div className="text-neutral-400 text-sm">
                {mdArea}
                {hasHealthData && <> · {getGradeLabel(mdData.grade)}</>}
                {" · "}가입 {dayjs(mdData?.joined_at || mdUser.created_at).fromNow()}
              </div>
            </div>
            {hasHealthData && mdData.health_score !== null && (
              <div className="text-right">
                <div className="text-3xl font-black text-white">
                  {mdData.health_score}
                </div>
                <div className="text-xs text-neutral-500">Health Score</div>
              </div>
            )}
          </div>
        </div>

        {/* Performance Grid 4x2 */}
        {metrics.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {metrics.map((m) => (
              <Card
                key={m.label}
                className="bg-[#1C1C1E] border-neutral-800 p-3 text-center"
              >
                <div className="text-xs text-neutral-500 mb-1">{m.label}</div>
                <div className={`text-sm font-bold ${m.color}`}>{m.value}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Red Flags */}
        {hasHealthData && (mdData.flag_consecutive_noshow || mdData.flag_dormant) && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-2">
            <div className="font-bold text-red-500 text-sm">Red Flag</div>
            {mdData.flag_consecutive_noshow && (
              <div className="text-sm text-red-400">
                · 7일 이내 노쇼 2건 이상 발생
              </div>
            )}
            {mdData.flag_dormant && (
              <div className="text-sm text-red-400">
                · 30일 이상 경매 미등록 (휴면 상태)
              </div>
            )}
          </div>
        )}

        {/* Sanction Panel */}
        <MDSanctionPanel
          mdId={id}
          mdName={mdName}
          mdStatus={mdUser.md_status || "approved"}
          mdSuspendedUntil={null}
          sanctions={(sanctions as MDSanction[]) || []}
        />

        {/* Auction History */}
        <div className="space-y-3">
          <h2 className="text-lg font-black">경매 내역</h2>
          {auctions && auctions.length > 0 ? (
            <div className="space-y-2">
              {(auctions as Array<{
                id: string;
                status: string;
                current_bid?: number;
                start_price?: number;
                auction_date?: string;
                created_at?: string;
                bid_count?: number;
              }>).map((a) => {
                const s = statusMap[a.status] || {
                  label: a.status,
                  color: "text-neutral-500",
                };
                return (
                  <div
                    key={a.id}
                    className="bg-[#1C1C1E] rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm text-neutral-400">
                        {dayjs(a.auction_date || a.created_at).format(
                          "M/D (ddd)",
                        )}
                      </div>
                      <div className="text-sm text-white">
                        시작가 {formatPrice(a.start_price || 0)}
                        {(a.current_bid || 0) > 0 &&
                          ` → ${formatPrice(a.current_bid!)}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${s.color}`}>
                        {s.label}
                      </div>
                      <div className="text-xs text-neutral-600">
                        입찰 {a.bid_count || 0}건
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500">
              경매 내역이 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
