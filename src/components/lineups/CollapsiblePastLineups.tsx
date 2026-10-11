"use client";

import { useState, Children } from "react";
import { ChevronDown } from "lucide-react";

const PAGE = 10;

/**
 * "지난 라인업" 접기 + 10개씩 더보기.
 *
 * 카드 자체는 서버(page.tsx의 DateCard)에서 그려 children 으로 받는다 —
 * 링크·날짜 포맷·DJ 이름이 전부 서버 데이터라 클라이언트로 옮길 이유가 없고,
 * 여기서는 몇 개를 보여줄지만 정한다.
 *
 * 왜 접는가: 오래 연 클럽은 지난 라인업이 수십 건이라 페이지가 그만큼 길어지고,
 * 그 아래 있는 것(지역 라인업 링크·아티클 구독)까지 사실상 안 보인다.
 * 지난 라인업은 "찾아보는" 정보지 "훑는" 정보가 아니라 기본은 접어둔다.
 */
export function CollapsiblePastLineups({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);

  if (items.length === 0) return null;

  const visible = open ? items.slice(0, shown) : [];
  const rest = items.length - shown;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between w-full py-1"
      >
        <span className="text-sm font-bold text-foreground">
          지난 라인업{" "}
          <span className="text-muted-foreground font-semibold">{items.length}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="space-y-2">
          {visible}

          {rest > 0 && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="block w-full text-center text-[12px] font-bold text-muted-foreground hover:text-foreground py-2.5 rounded-xl bg-[#1C1C1E]"
            >
              {rest}개 더 보기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
