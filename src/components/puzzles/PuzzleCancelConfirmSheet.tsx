"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { PuzzleCancelReason } from "@/types/database";

const REASONS: { value: PuzzleCancelReason; label: string }[] = [
  { value: "schedule_change",    label: "일정·약속이 변경되었어요" },
  { value: "weak_offers",        label: "옵션이 마음에 들지 않아요" },
  { value: "no_preferred_venue", label: "마음에 드는 클럽이 없어요" },
  { value: "booked_elsewhere",   label: "다른 곳에서 예약했어요" },
  { value: "other",              label: "기타 (직접 입력)" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  onConfirm: (reasons: PuzzleCancelReason[], reasonText: string | null) => Promise<void> | void;
  /** 조각(파티원 모집)이면 "깃발" → "조각" 문구로 전환 */
  shareMode?: boolean;
}

export function PuzzleCancelConfirmSheet({ open, onOpenChange, submitting, onConfirm, shareMode = false }: Props) {
  const kind = shareMode ? "조각" : "깃발";
  const [selected, setSelected] = useState<Set<PuzzleCancelReason>>(new Set());
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setText("");
    }
  }, [open]);

  const hasOther = selected.has("other");
  // 조각은 설문 없이 단순 확인(항상 활성). 깃발은 사유 선택 필수.
  const isSubmittable = shareMode
    ? !submitting
    : selected.size > 0 && !(hasOther && !text.trim()) && !submitting;

  const toggleReason = (value: PuzzleCancelReason) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
        if (value === "other") setText("");
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!isSubmittable) return;
    await onConfirm(
      shareMode ? [] : Array.from(selected),
      shareMode ? null : text.trim() || null
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl bg-[#1C1C1E] border-neutral-700 pb-10 overflow-hidden"
      >
        <div className="space-y-5 pt-2">
          {/* 헤더 — 망설이게 만드는 톤 */}
          <div className="space-y-1 text-center">
            <p className="text-[20px] font-black text-white">정말 {kind}을 내리시겠어요?</p>
            <p className="text-[13px] text-neutral-400">
              제안한 파트너들에게 알림이 발송됩니다
            </p>
          </div>

          {/* 사유 옵션 (복수선택) — 깃발만. 조각은 설문 없이 단순 확인 */}
          {!shareMode && (
          <div className="space-y-2 px-1">
            <p className="text-[12px] text-neutral-500 px-1">이유를 선택해주세요 (여러 개 선택 가능)</p>
            {REASONS.map(({ value, label }) => {
              const active = selected.has(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleReason(value)}
                  className={`w-full text-left px-4 py-3 rounded-2xl text-[15px] font-bold transition-all border ${
                    active
                      ? "bg-white text-black border-white"
                      : "bg-neutral-900 text-neutral-300 border-neutral-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          )}

          {/* 자유서술 */}
          {selected.size > 0 && (
            <div className="px-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 300))}
                placeholder={
                  hasOther
                    ? "어떤 점이 아쉬우셨는지 알려주세요 (필수)"
                    : "더 알려주실 게 있다면 적어주세요 (선택)"
                }
                rows={3}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-2xl px-4 py-3 text-[14px] text-white placeholder-neutral-500 resize-none outline-none focus:border-neutral-500"
              />
              <p className="text-right text-[11px] text-neutral-600 mt-1">{text.length}/300</p>
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
              {submitting ? "처리 중…" : `${kind} 내리기`}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="w-full py-3 text-[14px] text-neutral-400 hover:text-white transition-colors font-bold"
            >
              오퍼 더 받아보기
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
