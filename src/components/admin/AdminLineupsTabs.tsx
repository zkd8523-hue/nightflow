"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminLineupEditor, type DraftListItem, type ClubOption } from "@/components/admin/AdminLineupEditor";
import { AdminReportReview, type LineupReportItem } from "@/components/admin/AdminReportReview";

/**
 * /admin/lineups 상단 탭 — "검토 큐"(기존 AdminLineupEditor)와 "제보"(신규).
 * 제보 쪽에서 파싱/직접입력을 마치면 lineup_drafts에 행이 생기고 이 페이지로
 * 되돌아오므로, 그 결과가 검토 큐 탭에 바로 보이도록 links만 갈아끼운다
 * (두 컴포넌트는 서로의 상태를 몰라도 된다 — lineup_drafts가 유일한 연결점).
 */
export function AdminLineupsTabs({
  clubs,
  initialDrafts,
  initialReports,
}: {
  clubs: ClubOption[];
  initialDrafts: DraftListItem[];
  initialReports: LineupReportItem[];
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"queue" | "reports">(
    searchParams.get("tab") === "reports" ? "reports" : "queue"
  );

  useEffect(() => {
    if (searchParams.get("tab") === "reports") setTab("reports");
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="flex bg-[#1C1C1E] rounded-lg p-[3px]" role="tablist">
          {(["queue", "reports"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-md text-[13px] font-bold transition-colors ${
                tab === t ? "bg-[#38383c] text-foreground" : "text-muted-foreground"
              }`}
            >
              {t === "queue" ? (
                "검토 큐"
              ) : (
                <>
                  제보
                  {initialReports.length > 0 && (
                    <span className="ml-1 text-[10px] text-amber-400">{initialReports.length}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {tab === "queue" ? (
          <AdminLineupEditor clubs={clubs} initialDrafts={initialDrafts} />
        ) : (
          <AdminReportReview reports={initialReports} clubs={clubs} />
        )}
      </div>
    </div>
  );
}
