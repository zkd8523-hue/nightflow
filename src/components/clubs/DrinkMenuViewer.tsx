"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";
import { Wine, ChevronDown, X, ChevronLeft, ChevronRight } from "lucide-react";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface Props {
  /** 다중 사진. 비어있으면 url 폴백 */
  urls?: string[];
  /** 하위 호환: 단일 URL */
  url?: string | null;
  updatedAt: string | null;
  clubName: string;
}

/**
 * 가격표(주류 가격표) 인라인 드롭다운.
 * - 1장: 단일 사진, 클릭 시 라이트박스
 * - 2장 이상: 가로 슬라이드 + 좌우 화살표 + dot 인디케이터, 라이트박스도 슬라이드
 * - 라이트박스 안에서 사진 탭 = 2x 줌 토글
 */
export function DrinkMenuViewer({ urls, url, updatedAt, clubName }: Props) {
  // urls 우선, 비어있으면 url 폴백
  const sources = (urls && urls.length > 0)
    ? urls
    : (url ? [url] : []);
  const hasMultiple = sources.length > 1;

  const [open, setOpen] = useState(false);
  const [inlineIdx, setInlineIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const inlineScrollRef = useRef<HTMLDivElement | null>(null);
  const zoomScrollRef = useRef<HTMLDivElement | null>(null);

  const isStale = updatedAt
    ? dayjs().diff(dayjs(updatedAt), "day") > 30
    : false;
  // 분/시 단위 fromNow 대신 yyyy.MM.dd 절대 날짜로 고정 표시
  const updatedLabel = updatedAt
    ? dayjs(updatedAt).format("YYYY.MM.DD")
    : null;

  // 인라인 슬라이드 스크롤 추적 (스와이프 시 인디케이터 업데이트)
  const handleInlineScroll = () => {
    const el = inlineScrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== inlineIdx) setInlineIdx(idx);
  };

  const scrollInlineTo = (idx: number) => {
    const el = inlineScrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  // 라이트박스 줌 토글
  const toggleZoom = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    const container = zoomScrollRef.current;
    if (!container) {
      setZoomed((z) => !z);
      return;
    }
    if (zoomed) {
      setZoomed(false);
      return;
    }
    const rect = container.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("changedTouches" in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ("clientX" in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    setZoomed(true);
    requestAnimationFrame(() => {
      if (!zoomScrollRef.current) return;
      const sc = zoomScrollRef.current;
      const newScrollLeft = relX * sc.scrollWidth - rect.width / 2;
      const newScrollTop = relY * sc.scrollHeight - rect.height / 2;
      sc.scrollTo({ left: newScrollLeft, top: newScrollTop, behavior: "instant" as ScrollBehavior });
    });
  };

  // 라이트박스: ESC + 좌우 키 + body 스크롤 잠금
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowLeft" && hasMultiple) {
        setLightboxIdx((i) => Math.max(0, i - 1));
        setZoomed(false);
      }
      if (e.key === "ArrowRight" && hasMultiple) {
        setLightboxIdx((i) => Math.min(sources.length - 1, i + 1));
        setZoomed(false);
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

  useEffect(() => {
    if (!lightbox) setZoomed(false);
  }, [lightbox]);

  const openLightboxAt = (idx: number) => {
    setLightboxIdx(idx);
    setLightbox(true);
  };

  if (sources.length === 0) return null;

  return (
    <>
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center gap-2 px-4 py-3 mt-1 text-[14px] text-white bg-amber-500/10 hover:bg-amber-500/20 active:scale-[0.99] border border-amber-500/40 rounded-xl transition-colors text-left"
        >
          <Wine className="w-4 h-4 flex-shrink-0 text-amber-400" />
          <span className="font-black">가격표 보기</span>
          {sources.length > 1 && (
            <span className="text-[12px] text-amber-300 font-black">{sources.length}장</span>
          )}
          {isStale && (
            <span className="text-[11px] text-red-400">· 오래된 정보일 수 있어요</span>
          )}
          <ChevronDown
            className={`ml-auto w-5 h-5 text-amber-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
          <span className="sr-only">{open ? "접기" : "펼치기"}</span>
        </button>
        {open && (
          <div className="mt-2 rounded-xl overflow-hidden border border-neutral-800">
            <div className="relative bg-[#0A0A0A]">
              {/* 가로 슬라이드 스크롤 컨테이너 */}
              <div
                ref={inlineScrollRef}
                onScroll={handleInlineScroll}
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                style={{ scrollSnapType: "x mandatory" }}
              >
                {sources.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => openLightboxAt(i)}
                    aria-label={`사진 ${i + 1} 크게 보기`}
                    className="relative flex-shrink-0 w-full snap-center cursor-zoom-in"
                  >
                    <Image
                      src={src}
                      alt={`${clubName} 가격표 ${i + 1}`}
                      width={1200}
                      height={1600}
                      className="w-full h-auto select-none"
                      draggable={false}
                      unoptimized
                    />
                  </button>
                ))}
              </div>

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

            <div className="relative px-3 py-1.5 text-[10px] text-neutral-600">
              <p className="text-center">
                이미지를 탭하면 크게 보기{hasMultiple ? " · 좌우로 스와이프" : ""}
              </p>
              {updatedLabel && (
                <span
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${
                    isStale ? "text-red-400" : "text-neutral-500"
                  }`}
                >
                  {updatedLabel} 갱신
                </span>
              )}
            </div>
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
            className="absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
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
                setZoomed(false);
              }}
              aria-label="이전 사진"
              className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
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
                setZoomed(false);
              }}
              aria-label="다음 사진"
              className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 backdrop-blur-sm hover:bg-neutral-800 text-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* 카운터 */}
          {hasMultiple && (
            <div className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-full bg-neutral-900/80 backdrop-blur-sm text-white text-[12px] font-bold">
              {lightboxIdx + 1} / {sources.length}
            </div>
          )}

          {/* 이미지 영역 (탭 = 2x 줌, 배경 클릭과 분리) */}
          <div
            ref={zoomScrollRef}
            className="relative w-full h-full max-w-5xl overflow-auto p-4"
            onClick={(e) => {
              e.stopPropagation();
              toggleZoom(e);
            }}
            style={{ cursor: zoomed ? "zoom-out" : "zoom-in" }}
            role="button"
            aria-label={zoomed ? "축소" : "확대"}
            tabIndex={0}
          >
            <Image
              src={sources[lightboxIdx]}
              alt={`${clubName} 가격표 ${lightboxIdx + 1}`}
              width={1600}
              height={2400}
              className="h-auto mx-auto select-none transition-[width] duration-200"
              style={{ width: zoomed ? "200%" : "100%", objectFit: "contain" }}
              draggable={false}
              unoptimized
            />
          </div>
        </div>
      )}
    </>
  );
}
