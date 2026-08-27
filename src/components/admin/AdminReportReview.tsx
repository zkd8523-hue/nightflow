"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Sparkles, Pencil, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * 라인업 제보 검토 화면.
 *
 * 왜 필요한가(2026-08-27 발견): 유저 제보(lineup_reports)는 저장·관리자 푸시까지
 * 되는데 검토할 화면이 없었다. 제보 시트는 "확인 후 등록해드릴게요"라고 약속하는데
 * 지킬 방법이 없는 상태로 나가 있었다.
 *
 * 설계(사용자 결정): 이미지는 기본적으로 파싱하지 않는다 — Vision 1건 35원
 * (실측: 입력 7,074 + 출력 254 토큰)이라 제보가 늘면 그대로 비용이 된다.
 * 관리자가 필요하다고 판단할 때만 "파싱" 버튼을 눌러 과금한다. 이름 몇 개뿐인
 * 단순 포스터는 "직접 입력"으로 0원에 처리하는 게 더 빠르다.
 *
 * 파싱/직접입력 둘 다 결과는 기존 /admin/lineups 검토 큐(lineup_drafts)로
 * 들어간다 — 편집·게시 UI를 새로 만들지 않고 AdminLineupEditor를 그대로 쓴다.
 * (parse-poster API가 origin='report' + source_report_id를 채워 저장한다.)
 */

export interface LineupReportItem {
  id: string;
  created_at: string;
  image_urls: string[];
  memo: string | null;
  reporter_id: string;
  reporter_name: string | null;
}

interface ClubOption {
  id: string;
  name: string;
  area: string | null;
}

const PARSE_COST_LABEL = "약 35원";

export function AdminReportReview({
  reports: initialReports,
  clubs,
}: {
  reports: LineupReportItem[];
  clubs: ClubOption[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manualPickId, setManualPickId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const removeReport = (id: string) => setReports((prev) => prev.filter((r) => r.id !== id));

  const markStatus = async (
    id: string,
    status: "published" | "rejected",
    extra: Record<string, unknown> = {}
  ) => {
    const supabase = createClient();
    const { error } = await supabase.from("lineup_reports").update({ status, ...extra }).eq("id", id);
    if (error) {
      toast.error("상태 갱신에 실패했어요");
      return false;
    }
    return true;
  };

  const handleParse = async (report: LineupReportItem) => {
    setBusyId(report.id);
    try {
      const res = await fetch("/api/admin/lineups/parse-poster", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrls: report.image_urls, sourceReportId: report.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "파싱에 실패했어요");
        return;
      }
      if (data.reason === "club_unresolved") {
        // 클럽 자동 매칭 실패 — 직접 입력 흐름(클럽 선택)으로 넘긴다.
        // pendingParse는 여기서 안 쓴다(재파싱은 관리자가 다시 "파싱"을 눌러야
        // 함 — 기존 AdminLineupEditor 미매칭 처리와 같은 방식).
        toast.info("클럽을 못 찾았어요. 직접 입력으로 클럽을 골라주세요.");
        setManualPickId(report.id);
        return;
      }
      if (!data.draftId) {
        toast.info(`파싱 결과가 없어요 (${data.reason ?? "unparsed"}). 직접 입력해주세요.`);
        return;
      }
      toast.success("파싱 완료 — 검토 큐에 추가됐어요");
      removeReport(report.id);
      // 새로 만들어진 lineup_drafts 행이 /admin/lineups 검토 큐에 이미 있으므로
      // 여기서 이동만 시킨다. 편집 UI를 새로 안 만든다.
      window.location.href = "/admin/lineups";
    } catch {
      toast.error("파싱 중 오류가 발생했어요");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    setBusyId(rejectId);
    const ok = await markStatus(rejectId, "rejected", { reject_reason: rejectReason.trim() || null });
    if (ok) {
      toast.success("반려했어요");
      removeReport(rejectId);
    }
    setBusyId(null);
    setRejectId(null);
    setRejectReason("");
  };

  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        검토 대기 중인 제보가 없어요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="bg-[#1C1C1E] rounded-2xl p-3 flex gap-3">
          <div className="relative flex-shrink-0 w-16 h-16">
            {r.image_urls.slice(0, 3).map((url, i) => (
              <div
                key={url}
                className="absolute top-0 left-0 w-14 h-14 rounded-lg border border-border overflow-hidden bg-muted"
                style={{
                  transform: `translate(${i * 5}px, ${i * 3}px) rotate(${i * 3}deg)`,
                  zIndex: r.image_urls.length - i,
                }}
              >
                <Image src={url} alt="" fill className="object-cover" unoptimized />
              </div>
            ))}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{r.reporter_name ?? "익명"}</span>
              <span>·</span>
              <span>{new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <span>·</span>
              <span>이미지 {r.image_urls.length}장</span>
            </div>
            {r.memo && <p className="mt-1 text-[13px] text-foreground">{r.memo}</p>}
            <a
              href={r.image_urls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              원본 보기
            </a>

            {manualPickId === r.id ? (
              <ClubPicker
                clubs={clubs}
                busy={busyId === r.id}
                onCancel={() => setManualPickId(null)}
                onPick={async (clubId) => {
                  setBusyId(r.id);
                  try {
                    const res = await fetch("/api/admin/lineups/create-draft", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ clubId, sourceReportId: r.id }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.draftId) {
                      toast.error(data.error ?? "생성에 실패했어요");
                      return;
                    }
                    removeReport(r.id);
                    window.location.href = "/admin/lineups";
                  } finally {
                    setBusyId(null);
                    setManualPickId(null);
                  }
                }}
              />
            ) : (
              <div className="mt-2 flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.id}
                  onClick={() => handleParse(r)}
                  className="h-7 px-2.5 text-[11px] gap-1 border-sky-500/40 text-sky-400 hover:bg-sky-500/10"
                >
                  {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  파싱 <span className="text-muted-foreground">({PARSE_COST_LABEL})</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.id}
                  onClick={() => setManualPickId(r.id)}
                  className="h-7 px-2.5 text-[11px] gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  직접 입력
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === r.id}
                  onClick={() => setRejectId(r.id)}
                  className="h-7 px-2.5 text-[11px] gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <X className="w-3 h-3" />
                  반려
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setRejectId(null)}>
          <div
            className="w-full max-w-lg bg-[#1C1C1E] rounded-t-3xl p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-bold mb-2">반려 사유 (선택)</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="예: 이미 등록된 라인업이에요"
              rows={2}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[13px] resize-none focus:outline-none focus:border-amber-500/50"
            />
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setRejectId(null)} className="flex-1">
                취소
              </Button>
              <Button size="sm" onClick={handleReject} className="flex-1 bg-red-500 hover:bg-red-400 text-white">
                반려하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClubPicker({
  clubs,
  onPick,
  onCancel,
  busy,
}: {
  clubs: ClubOption[];
  onPick: (clubId: string) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? clubs.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 20)
    : clubs.slice(0, 20);

  return (
    <div className="mt-2 bg-card rounded-lg p-2 border border-border">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="클럽 검색"
        className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-[12px] mb-1.5 focus:outline-none"
      />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {filtered.map((c) => (
          <button
            key={c.id}
            disabled={busy}
            onClick={() => onPick(c.id)}
            className="w-full text-left px-2 py-1.5 rounded text-[12px] hover:bg-white/5 disabled:opacity-50"
          >
            {c.name} <span className="text-muted-foreground">{c.area}</span>
          </button>
        ))}
      </div>
      <button onClick={onCancel} className="mt-1.5 text-[11px] text-muted-foreground">
        취소
      </button>
    </div>
  );
}
