"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { PuzzleOffer } from "@/types/database";
import { splitOfferIncludes } from "@/lib/utils/offerTags";
import { toEnglishInclude } from "@/lib/utils/liquorEn";
import { useTranslatedComment } from "@/hooks/useTranslatedComment";
import { type Lang, makeT } from "@/lib/i18n";

interface OfferMenuCompareSheetProps {
  onClose: () => void;
  club: {
    name?: string;
    drink_menu_url?: string | null;
    drink_menu_urls?: string[];
    drink_menu_updated_at?: string | null;
  };
  /** 같은 클럽의 모든 오퍼 — 가격표는 그대로 두고 "다음 오퍼보기"로 이 안에서만 넘김 */
  offers: PuzzleOffer[];
  lang?: Lang;
  /** 방장의 총 예산 — 정가와 빠르게 대조할 수 있게 하단 고정 패널에 노출 */
  myBudget?: number;
}

/**
 * 풀스크린 비교 뷰 — 배경에 클럽 주대표(가격표)를 스크롤로 보여주고,
 * 오퍼 정보(태그·코멘트·상담 CTA)는 하단에 고정해 열고닫지 않고 바로 대조할 수 있게 함.
 * 같은 클럽에 MD가 여럿이면, 가격표는 그대로 둔 채 "다음 오퍼보기"로 오퍼만 넘겨볼 수 있음.
 */
export function OfferMenuCompareSheet({ onClose, club, offers, lang = "ko", myBudget }: OfferMenuCompareSheetProps) {
  const isForeigner = lang !== "ko";
  const t = makeT(lang);
  const sources = (club.drink_menu_urls && club.drink_menu_urls.length > 0)
    ? club.drink_menu_urls
    : (club.drink_menu_url ? [club.drink_menu_url] : []);
  // 가격표 이미지 넘기기와는 별개 상태 — "다음 오퍼보기"만 이걸 바꾼다.
  const [offerIdx, setOfferIdx] = useState(0);
  const offer = offers[offerIdx];
  const hasMultipleOffers = offers.length > 1;
  const { liquors, sellingPoints, extras } = splitOfferIncludes(offer.includes);
  const commentEn = useTranslatedComment(offer.comment, isForeigner);

  // 세로로 이어붙이지 않고 좌우로 넘기는 페이지 방식 (DrinkMenuViewer 인라인 슬라이더와 동일 패턴).
  // 별도 확대 버튼/라이트박스 없이 이 화면에서 바로 핀치·더블탭·휠 줌 가능 (TransformWrapper를 페이지별로 직접 부착).
  // 줌 상태(scale>1)일 땐 페이지 스와이프를 막아 TransformWrapper의 팬 제스처와 충돌하지 않게 함.
  const [pageIdx, setPageIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const touchStartXRef = useRef(0);
  const touchStartIdxRef = useRef(0);
  const isDraggingRef = useRef(false);
  const currentScaleRef = useRef(1);
  const hasMultiple = sources.length > 1;

  const goToPage = (idx: number) => {
    currentScaleRef.current = 1;
    setPageIdx(Math.max(0, Math.min(sources.length - 1, idx)));
    setDragX(0);
  };
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (currentScaleRef.current > 1.01 || e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartIdxRef.current = pageIdx;
    isDraggingRef.current = true;
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || currentScaleRef.current > 1.01) return;
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const atStart = touchStartIdxRef.current === 0 && dx > 0;
    const atEnd = touchStartIdxRef.current === sources.length - 1 && dx < 0;
    const resistance = (atStart || atEnd) ? 0.3 : 1;
    setDragX(dx * resistance);
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (currentScaleRef.current > 1.01) { setDragX(0); return; }
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    const startIdx = touchStartIdxRef.current;
    const SWIPE_THRESHOLD = 40;
    let targetIdx = startIdx;
    if (dx <= -SWIPE_THRESHOLD) targetIdx = Math.min(sources.length - 1, startIdx + 1);
    else if (dx >= SWIPE_THRESHOLD) targetIdx = Math.max(0, startIdx - 1);
    setPageIdx(targetIdx);
    setDragX(0);
  };

  // 카드 조상(overflow-hidden + transform 애니메이션)이 fixed의 containing block이 되어
  // 잘려 보이는 문제를 막기 위해 document.body에 직접 포탈로 렌더링.
  if (typeof document === "undefined") return null;

  return createPortal(
    // data-no-pull-refresh="strict": 전역 PullToRefresh의 document 터치 리스너가
    // 멀티터치(핀치)를 단일 터치로 오인해 preventDefault를 걸어 핀치줌과 충돌하는 것을 차단.
    <div className="fixed inset-0 z-[200] bg-black flex flex-col" role="dialog" aria-modal="true" data-no-pull-refresh="strict">
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 backdrop-blur-sm border-b border-neutral-800 shrink-0">
        <p className="text-[14px] font-black text-white truncate">
          {club.name || t("클럽", "Club")} {t("가격표", "Price list")}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("닫기", "Close")}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900 hover:bg-neutral-800 text-white shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 가격표 — 좌우로 넘기는 페이지 (세로 이어붙임 대신). 스와이프 + 화살표 버튼 둘 다 지원 */}
      <div className="relative flex-1 overflow-hidden">
        {sources.length > 0 ? (
          <>
            <div
              className="flex w-full h-full"
              onTouchStart={hasMultiple ? handleTouchStart : undefined}
              onTouchMove={hasMultiple ? handleTouchMove : undefined}
              onTouchEnd={hasMultiple ? handleTouchEnd : undefined}
              onTouchCancel={hasMultiple ? handleTouchEnd : undefined}
              style={{
                transform: hasMultiple
                  ? `translateX(calc(${-pageIdx * 100}% + ${dragX}px))`
                  : "none",
                transition: isDraggingRef.current ? "none" : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
              }}
            >
              {sources.map((src, i) => (
                <div
                  key={src}
                  className="relative w-full h-full flex-shrink-0"
                >
                  <TransformWrapper
                    initialScale={1}
                    minScale={1}
                    maxScale={4}
                    doubleClick={{ step: 1 }}
                    pinch={{ step: 5 }}
                    wheel={{ step: 0.2 }}
                    panning={{ disabled: false }}
                    onTransform={(_ref, state) => {
                      if (i === pageIdx) currentScaleRef.current = state.scale;
                    }}
                  >
                    <TransformComponent
                      wrapperClass="!w-full !h-full"
                      contentClass="!w-full !h-full flex items-center justify-center"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`${club.name ?? ""} 가격표 ${i + 1}`}
                        className="max-w-full max-h-full object-contain select-none"
                        draggable={false}
                      />
                    </TransformComponent>
                  </TransformWrapper>
                </div>
              ))}
            </div>

            {/* 넘기기 버튼 — 모바일 스와이프 + 데스크탑/모바일 공통 버튼 */}
            {hasMultiple && pageIdx > 0 && (
              <button
                type="button"
                onClick={() => goToPage(pageIdx - 1)}
                aria-label={t("이전 페이지", "Previous page")}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-sm text-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {hasMultiple && pageIdx < sources.length - 1 && (
              <button
                type="button"
                onClick={() => goToPage(pageIdx + 1)}
                aria-label={t("다음 페이지", "Next page")}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-sm text-white"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}

            {/* 점 인디케이터 */}
            {hasMultiple && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/70 backdrop-blur-sm">
                {sources.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => goToPage(i)}
                    aria-label={t(`${i + 1}번째 페이지로 이동`, `Go to page ${i + 1}`)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === pageIdx ? "w-5 bg-amber-400" : "w-1.5 bg-neutral-500 hover:bg-neutral-400"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-[13px] text-neutral-500 py-12">
            {t("가격표 이미지를 불러올 수 없어요", "Couldn't load the price list image")}
          </p>
        )}
      </div>

      {/* 하단 고정 — 오퍼 요약 + 상담 CTA */}
      <div className="shrink-0 bg-[#1C1C1E] border-t border-neutral-800 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] space-y-2 max-h-[45vh] overflow-y-auto">
        {hasMultipleOffers && (
          <p className="text-[11px] font-bold text-neutral-500">
            {t(`오퍼 ${offerIdx + 1} / ${offers.length}`, `Offer ${offerIdx + 1} / ${offers.length}`)}
          </p>
        )}
        {myBudget != null && (
          <p className="text-[13px] font-bold text-neutral-300">
            {t("내 예산", "My budget")}{" "}
            <span className="text-white">{myBudget.toLocaleString()}{t("원", "")}</span>
          </p>
        )}
        {(liquors.length > 0 || sellingPoints.length > 0 || extras.length > 0) && (
          <div className="space-y-1.5">
            {liquors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {liquors.map((inc) => (
                  <span
                    key={inc}
                    className="inline-flex items-center gap-1 text-[13px] font-bold px-2.5 py-1 rounded-[7px] bg-gradient-to-b from-amber-400/15 to-amber-600/10 border border-amber-300/40 ring-1 ring-inset ring-amber-200/20 shadow-[0_0_12px_-2px_rgba(245,158,11,0.35)]"
                  >
                    <span aria-hidden>🍾</span>
                    <span className="bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">
                      {isForeigner ? toEnglishInclude(inc) : inc}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {sellingPoints.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sellingPoints.map((inc) => (
                  <span
                    key={inc}
                    className="text-[12px] font-semibold px-2.5 py-1 rounded-[7px] bg-amber-500/12 text-amber-200 border border-amber-500/25"
                  >
                    {isForeigner ? toEnglishInclude(inc) : inc} 🤫
                  </span>
                ))}
              </div>
            )}
            {extras.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {extras.map((inc) => (
                  <span
                    key={inc}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-[7px] bg-neutral-900 text-neutral-300 border border-neutral-700/70"
                  >
                    {isForeigner ? toEnglishInclude(inc) : inc}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {offer.comment && (
          <p className="text-[12px] text-neutral-400">
            &ldquo;{isForeigner ? (commentEn ?? offer.comment) : offer.comment}&rdquo;
          </p>
        )}
        <div className="flex gap-2">
          <Link
            href={`/messages/${offer.id}`}
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-[13px]"
          >
            {t("문의하기", "Contact")}
          </Link>
          {hasMultipleOffers && (
            <button
              type="button"
              onClick={() => setOfferIdx((i) => (i + 1) % offers.length)}
              className="flex-1 flex items-center justify-center gap-1 h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[13px]"
            >
              {t("다음 오퍼보기", "Next offer")}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

    </div>,
    document.body
  );
}
