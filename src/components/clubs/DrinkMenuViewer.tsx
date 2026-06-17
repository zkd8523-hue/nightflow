"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";
import { Wine, ChevronDown, X, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface Props {
  /** 가격표 다중 사진. 비어있으면 url 폴백 */
  urls?: string[];
  /** 하위 호환: 단일 URL */
  url?: string | null;
  updatedAt: string | null;
  clubName: string;
  /** 테이블맵 단일 URL — 하위 호환 */
  floorPlanUrl?: string | null;
  /** 테이블맵 다중 사진. 비어있으면 floorPlanUrl 폴백 */
  floorPlanUrls?: string[];
}

type Tab = "menu" | "floor";

/**
 * 가격표 + 테이블맵 통합 인라인 드롭다운.
 * - 가격표/테이블맵 각각 다중 슬라이드 지원
 * - 둘 다 있으면 탭 토글 노출, 하나만 있으면 그것만
 */
export function DrinkMenuViewer({ urls, url, updatedAt, clubName, floorPlanUrl, floorPlanUrls }: Props) {
  // 가격표 소스
  const menuSources = (urls && urls.length > 0)
    ? urls
    : (url ? [url] : []);
  // 테이블맵 소스 (다중 우선, 없으면 단일)
  const floorSources = (floorPlanUrls && floorPlanUrls.length > 0)
    ? floorPlanUrls
    : (floorPlanUrl ? [floorPlanUrl] : []);
  const hasFloor = floorSources.length > 0;
  const hasMenu = menuSources.length > 0;
  const [tab, setTab] = useState<Tab>(hasMenu ? "menu" : "floor");
  // 활성 탭의 사진 소스
  const sources = tab === "menu" ? menuSources : floorSources;
  const hasMultiple = sources.length > 1;

  const [open, setOpen] = useState(false);
  const [inlineIdx, setInlineIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const inlineScrollRef = useRef<HTMLDivElement | null>(null);

  const isStale = updatedAt
    ? dayjs().diff(dayjs(updatedAt), "day") > 30
    : false;
  // 분/시 단위 fromNow 대신 yyyy.MM.dd 절대 날짜로 고정 표시
  const updatedLabel = updatedAt
    ? dayjs(updatedAt).format("YYYY.MM.DD")
    : null;

  // 인라인 슬라이드 스크롤 추적 (스와이프 시 인디케이터 업데이트)
  // Transform 기반 슬라이드 (native scroll 미사용 → momentum/가속 원천 차단)
  // 드래그 중에는 손가락 따라가다가, 손 뗐을 때 시작 인덱스 ±1로만 강제 스냅.
  const [dragX, setDragX] = useState(0); // 현재 드래그 중 픽셀 이동량 (음수=왼쪽)
  const touchStartXRef = useRef(0);
  const touchStartIdxRef = useRef(0);
  const isDraggingRef = useRef(false);


  const scrollInlineTo = (idx: number) => {
    setInlineIdx(idx);
    setDragX(0);
  };

  const handleSlideTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartIdxRef.current = inlineIdx;
    isDraggingRef.current = true;
  };
  const handleSlideTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.touches[0].clientX - touchStartXRef.current;
    // 양 끝에서는 저항 (배경 흰 영역 안 보이게)
    const atStart = touchStartIdxRef.current === 0 && dx > 0;
    const atEnd = touchStartIdxRef.current === sources.length - 1 && dx < 0;
    const resistance = (atStart || atEnd) ? 0.3 : 1;
    setDragX(dx * resistance);
  };
  const handleSlideTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    const startIdx = touchStartIdxRef.current;
    const SWIPE_THRESHOLD = 40;
    let targetIdx = startIdx;
    if (dx <= -SWIPE_THRESHOLD) {
      targetIdx = Math.min(sources.length - 1, startIdx + 1);
    } else if (dx >= SWIPE_THRESHOLD) {
      targetIdx = Math.max(0, startIdx - 1);
    }
    setInlineIdx(targetIdx);
    setDragX(0);
  };

  // 라이트박스: ESC + 좌우 키 + body 스크롤 잠금
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowLeft" && hasMultiple) {
        setLightboxIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "ArrowRight" && hasMultiple) {
        setLightboxIdx((i) => Math.min(sources.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox, hasMultiple, sources.length]);

  // 탭 전환 시 슬라이드 인덱스 초기화 — transform이 자동으로 0번 위치로 이동
  useEffect(() => {
    setInlineIdx(0);
    setLightboxIdx(0);
    setDragX(0);
  }, [tab]);

  const openLightboxAt = (idx: number) => {
    setLightboxIdx(idx);
    setLightbox(true);
  };

  // 가격표·테이블맵 둘 다 없으면 컴포넌트 자체 안 보임
  if (!hasMenu && !hasFloor) return null;

  // 헤더 라벨: 둘 다 있으면 "가격표 · 테이블맵", 하나만 있으면 그것만
  const headerLabel = hasMenu && hasFloor
    ? "가격표 · 테이블맵"
    : hasMenu
      ? "가격표 보기"
      : "테이블맵 보기";

  return (
    <>
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center gap-2 px-4 py-2.5 mt-1 text-[13px] text-neutral-300 bg-neutral-900/50 hover:bg-neutral-900 active:scale-[0.99] border border-neutral-800 rounded-xl transition-colors text-left"
        >
          {hasMenu ? (
            <Wine className="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" />
          ) : (
            <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" />
          )}
          <span className="font-bold">{headerLabel}</span>
          {tab === "menu" && isStale && (
            <span className="text-[11px] text-red-400">· 오래된 정보일 수 있어요</span>
          )}
          <ChevronDown
            className={`ml-auto w-4 h-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
          <span className="sr-only">{open ? "접기" : "펼치기"}</span>
        </button>
        {open && (
          <div className="mt-2 rounded-xl overflow-hidden border border-neutral-800">
            {/* 둘 다 있을 때만 탭 토글 노출 */}
            {hasMenu && hasFloor && (
              <div className="flex border-b border-neutral-800 bg-[#0A0A0A]">
                <button
                  type="button"
                  onClick={() => setTab("menu")}
                  className={`flex-1 py-2.5 text-[13px] font-bold transition-colors ${
                    tab === "menu"
                      ? "text-amber-400 border-b-2 border-amber-400 -mb-px"
                      : "text-neutral-500 hover:text-white"
                  }`}
                >
                  가격표
                </button>
                <button
                  type="button"
                  onClick={() => setTab("floor")}
                  className={`flex-1 py-2.5 text-[13px] font-bold transition-colors ${
                    tab === "floor"
                      ? "text-amber-400 border-b-2 border-amber-400 -mb-px"
                      : "text-neutral-500 hover:text-white"
                  }`}
                >
                  테이블맵
                </button>
              </div>
            )}
            <div
              className="relative bg-[#0A0A0A] overflow-hidden"
              onTouchStart={hasMultiple ? handleSlideTouchStart : undefined}
              onTouchMove={hasMultiple ? handleSlideTouchMove : undefined}
              onTouchEnd={hasMultiple ? handleSlideTouchEnd : undefined}
              onTouchCancel={hasMultiple ? handleSlideTouchEnd : undefined}
            >
              {/* Transform 기반 가로 슬라이드 — native scroll 미사용 */}
              <div
                ref={inlineScrollRef}
                className="flex"
                style={{
                  transform: hasMultiple
                    ? `translateX(calc(${-inlineIdx * 100}% + ${dragX}px))`
                    : "none",
                  transition: isDraggingRef.current ? "none" : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
                  // 1장이면 touch-action 제약 없음, 다장이면 세로만 허용
                  touchAction: hasMultiple ? "pan-y" : "auto",
                }}
              >
                {sources.map((src, i) => {
                  // D. 현재 인덱스 ±1만 실제 로드, 나머지는 placeholder만
                  const shouldLoad = Math.abs(i - inlineIdx) <= 1;
                  // A. 첫 사진은 priority(즉시 로드), 나머지는 lazy
                  const isPriority = i === 0;
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => {
                        // 드래그 직후 의도치 않은 클릭 방지 (5px 이상 이동 시 클릭 무시)
                        const dx = Math.abs(dragX);
                        if (dx > 5) return;
                        openLightboxAt(i);
                      }}
                      aria-label={`사진 ${i + 1} 크게 보기`}
                      className="relative flex-shrink-0 w-full cursor-zoom-in bg-neutral-900"
                      style={{ aspectRatio: "3 / 4" }}
                    >
                      {shouldLoad ? (
                        <Image
                          src={src}
                          alt={`${clubName} 가격표 ${i + 1}`}
                          width={800}
                          height={1066}
                          sizes="(max-width: 640px) 100vw, 500px"
                          className="w-full h-auto select-none pointer-events-none"
                          draggable={false}
                          priority={isPriority}
                          loading={isPriority ? undefined : "lazy"}
                          fetchPriority={isPriority ? "high" : "low"}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-neutral-700 text-[11px]">
                          로딩 대기 중…
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 갱신 날짜 — 가격표 탭에서만, 이미지 우측 하단 오버레이 */}
              {tab === "menu" && updatedLabel && (
                <div
                  className={`absolute bottom-2 right-2 z-10 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-bold pointer-events-none ${
                    isStale ? "text-red-300" : "text-white/90"
                  }`}
                >
                  {updatedLabel} 갱신
                </div>
              )}

              {/* 좌우 화살표 (데스크탑·다장만) */}
              {hasMultiple && (
                <>
                  {inlineIdx > 0 && (
                    <button
                      type="button"
                      onClick={() => scrollInlineTo(inlineIdx - 1)}
                      aria-label="이전 사진"
                      className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-black/70 backdrop-blur-sm text-white hover:bg-black/90"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  {inlineIdx < sources.length - 1 && (
                    <button
                      type="button"
                      onClick={() => scrollInlineTo(inlineIdx + 1)}
                      aria-label="다음 사진"
                      className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-black/70 backdrop-blur-sm text-white hover:bg-black/90"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* dot 인디케이터 (다장만) */}
            {hasMultiple && (
              <div className="flex items-center justify-center gap-1.5 py-2 bg-[#0A0A0A]">
                {sources.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => scrollInlineTo(i)}
                    aria-label={`사진 ${i + 1}로 이동`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === inlineIdx ? "w-6 bg-amber-400" : "w-1.5 bg-neutral-700 hover:bg-neutral-600"
                    }`}
                  />
                ))}
              </div>
            )}

            <p className="px-3 py-1.5 text-[10px] text-neutral-600 text-center">
              이미지를 탭하면 크게 보기{hasMultiple ? " · 좌우로 스와이프" : ""}
            </p>
          </div>
        )}
      </div>

      {/* 라이트박스 (풀스크린 모달) */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${clubName} 가격표 확대 보기`}
        >
          {/* 닫기 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(false);
            }}
            aria-label="닫기"
            className="absolute top-4 right-4 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>

          {/* 좌 화살표 */}
          {hasMultiple && lightboxIdx > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx((i) => Math.max(0, i - 1));
              }}
              aria-label="이전 사진"
              className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* 우 화살표 */}
          {hasMultiple && lightboxIdx < sources.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx((i) => Math.min(sources.length - 1, i + 1));
              }}
              aria-label="다음 사진"
              className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* 카운터 */}
          {hasMultiple && (
            <div className="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-full bg-neutral-900/80 backdrop-blur-sm text-white text-[12px] font-bold">
              {lightboxIdx + 1} / {sources.length}
            </div>
          )}

          {/* 이미지 영역 — react-zoom-pan-pinch:
              - 더블탭/더블클릭으로 줌 토글
              - 핀치 줌 / 휠 줌
              - 줌 상태에서 자유롭게 팬 (좌우/상하)
              - 줌 1배일 때 스와이프 = 좌우 이미지 이동
              - 우리는 LightboxImage 컴포넌트로 분리해서 사용 */}
          <div
            className="relative z-0 w-full h-full max-w-5xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <LightboxImage
              key={lightboxIdx}
              src={sources[lightboxIdx]}
              alt={`${clubName} 가격표 ${lightboxIdx + 1}`}
              onSwipePrev={lightboxIdx > 0 ? () => setLightboxIdx((i) => Math.max(0, i - 1)) : undefined}
              onSwipeNext={lightboxIdx < sources.length - 1 ? () => setLightboxIdx((i) => Math.min(sources.length - 1, i + 1)) : undefined}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 라이트박스 이미지 한 장: 핀치/더블탭/휠 줌 + 팬 지원 (react-zoom-pan-pinch).
 * - 줌 1배일 때 좌/우 스와이프 = 이전/다음 사진 (onSwipePrev/onSwipeNext)
 * - 줌 상태에서는 panning이 활성화되어 스와이프는 자동으로 무시됨
 */
function LightboxImage({
  src,
  alt,
  onSwipePrev,
  onSwipeNext,
}: {
  src: string;
  alt: string;
  onSwipePrev?: () => void;
  onSwipeNext?: () => void;
}) {
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartScaleRef = useRef(1);
  const currentScaleRef = useRef(1);

  return (
    <TransformWrapper
      initialScale={1}
      minScale={1}
      maxScale={4}
      doubleClick={{ step: 1 }}
      pinch={{ step: 5 }}
      wheel={{ step: 0.2 }}
      panning={{ disabled: false }}
      onTransform={(_ref, state) => {
        currentScaleRef.current = state.scale;
      }}
    >
      {() => (
        <TransformComponent
          wrapperClass="!w-full !h-full"
          contentClass="!w-full !h-full flex items-center justify-center"
        >
          <div
            className="w-full h-full flex items-center justify-center"
            onTouchStart={(e) => {
              if (e.touches.length !== 1) return;
              touchStartXRef.current = e.touches[0].clientX;
              touchStartYRef.current = e.touches[0].clientY;
              touchStartScaleRef.current = currentScaleRef.current;
            }}
            onTouchEnd={(e) => {
              // 줌 상태였거나 핀치 후 풀린 직후엔 스와이프 무시
              if (touchStartScaleRef.current > 1.01 || currentScaleRef.current > 1.01) return;
              const dx = e.changedTouches[0].clientX - touchStartXRef.current;
              const dy = e.changedTouches[0].clientY - touchStartYRef.current;
              const THRESHOLD = 50;
              if (Math.abs(dy) > Math.abs(dx)) return;
              if (Math.abs(dx) < THRESHOLD) return;
              if (dx < 0 && onSwipeNext) onSwipeNext();
              else if (dx > 0 && onSwipePrev) onSwipePrev();
            }}
          >
            <Image
              src={src}
              alt={alt}
              width={1600}
              height={2400}
              className="max-w-full max-h-full h-auto w-auto select-none"
              style={{ objectFit: "contain" }}
              draggable={false}
              unoptimized
            />
          </div>
        </TransformComponent>
      )}
    </TransformWrapper>
  );
}
