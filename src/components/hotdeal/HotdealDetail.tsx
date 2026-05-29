"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Instagram, Train, MapPin, Pencil, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { DailyHotdeal } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { tableZoneLabel } from "@/lib/utils/hotdeal";

type HotdealWithJoins = DailyHotdeal & {
  club: {
    id: string;
    name: string;
    area: string | null;
    thumbnail_url: string | null;
    floor_plan_url: string | null;
    address: string | null;
    instagram: string | null;
  };
};

function formatCountdown(endsAtISO: string, now: number): string {
  const end = new Date(endsAtISO).getTime();
  const diff = end - now;
  if (diff <= 0) return "종료됨";
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((diff % (1000 * 60)) / 1000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}일 ${h % 24}시간 ${m}분 남음`;
  }
  return `${h}시간 ${m}분 ${s}초 남음`;
}

export function HotdealDetail({ hotdeal: h }: { hotdeal: HotdealWithJoins }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [now, setNow] = useState(Date.now());
  const [isOwner, setIsOwner] = useState(false);
  const [copied, setCopied] = useState(false);

  const dmMessage = useMemo(() => {
    const zone = tableZoneLabel(h.table_zone);
    const priceTxt = h.price ? `${h.price.toLocaleString()}원` : "";
    const parts = [zone, h.table_info, priceTxt].filter(Boolean).join(" · ");
    return [
      "[나플핫딜문의] 안녕하세요!",
      `${h.club.name}${parts ? ` ${parts}` : ""} 핫딜 예약 가능할까요?`,
    ].join("\n");
  }, [h]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(dmMessage);
      setCopied(true);
      toast.success("메시지가 복사됐어요");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사에 실패했어요. 메시지를 길게 눌러 복사해주세요");
    }
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setIsOwner(!!user && user.id === h.md_id);
    })();
    return () => { cancelled = true; };
  }, [supabase, h.md_id]);

  const thumb = h.thumbnail_url || h.club?.thumbnail_url || null;
  const countdown = formatCountdown(h.ends_at, now);
  const expired = new Date(h.ends_at).getTime() <= now || h.status !== "active";
  const discountPct =
    h.original_price && h.price && h.original_price > h.price
      ? Math.round((1 - h.price / h.original_price) * 100)
      : null;
  const hasFloorPlan = !!h.club.floor_plan_url;
  const hasTableInfo = !!h.table_info;
  const hasLiquor = (h.liquor_includes?.length ?? 0) > 0;
  const hasFeatures = (h.table_features?.length ?? 0) > 0;

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* 헤더 이미지 */}
      <div className="relative aspect-[4/3] bg-neutral-900">
        {thumb ? (
          <Image src={thumb} alt={h.title} fill sizes="600px" className="object-cover" priority />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[60px] font-black text-white/30">
            {h.club.name.charAt(0)}
          </div>
        )}

        {/* 뒤로가기 */}
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          className="absolute left-3 w-10 h-10 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center z-30"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        {/* HOT DEAL 배지 */}
        <div
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
          className="absolute right-3 bg-amber-500 text-black text-[11px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1 z-30"
        >
          🔥 HOT DEAL
        </div>

        {/* MD 본인용 수정 버튼 */}
        {isOwner && (
          <Link
            href={`/md/hotdeal-now?edit=${h.id}`}
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 52px)" }}
            className="absolute right-3 bg-black/70 backdrop-blur-sm text-white text-[11px] font-black px-2.5 py-1.5 rounded-full inline-flex items-center gap-1 z-30 active:scale-95 transition-transform"
          >
            <Pencil className="w-3 h-3" />
            수정
          </Link>
        )}

        {/* 하단 그라데이션 */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute left-4 right-4 bottom-4 space-y-1">
          <div className="inline-flex items-center gap-1 bg-black/60 backdrop-blur-sm text-amber-300 text-[12px] font-black px-2.5 py-1 rounded-full">
            <Clock className="w-3.5 h-3.5" />
            {countdown}
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
            {h.title}
          </h1>
          <p className="text-[12px] text-white/60 flex flex-wrap gap-x-2">
            {h.club.area && <span>{h.club.area}</span>}
            {h.nearest_station && (
              <span>
                <Train className="w-3 h-3 inline mr-0.5" />
                {h.nearest_station}역 도보 {h.walk_minutes ?? "—"}분
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 본문 */}
      <div className="px-5 py-4 space-y-4">
        {/* 가격 */}
        {h.price !== null && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl px-5 py-4">
            <p className="text-[11px] text-green-500/70 font-bold tracking-widest uppercase mb-1">Hot Deal 특가</p>
            {h.original_price && h.original_price > h.price && (
              <div className="flex items-center gap-2 mb-1">
                {discountPct && (
                  <span className="text-[11px] font-black text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-md">
                    {discountPct}% ↓
                  </span>
                )}
                <span className="text-[12px] text-neutral-600 line-through">
                  {h.original_price.toLocaleString()}원
                </span>
              </div>
            )}
            <div className="flex items-baseline gap-1 leading-none">
              <span className="text-[42px] font-black text-green-400 tracking-tighter">
                {h.price.toLocaleString()}
              </span>
              <span className="text-[22px] font-black text-green-400">원</span>
            </div>
          </div>
        )}

        {/* 테이블 위치 */}
        {(hasFloorPlan || hasTableInfo) && (
          <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-neutral-500" />
              <p className="text-[14px] font-bold text-white">테이블 위치</p>
            </div>
            {hasFloorPlan && (
              <div className="relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={h.club.floor_plan_url!}
                  alt="테이블 위치"
                  className="w-full object-contain block select-none pointer-events-none"
                  style={{ maxHeight: "260px" }}
                  draggable={false}
                />
              </div>
            )}
            {hasTableInfo && (
              <div className="flex items-center gap-2 justify-center">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[12px] text-amber-400 font-bold">{h.table_info}</span>
                <span className="text-[11px] text-neutral-500">테이블</span>
              </div>
            )}
          </div>
        )}

        {/* 포함 주류 + 테이블 구성 */}
        {(hasLiquor || hasFeatures) && (
          <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-3">
            {hasLiquor && (
              <div className="space-y-2">
                <p className="text-[11px] text-neutral-500 font-bold">포함 주류</p>
                <div className="flex flex-wrap gap-1.5">
                  {h.liquor_includes!.map((item) => (
                    <span key={item} className="px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-[12px] font-bold">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hasFeatures && (
              <div className="space-y-2">
                <p className="text-[11px] text-neutral-500 font-bold">테이블 구성</p>
                <div className="flex flex-wrap gap-1.5">
                  {h.table_features!.map((f) => (
                    <span key={f} className="px-2.5 py-1 bg-neutral-800 text-neutral-200 rounded-lg text-[12px] font-bold">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MD의 한마디 */}
        {h.description && (
          <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl px-4 py-3 space-y-1">
            <p className="text-[11px] text-neutral-500 font-bold">MD의 한마디</p>
            <p className="text-[13px] text-white leading-relaxed whitespace-pre-line">
              {h.description}
            </p>
          </div>
        )}

        {/* 담당 파트너 */}
        {h.md && (
          <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-4 space-y-3">
            <p className="text-[11px] text-neutral-500 font-bold">담당 MD</p>
            <div className="flex items-center gap-3">
              {h.md.profile_image ? (
                <div className="relative w-11 h-11 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                  <Image src={h.md.profile_image} alt={h.md.display_name} fill sizes="44px" className="object-cover" />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center text-[14px] font-black text-white/60 shrink-0">
                  {h.md.display_name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-[14px] font-black truncate">{h.md.display_name}</p>
                {h.md.instagram && (
                  <a
                    href={`https://instagram.com/${h.md.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-pink-400 inline-flex items-center gap-1"
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    @{h.md.instagram}
                  </a>
                )}
              </div>
            </div>
            {h.md.instagram && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="w-full h-11 rounded-full bg-neutral-800 hover:bg-neutral-700 active:scale-95 transition-transform text-white font-black text-[13px] inline-flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? "복사됐어요. 붙여넣어 보내세요" : "문의 메시지 복사하기"}
                </button>
                <a
                  href={`https://instagram.com/${h.md.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full h-11 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 transition-transform text-black font-black text-[13px] flex items-center justify-center"
                >
                  문의하기
                </a>
              </div>
            )}
          </div>
        )}

        {expired && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-[12px] text-red-300 text-center font-bold">
            마감된 핫딜이에요
          </div>
        )}
      </div>
    </div>
  );
}
