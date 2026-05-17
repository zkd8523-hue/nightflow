"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BadgeCheck, CheckCircle2, Flame, XCircle } from "lucide-react";
import { AdminWithdrawOfferButton } from "@/components/admin/AdminWithdrawOfferButton";
import type { PuzzleOffer } from "@/types/database";
import { useRevealedOffers } from "@/hooks/useRevealedOffers";
import { formatRelativeTime } from "@/lib/utils/format";

const SCRATCH_THRESHOLD = 45; // % 이상 긁으면 자동 완전 공개
const BRUSH_RADIUS = 28;      // 긁히는 브러시 크기 (px)

interface SecretOfferCardProps {
  offer: PuzzleOffer;
  offerNumber: number;
  index: number;
  userId: string | null | undefined;
  isAdmin: boolean;
  isOpen: boolean;
  actionLoading: boolean;
  onAccept: (offerId: string) => void;
  onReject: (offerId: string) => void;
  onWithdrawn: () => void;
}

export function SecretOfferCard({
  offer,
  offerNumber,
  index,
  userId,
  isAdmin,
  isOpen,
  actionLoading,
  onAccept,
  onReject,
  onWithdrawn,
}: SecretOfferCardProps) {
  const { isLoaded, hasRevealed, markRevealed } = useRevealedOffers(userId);
  const [fadingOut, setFadingOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScratching = useRef(false);
  const scratchDone = useRef(false);

  const forceReveal = !isOpen || offer.status !== "pending";
  const isRevealed = forceReveal || (isLoaded && hasRevealed(offer.id));
  const showCanvas = !isRevealed || fadingOut;

  // Canvas 초기화 (잠금 상태일 때만)
  useEffect(() => {
    if (!showCanvas || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 어두운 스크래치 레이어
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 대각 라인 패턴 (스크래치 질감)
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = -canvas.height; i < canvas.width; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + canvas.height, canvas.height);
      ctx.stroke();
    }

    // 안내 텍스트
    ctx.font = "bold 12px 'Pretendard Variable', sans-serif";
    ctx.fillStyle = "rgba(156,163,175,0.65)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("긁어서 확인하세요!", canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = "10px 'Pretendard Variable', sans-serif";
    ctx.fillStyle = "rgba(107,114,128,0.5)";
    ctx.fillText(`시크릿 오퍼 #${offerNumber}`, canvas.width / 2, canvas.height / 2 + 10);
  }, [showCanvas, offerNumber]);

  const getTransparencyPct = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 128) transparent++;
    }
    return (transparent / (data.length / 4)) * 100;
  }, []);

  const scratchAt = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas || scratchDone.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    if (getTransparencyPct(canvas) >= SCRATCH_THRESHOLD) {
      scratchDone.current = true;
      markRevealed(offer.id);
      setFadingOut(true);
      setTimeout(() => setFadingOut(false), 400);
    }
  }, [getTransparencyPct, markRevealed, offer.id]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = e.touches[0];
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const club = offer.club as { name?: string; area?: string } | null;
  const dealCount = offer.md?.md_deal_count ?? null;
  const staggerStyle = { "--stagger-idx": index } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      style={staggerStyle}
      className={`animate-offer-card-enter relative rounded-2xl border p-4 space-y-3 overflow-hidden ${
        offer.status === "accepted"
          ? "bg-amber-500/10 border-amber-500/30"
          : "bg-[#1C1C1E] border-neutral-800"
      }`}
    >
      {/* 공개 콘텐츠 — 항상 렌더, 캔버스 아래 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-black text-white">
            {club?.name || "클럽"}
            {club?.area && (
              <span className="text-neutral-500 font-medium"> · {club.area}</span>
            )}
          </p>
        </div>
        {offer.status === "accepted" ? (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold">
            ✓ 수락됨
          </span>
        ) : (
          <span className="text-[11px] text-neutral-500 font-medium" suppressHydrationWarning>
            {formatRelativeTime(offer.created_at)}
          </span>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-neutral-800/60">
        <p className="text-[16px] font-black text-green-400">
          {offer.proposed_price.toLocaleString()}원
        </p>
        {offer.includes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {offer.includes.map((inc) => (
              <span
                key={inc}
                className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700"
              >
                {inc}
              </span>
            ))}
          </div>
        )}
        {offer.comment && (
          <p className="text-[12px] text-neutral-400 italic">&ldquo;{offer.comment}&rdquo;</p>
        )}
      </div>

      {dealCount != null && dealCount >= 3 && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-neutral-800/60">
          {dealCount >= 30 ? (
            <Flame className="w-3 h-3 text-orange-500" />
          ) : dealCount >= 10 ? (
            <BadgeCheck className="w-3 h-3 text-blue-400" />
          ) : (
            <BadgeCheck className="w-3 h-3 text-neutral-500" />
          )}
          <span className="text-[10px] font-bold text-neutral-400">거래 {dealCount}회</span>
        </div>
      )}

      {isOpen && offer.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <Button
            onClick={() => onAccept(offer.id)}
            disabled={actionLoading}
            className="flex-1 h-10 bg-white hover:bg-neutral-200 text-black font-black text-[13px] rounded-xl"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            수락
          </Button>
          <Button
            onClick={() => onReject(offer.id)}
            disabled={actionLoading}
            variant="outline"
            className="flex-1 h-10 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10 font-bold text-[13px] rounded-xl"
          >
            <XCircle className="w-4 h-4 mr-1.5" />
            거절
          </Button>
        </div>
      )}

      {isAdmin && offer.status === "pending" && (
        <div className="pt-1 flex justify-end">
          <AdminWithdrawOfferButton offerId={offer.id} variant="full" onWithdrawn={onWithdrawn} />
        </div>
      )}

      {/* 스크래치 Canvas — 공개 콘텐츠를 덮는 overlay */}
      {showCanvas && (
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 rounded-2xl cursor-crosshair touch-none ${
            fadingOut ? "animate-canvas-fade" : ""
          }`}
          onMouseDown={(e) => { isScratching.current = true; const p = getPos(e); scratchAt(p.x, p.y); }}
          onMouseMove={(e) => { if (!isScratching.current) return; const p = getPos(e); scratchAt(p.x, p.y); }}
          onMouseUp={() => { isScratching.current = false; }}
          onMouseLeave={() => { isScratching.current = false; }}
          onTouchStart={(e) => { e.preventDefault(); isScratching.current = true; const p = getTouchPos(e); scratchAt(p.x, p.y); }}
          onTouchMove={(e) => { e.preventDefault(); if (!isScratching.current) return; const p = getTouchPos(e); scratchAt(p.x, p.y); }}
          onTouchEnd={() => { isScratching.current = false; }}
        />
      )}
    </div>
  );
}
