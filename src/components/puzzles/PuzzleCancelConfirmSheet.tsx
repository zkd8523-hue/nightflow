"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { PuzzleCancelReason } from "@/types/database";

const REASONS: { value: PuzzleCancelReason; label: string }[] = [
  { value: "schedule_change",    label: "일정·약속이 변경되었어요" },
  { value: "weak_offers",        label: "옵션이 마음에 들지 않아요" },
  { value: "no_preferred_venue", label: "마음에 드는 클럽이 없어요" },
  { value: "booked_elsewhere",   label: "다른 곳에서 예약했어요" },
];

// "다른 곳에서 예약" 선택 시 어디로 예약했는지(플랫폼 우회 채널 파악)
const BOOKED_VIA_OPTIONS = ["카카오톡", "인스타그램", "그 외"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  /** true 반환 시 취소 성공으로 간주 (일정 변경 시 재등록 제안 노출) */
  onConfirm: (reasons: PuzzleCancelReason[], reasonText: string | null) => Promise<boolean> | boolean;
  /** 조각(파티원 모집)이면 "깃발" → "조각" 문구로 전환 */
  shareMode?: boolean;
  /** "일정·약속 변경"으로 내렸을 때 새 날짜로 다시 꽂도록 연결할 경로 (없으면 제안 생략) */
  replantHref?: string;
  /** 재등록 제안에서 "목록으로" 선택 시 (시트 닫힐 때도 호출) */
  onGoList?: () => void;
}

export function PuzzleCancelConfirmSheet({ open, onOpenChange, submitting, onConfirm, shareMode = false, replantHref, onGoList }: Props) {
  const kind = shareMode ? "파티" : "깃발";
  const [selected, setSelected] = useState<PuzzleCancelReason | null>(null);
  const [text, setText] = useState("");
  // "다른 곳에서 예약" 선택 시 예약 채널
  const [bookedVia, setBookedVia] = useState<string | null>(null);
  // 'reasons' = 취소 사유 단계 / 'replant' = 일정 변경 후 재등록 제안 단계
  const [step, setStep] = useState<"reasons" | "replant">("reasons");
  const textRef = useRef<HTMLTextAreaElement>(null);

  // 막연한 피드백("옵션 별로"/"클럽 없음")은 직접 입력을 유도해 개선 데이터로 활용
  const DETAIL_PROMPTS: Partial<Record<PuzzleCancelReason, { hint: string; placeholder: string }>> = {
    weak_offers: {
      hint: "어떤 옵션이 아쉬우셨나요? 알려주시면 큰 도움이 돼요",
      placeholder: "예: 가격이 비싸요, 원하는 클럽이 없어요, 테이블 위치…",
    },
    no_preferred_venue: {
      hint: "어떤 클럽을 원하셨나요? 알려주시면 큰 도움이 돼요",
      placeholder: "예: 클럽 이름, 지역, 분위기 등을 적어주세요",
    },
  };
  const detail = selected ? DETAIL_PROMPTS[selected] : undefined;
  const wantsDetail = !!detail;

  useEffect(() => {
    if (open) {
      setSelected(null);
      setText("");
      setBookedVia(null);
      setStep("reasons");
    }
  }, [open]);

  // 취소는 언제나 바로 가능. 사유 입력은 전적으로 선택(원하는 사람만).
  const isSubmittable = !submitting;

  // 단일 선택 — 같은 항목 다시 누르면 해제
  const selectReason = (value: PuzzleCancelReason) => {
    setSelected((prev) => {
      const next = prev === value ? null : value;
      // 사유 바뀌면 예약 채널 선택 초기화
      if (next !== "booked_elsewhere") setBookedVia(null);
      // 막연한 사유("옵션 별로"/"클럽 없음") 선택 시 직접 입력으로 유도
      if (next && DETAIL_PROMPTS[next]) {
        setTimeout(() => textRef.current?.focus(), 50);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!isSubmittable) return;
    // "다른 곳에서 예약" 채널을 사유 텍스트 앞에 병기 (예: "예약처: 카카오톡 · 자유서술")
    const free = text.trim() || null;
    const composedText =
      selected === "booked_elsewhere" && bookedVia
        ? `예약처: ${bookedVia}${free ? ` · ${free}` : ""}`
        : free;
    const ok = await onConfirm(
      shareMode || !selected ? [] : [selected],
      shareMode ? null : composedText
    );
    // 일정 변경으로 내린 경우: 목록 이동 대신 새 날짜 재등록 제안
    if (ok && !shareMode && selected === "schedule_change" && replantHref) {
      setStep("replant");
    }
  };

  // 재등록 단계에서 시트를 닫으면 목록으로
  const handleOpenChange = (next: boolean) => {
    if (!next && step === "replant") {
      onGoList?.();
      return;
    }
    onOpenChange(next);
  };

  if (step === "replant") {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-card border-border pb-10 overflow-hidden"
        >
          <div className="space-y-5 pt-2">
            <div className="flex flex-col items-center gap-3 text-center px-2">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <Flag className="w-7 h-7 text-foreground" />
              </div>
              <p className="text-[20px] font-black text-foreground">일정이 바뀌셨군요</p>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                새로운 날짜로 다시 깃발을 꽂아보실래요?
              </p>
            </div>

            <div className="space-y-2 px-1">
              <Link
                href={replantHref ?? "#"}
                className="block w-full py-4 rounded-2xl bg-inverse text-inverse-foreground font-black text-[16px] text-center active:scale-[0.98] transition-all"
              >
                계속하기 ›
              </Link>
              <button
                type="button"
                onClick={() => { onGoList?.(); }}
                className="w-full py-3 text-[14px] text-muted-foreground hover:text-foreground transition-colors font-bold"
              >
                홈으로
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl bg-card border-border pb-10 overflow-hidden"
      >
        <div className="space-y-5 pt-2">
          {/* 헤더 */}
          <div className="space-y-1 text-center">
            <p className="text-[20px] font-black text-foreground">정말 {kind}을 내리시겠어요?</p>
            <p className="text-[13px] text-muted-foreground">
              {shareMode
                ? "제안한 파트너들에게 알림이 발송됩니다"
                : "이유를 알려주시면 서비스 개선에 큰 도움이 돼요. (선택)"}
            </p>
          </div>

          {/* 사유 옵션 (단일선택) — 깃발만. 전적으로 선택사항.
              하위 선택지가 있는 "다른 곳에서 예약"만 선택 시 나머지를 숨겨 집중(다시 누르면 복귀) */}
          {!shareMode && (
          <div className="space-y-2 px-1">
            {(selected === "booked_elsewhere" ? REASONS.filter((r) => r.value === selected) : REASONS).map(({ value, label }) => {
              const active = selected === value;
              return (
                <div key={value} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => selectReason(value)}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-[15px] font-bold transition-all border ${
                      active
                        ? "bg-inverse text-inverse-foreground border-white"
                        : "bg-card text-foreground/80 border-border"
                    }`}
                  >
                    {label}
                  </button>

                  {/* "다른 곳에서 예약" 선택 시 예약 채널 하위 선택 */}
                  {value === "booked_elsewhere" && active && (
                    <div className="flex gap-2 px-1 pb-1">
                      {BOOKED_VIA_OPTIONS.map((opt) => {
                        const on = bookedVia === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setBookedVia((p) => (p === opt ? null : opt))}
                            className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all border ${
                              on
                                ? "bg-amber-500 text-black border-amber-500"
                                : "bg-card text-muted-foreground border-border"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}

          {/* 자유서술 — 선택 여부와 무관하게 원하면 언제든 작성 가능 */}
          {!shareMode && (
            <div className="px-1">
              {detail && (
                <p className="text-[12px] text-brand-amber px-1 mb-2 font-medium">
                  {detail.hint}
                </p>
              )}
              <textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 300))}
                placeholder={detail ? detail.placeholder : "직접 입력하기"}
                rows={3}
                className={`w-full bg-card border rounded-2xl px-4 py-3 text-[14px] text-foreground placeholder-neutral-500 resize-none outline-none transition-colors ${
                  wantsDetail
                    ? "border-amber-500/60 focus:border-amber-500"
                    : "border-border focus:border-border"
                }`}
              />
              <p className="text-right text-[11px] text-muted-foreground mt-1">{text.length}/300</p>
            </div>
          )}

          {/* 액션 */}
          <div className="space-y-2 px-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isSubmittable}
              className="w-full py-4 rounded-2xl bg-red-500 text-white font-black text-[16px] disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              {submitting ? "처리 중…" : "계속하기"}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="w-full py-3 text-[14px] text-muted-foreground hover:text-foreground transition-colors font-bold"
            >
              ‹ 돌아가기
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
