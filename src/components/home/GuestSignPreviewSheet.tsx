"use client";

import Link from "next/link";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowDown, ArrowLeft, Instagram, MessageCircle } from "lucide-react";

const PREVIEW_THUMBNAIL_URL =
  "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/822ac995-23d0-4bff-9d31-960cb8602f0e/1778968708059.png";

const PREVIEW_MD_AVATAR_URL =
  "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/avatars/a65329d2-da8a-48ad-aa96-2bf1d77ae275/avatar.webp?t=1778984965183";

const PREVIEW_MD_INSTAGRAM = "Nightflow.kr";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * MD가 게스트 간판이 어떻게 자기 광고판이 되는지 한눈에 보여주는 시각 가이드.
 * 1. "오늘 어디갈래?" 카드 미리보기 (가짜 데이터)
 * 2. 유저가 누르면 상세 페이지로 → 본인 인스타·연락처 노출
 * 3. CTA: 광고판 차지하러 가기
 */
export function GuestSignPreviewSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[#0A0A0A] border-neutral-800 rounded-t-3xl !h-[88vh] !max-h-[88vh] !gap-0 !p-0 !flex !flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>게스트 간판 광고판 미리보기</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-8 pb-8 space-y-5">
          <div className="space-y-1">
            <p className="text-[12px] text-amber-400 font-black tracking-wider">PREVIEW</p>
            <h2 className="text-[22px] font-black text-white tracking-tight">
              내 게스트 광고판이 됩니다
              <span className="text-[13px] font-bold text-neutral-400 ml-1.5">(1클럽 1파트너 · 선착순)</span>
            </h2>
            <p className="text-[13px] text-neutral-400 leading-snug">
              유저가 홈에서 내 클럽을 발견하고
              <br />
              인스타·전화로 직접 문의해요
            </p>
          </div>

          {/* Step 1: 홈 노출 미리보기 */}
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">1</div>
              <p className="text-[13px] text-white font-bold">홈 &quot;오늘 어디갈래?&quot; 상위 노출</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3">
              <div className="flex gap-2 items-start">
                <div className="w-[70%] max-w-[280px] flex-shrink-0">
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-neutral-900">
                    <Image
                      src={PREVIEW_THUMBNAIL_URL}
                      alt="Club NightFlow"
                      fill
                      sizes="280px"
                      className="object-cover"
                    />
                    <div className="absolute top-0 inset-x-0 bg-amber-500 px-2.5 py-1.5 z-10">
                      <span className="block text-black text-[12px] font-black tracking-tight leading-tight whitespace-nowrap">
                        🎁 11시 이전 프리드링크 1잔
                      </span>
                    </div>
                  </div>
                  <p className="text-white font-bold text-[13px] mt-2">Club NightFlow</p>
                  <p className="text-neutral-500 text-[11px]">홍대</p>
                </div>
                <div className="flex-1 pt-12">
                  <div className="inline-flex items-center gap-1 text-amber-400 text-[10px] font-bold">
                    <ArrowLeft className="w-3 h-3" />
                    유저가 보고 클릭
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-amber-500" />
          </div>

          {/* Step 2: 상세 페이지에 본인 정보 노출 */}
          <div className="bg-[#1C1C1E] border border-neutral-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">2</div>
              <p className="text-[13px] text-white font-bold">상세 페이지에 내 인스타·연락처 공개</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                  <Image
                    src={PREVIEW_MD_AVATAR_URL}
                    alt="NightFlow.kr"
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-[13px] truncate">NightFlow.kr</p>
                  <p className="text-neutral-500 text-[11px]">담당 파트너</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-gradient-to-r from-pink-500/20 to-fuchsia-500/20 border border-pink-500/30 rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-pink-400" />
                  <span className="text-pink-300 text-[11px] font-bold truncate">@{PREVIEW_MD_INSTAGRAM}</span>
                </div>
                <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-green-300 text-[11px] font-bold truncate">오픈채팅</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-amber-500" />
          </div>

          {/* Step 3: 직접 컨택 */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">3</div>
              <p className="text-[13px] text-white font-bold">게스트가 직접 찾아옴</p>
            </div>
            <p className="text-[12px] text-amber-100 leading-snug pl-8">
              인스타 DM · 전화 · 카톡으로
              <br />
              유저가 먼저 연락합니다
            </p>
          </div>

          {/* CTA */}
          <Link
            href="/md/dashboard?section=guestsign"
            onClick={() => onOpenChange(false)}
            className="w-full h-14 bg-amber-500 text-black font-black text-[15px] rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            🎫 내 광고판 차지하러 가기
          </Link>

          <p className="text-[11px] text-neutral-600 text-center">
            매주 월 18:00 새 간판 오픈 · 1파트너 1클럽 1주 · 무료
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
