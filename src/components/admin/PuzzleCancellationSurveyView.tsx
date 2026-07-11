import { createClient } from "@/lib/supabase/server";
import type { CancellationSurveyStatRow, PuzzleCancelReason, PuzzleSurveyTrigger } from "@/types/database";
import { DeleteSurveyButton } from "./DeleteSurveyButton";

interface Props {
  from: string;
  to: string;
  trigger: string;
  category: string;
  page: number;
}

const REASON_LABEL: Record<string, string> = {
  // 현재 취소 시트에 노출 중인 4개 (유저 화면과 문구 통일)
  schedule_change:    "일정·약속이 변경되었어요",
  weak_offers:        "옵션이 마음에 들지 않아요",
  no_preferred_venue: "마음에 드는 클럽이 없어요",
  booked_elsewhere:   "다른 곳에서 예약했어요",
  // 과거 응답 조회용 (현재 옵션에서는 제거됨)
  forgot_about_it:    "잊어버렸어요",
  mind_change:        "단순변심",
  other:              "기타",
  no_answer:          "넘어가기",
};

const TRIGGER_LABEL: Record<string, string> = {
  self_cancelled:    "직접 취소",
  selecting_expired: "선택 만료",
};

const PAGE_SIZE = 20;

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function PuzzleCancellationSurveyView({ from, to, trigger, category, page }: Props) {
  const supabase = await createClient();

  // 집계 통계 (사유별 카운트 — UNNEST 기반, 응답자 대비 비율)
  const { data: stats } = await supabase.rpc("admin_puzzle_cancellation_stats", {
    p_from: from,
    p_to: to,
    p_trigger: trigger || null,
  }) as { data: CancellationSurveyStatRow[] | null };

  // 트리거별 카운트 (요약 카드용) — 응답 행 단위. trigger 필터가 있으면 카드도 필터 반영
  let triggerStatsQuery = supabase
    .from("puzzle_cancellation_surveys")
    .select("trigger_type")
    .gte("responded_at", from)
    .lte("responded_at", to + "T23:59:59");
  if (trigger) triggerStatsQuery = triggerStatsQuery.eq("trigger_type", trigger as PuzzleSurveyTrigger);
  const { data: triggerStats } = await triggerStatsQuery;

  const totalResponses = (triggerStats || []).length;
  const triggerCountMap = (triggerStats || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.trigger_type] = (acc[r.trigger_type] || 0) + 1;
    return acc;
  }, {});
  const noAnswerCount = (stats || []).find((s) => s.reason_category === "no_answer")?.cnt ?? 0;

  // 응답 리스트
  const offset = (page - 1) * PAGE_SIZE;
  let listQuery = supabase
    .from("puzzle_cancellation_surveys")
    .select("id, puzzle_id, trigger_type, reason_categories, reason_text, responded_at, users(name)")
    .gte("responded_at", from)
    .lte("responded_at", to + "T23:59:59")
    .order("responded_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (trigger) listQuery = listQuery.eq("trigger_type", trigger as PuzzleSurveyTrigger);
  if (category) listQuery = listQuery.contains("reason_categories", [category as PuzzleCancelReason]);

  const { data: rows } = await listQuery;

  const maxBar = Math.max(...(stats || []).map((s) => Number(s.cnt)), 1);

  return (
    <div className="space-y-6">
      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "총 응답", value: totalResponses },
          { label: "직접 취소", value: triggerCountMap.self_cancelled ?? 0 },
          { label: "선택 만료", value: triggerCountMap.selecting_expired ?? 0 },
          { label: "이유 모름", value: Number(noAnswerCount) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#1C1C1E] rounded-2xl px-4 py-4 text-center">
            <p className="text-[28px] font-black text-white">{value}</p>
            <p className="text-[12px] text-neutral-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* 사유별 막대 */}
      {(stats || []).length > 0 && (
        <div className="bg-[#1C1C1E] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-black text-white">사유 분포</p>
            <p className="text-[10px] text-neutral-500">복수선택 가능 · 합계 100% 초과 가능</p>
          </div>
          {(stats || []).map((row) => (
            <div key={row.reason_category} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-neutral-300 truncate max-w-[60%]">
                  {row.label ?? REASON_LABEL[row.reason_category] ?? row.reason_category}
                </span>
                <span className="text-[12px] text-neutral-500 font-bold shrink-0">
                  {row.cnt}건 ({row.ratio}%)
                </span>
              </div>
              <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${(Number(row.cnt) / maxBar) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 응답 리스트 */}
      <div className="space-y-2">
        {(rows || []).length === 0 ? (
          <div className="text-center py-16 text-neutral-500">
            <p>해당 기간에 응답이 없습니다</p>
          </div>
        ) : (
          (rows || []).map((row) => (
            <div key={row.id} className="bg-[#1C1C1E] rounded-2xl px-4 py-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-bold text-white">
                    {(Array.isArray(row.users) ? row.users[0]?.name : (row.users as { name: string } | null)?.name) ?? "알 수 없음"}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                    {TRIGGER_LABEL[row.trigger_type] ?? row.trigger_type}
                  </span>
                  {(row.reason_categories ?? []).map((c: PuzzleCancelReason) => (
                    <span
                      key={c}
                      className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400"
                    >
                      {REASON_LABEL[c] ?? c}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-neutral-600">
                    {formatDatetime(row.responded_at)}
                  </span>
                  <DeleteSurveyButton surveyId={row.id} />
                </div>
              </div>
              {row.reason_text && (
                <p className="text-[12px] text-neutral-400 bg-neutral-900 rounded-xl px-3 py-2">
                  {row.reason_text}
                </p>
              )}
              <a
                href={`/flags/${row.puzzle_id}`}
                className="block text-[11px] text-amber-400 hover:underline"
              >
                깃발 상세 보기 →
              </a>
            </div>
          ))
        )}
      </div>

      {/* 페이지네이션 */}
      {(rows || []).length === PAGE_SIZE && (
        <div className="flex justify-center">
          <a
            href={`?tab=surveys&from=${from}&to=${to}${trigger ? `&trigger=${trigger}` : ""}${category ? `&category=${category}` : ""}&page=${page + 1}`}
            className="px-5 py-2 rounded-xl bg-neutral-800 text-neutral-300 text-[13px] font-bold hover:bg-neutral-700 transition-colors"
          >
            다음 페이지
          </a>
        </div>
      )}
    </div>
  );
}
