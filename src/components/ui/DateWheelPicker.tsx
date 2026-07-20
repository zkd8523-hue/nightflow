"use client";

import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 연/월/일 3단 휠 피커 (iOS 스타일)
 * - value: 숫자 문자열 "YYYYMMDD" (미완성이면 8자리 미만). 기존 SignupForm의 birthdayInput 계약과 동일.
 * - onChange: 스크롤로 선택이 바뀔 때마다 "YYYYMMDD" 8자리 문자열 반환.
 *
 * 스크롤 스냅 기반. 각 컬럼은 세로 스크롤되며 가운데 하이라이트 박스에 걸린 값이 선택값.
 */

const ITEM_HEIGHT = 44; // px, 각 항목 높이
const VISIBLE = 5; // 보이는 항목 수 (홀수 → 가운데 1칸이 선택)
const PAD = Math.floor(VISIBLE / 2); // 위아래 여백 칸 수

interface DateWheelPickerProps {
  value: string;
  onChange: (yyyymmdd: string) => void;
  /** 선택 가능한 가장 최근(어린) 연도. 기본: 올해 - 19 (만 19세) */
  maxYear?: number;
  /** 선택 가능한 가장 오래된 연도. 기본: 올해 - 80 */
  minYear?: number;
  /** 아무 값도 없을 때 처음 스냅될 연도. 기본: 올해 - 25 */
  defaultYear?: number;
  className?: string;
}

interface WheelColumnProps {
  items: number[];
  selected: number;
  onSelect: (value: number) => void;
  format: (n: number) => string;
  ariaLabel: string;
}

function WheelColumn({ items, selected, onSelect, format, ariaLabel }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 프로그램적 스크롤(외부 값 변경/스냅 보정)과 사용자 스크롤을 구분하기 위한 가드
  const programmatic = useRef(false);

  const selectedIndex = Math.max(0, items.indexOf(selected));

  // 외부 selected 변경 시 해당 위치로 스크롤 정렬
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 1) {
      programmatic.current = true;
      el.scrollTop = target;
      // 스크롤 이벤트가 한 틱 뒤 발생하므로 다음 프레임에 가드 해제
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmatic.current = false;
        });
      });
    }
  }, [selectedIndex, items.length]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el || programmatic.current) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.min(items.length - 1, Math.max(0, idx));
      const val = items[clamped];
      if (val !== selected) onSelect(val);
      // 스냅 위치로 부드럽게 보정
      const target = clamped * ITEM_HEIGHT;
      if (Math.abs(el.scrollTop - target) > 1) {
        el.scrollTo({ top: target, behavior: "smooth" });
      }
    }, 120);
  }, [items, selected, onSelect]);

  // 마우스 클릭-드래그로 휠 굴리기 (데스크톱). 터치는 네이티브 스크롤 사용.
  const drag = useRef<{ startY: number; startTop: number; moved: boolean } | null>(null);
  // 드래그 중에는 scroll-snap을 꺼야 scrollTop 직접 조작이 매끄러움
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 터치/펜은 브라우저 네이티브 스크롤에 맡김
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    drag.current = { startY: e.clientY, startTop: el.scrollTop, moved: false };
    setDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 3) d.moved = true;
    el.scrollTop = d.startTop - dy;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const el = ref.current;
    if (el) { try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ } }
    setDragging(false);
    // 드래그 종료 후 스냅 보정 발동 (snap 재적용 이후 스크롤되도록 다음 프레임에)
    requestAnimationFrame(() => handleScroll());
    // moved 플래그는 클릭 핸들러가 참조한 뒤 초기화되도록 다음 틱에 해제
    setTimeout(() => { drag.current = null; }, 0);
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="listbox"
      aria-label={ariaLabel}
      className="relative flex-1 overflow-y-scroll scrollbar-hide cursor-grab active:cursor-grabbing"
      style={{
        height: ITEM_HEIGHT * VISIBLE,
        scrollSnapType: dragging ? "none" : "y mandatory",
      }}
    >
      {/* 위 여백 */}
      <div style={{ height: ITEM_HEIGHT * PAD }} aria-hidden />
      {items.map((n) => {
        const isSel = n === selected;
        return (
          <div
            key={n}
            role="option"
            aria-selected={isSel}
            onClick={() => {
              // 드래그로 굴린 직후의 클릭은 무시 (의도치 않은 점프 방지)
              if (drag.current?.moved) return;
              onSelect(n);
            }}
            className={cn(
              "flex items-center justify-center snap-center tabular-nums cursor-pointer select-none transition-all",
              isSel
                ? "text-foreground text-[22px] font-bold"
                : "text-muted-foreground text-[18px] font-medium"
            )}
            style={{ height: ITEM_HEIGHT, scrollSnapAlign: "center" }}
          >
            {format(n)}
          </div>
        );
      })}
      {/* 아래 여백 */}
      <div style={{ height: ITEM_HEIGHT * PAD }} aria-hidden />
    </div>
  );
}

const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate(); // month: 1-12

export function DateWheelPicker({
  value,
  onChange,
  maxYear,
  minYear,
  defaultYear,
  className,
}: DateWheelPickerProps) {
  // 현재 연도는 렌더 시 한 번만 계산 (매 렌더 new Date 지양)
  const nowYear = useMemo(() => new Date().getFullYear(), []);
  const yMax = maxYear ?? nowYear - 19;
  const yMin = minYear ?? nowYear - 80;
  const yDefault = Math.min(yMax, Math.max(yMin, defaultYear ?? nowYear - 25));

  // value("YYYYMMDD") 파싱. 미완성이면 기본값으로 채움.
  const digits = value.replace(/\D/g, "");
  const hasFull = digits.length === 8;
  const year = hasFull ? Number(digits.slice(0, 4)) : yDefault;
  const month = hasFull ? Number(digits.slice(4, 6)) : 1;
  const day = hasFull ? Number(digits.slice(6, 8)) : 1;

  // 범위 clamp
  const safeYear = Math.min(yMax, Math.max(yMin, year));
  const safeMonth = Math.min(12, Math.max(1, month));
  const maxDay = daysInMonth(safeYear, safeMonth);
  const safeDay = Math.min(maxDay, Math.max(1, day));

  const years = useMemo(() => {
    // 오래된 연도가 위, 내릴수록 커지도록 오름차순 (월/일과 방향 통일)
    const arr: number[] = [];
    for (let y = yMin; y <= yMax; y++) arr.push(y);
    return arr;
  }, [yMax, yMin]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const days = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay]
  );

  const emit = (y: number, m: number, d: number) => {
    const clampedDay = Math.min(daysInMonth(y, m), d);
    const s = `${y}${String(m).padStart(2, "0")}${String(clampedDay).padStart(2, "0")}`;
    onChange(s);
  };

  // 마운트 시 value가 비어있으면 기본값을 즉시 emit해 상태를 동기화
  useEffect(() => {
    if (!hasFull) emit(yDefault, 1, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pad2 = (n: number) => String(n).padStart(2, "0");

  return (
    <div
      className={cn(
        "relative flex w-full rounded-2xl bg-card px-2 py-1",
        className
      )}
    >
      {/* 가운데 선택 하이라이트 박스 */}
      <div
        className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-xl bg-white/[0.06]"
        style={{ height: ITEM_HEIGHT }}
        aria-hidden
      />
      {/* 위/아래 페이드 그라데이션 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1 h-12 bg-gradient-to-b from-card to-transparent z-10 rounded-t-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-1 h-12 bg-gradient-to-t from-card to-transparent z-10 rounded-b-2xl"
        aria-hidden
      />

      <WheelColumn
        items={years}
        selected={safeYear}
        onSelect={(y) => emit(y, safeMonth, safeDay)}
        format={(n) => `${n}`}
        ariaLabel="연도"
      />
      <WheelColumn
        items={months}
        selected={safeMonth}
        onSelect={(m) => emit(safeYear, m, safeDay)}
        format={pad2}
        ariaLabel="월"
      />
      <WheelColumn
        items={days}
        selected={safeDay}
        onSelect={(d) => emit(safeYear, safeMonth, d)}
        format={pad2}
        ariaLabel="일"
      />
    </div>
  );
}
