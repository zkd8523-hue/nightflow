"use client";

import Link from "next/link";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowDown, ArrowLeft, Clock, Instagram, MessageCircle, Phone } from "lucide-react";

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
 * 핫딜이 메인에 떴을 때 어떻게 보이는지를 1-2-3 스텝으로 보여주는 시각 가이드.
 * 1. 홈 "🔥 Hot Deal Now" 캐러셀 카드 미리보기 (실제 카드 JSX 복제)
 * 2. 핫딜 상세 페이지 노출 (MD 인스타·연락처 + 가격)
 * 3. 게스트가 직접 컨택
 */
export function HotdealPreviewSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-3xl !h-[88vh] !max-h-[88vh] !gap-0 !p-0 !flex !flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>핫딜 노출 미리보기</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-8 pb-8 space-y-5">
          <div className="space-y-1">
            <p className="text-[12px] text-brand-amber font-black tracking-wider">PREVIEW</p>
            <h2 className="text-[22px] font-black text-foreground tracking-tight">
              내 핫딜이 이렇게 떠요
            </h2>
            <p className="text-[13px] text-muted-foreground leading-snug">
              유저가 앱 열자마자 보는 자리에
              <br />
              내 클럽이 최상단으로 올라가요
            </p>
          </div>

          {/* Step 1: 홈 Hot Deal Now 캐러셀 노출 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">1</div>
              <p className="text-[13px] text-foreground font-bold">홈 &quot;🔥 Hot Deal Tonight&quot; 최상단 노출</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3">
              <div className="flex gap-2 items-start">
                <div className="w-[60%] max-w-[200px] flex-shrink-0">
                  {/* 실제 HotdealHomeSection 카드 JSX 복제 */}
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-card border border-border">
                    <Image
                      src={PREVIEW_THUMBNAIL_URL}
                      alt="Club NightFlow"
                      fill
                      sizes="200px"
                      className="object-cover"
                    />
                    <div className="absolute top-0 inset-x-0 bg-black/70 backdrop-blur-sm px-2 py-1 flex items-center justify-center">
                      <span className="text-foreground text-[10px] font-black tracking-tight">선착순 마감</span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/80 to-transparent" />
                    <div className="absolute bottom-1.5 left-2 inline-flex items-center gap-1 text-brand-amber text-[11px] font-black drop-shadow">
                      <Clock className="w-3 h-3" />
                      2시간 30분 남음
                    </div>
                  </div>
                  <div className="mt-2 px-0.5 space-y-0.5">
                    <p className="text-foreground font-bold text-[13px] truncate leading-tight">
                      Club NightFlow
                    </p>
                    <p className="text-muted-foreground text-[11px]">홍대</p>
                    <div className="pt-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-black text-red-400">30%</span>
                        <span className="text-[11px] text-muted-foreground line-through">120,000원</span>
                      </div>
                      <span className="text-[15px] font-black text-foreground">84,000원</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 pt-12">
                  <div className="inline-flex items-center gap-1 text-brand-amber text-[10px] font-bold">
                    <ArrowLeft className="w-3 h-3" />
                    유저가 보고 클릭
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-brand-amber" />
          </div>

          {/* Step 2: 상세 페이지에 본인 정보 + 혜택 노출 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">2</div>
              <p className="text-[13px] text-foreground font-bold">상세 페이지에 내 정보·혜택 공개</p>
            </div>
            <div className="bg-black/40 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                  <Image
                    src={PREVIEW_MD_AVATAR_URL}
                    alt="NightFlow.kr"
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-bold text-[13px] truncate">NightFlow.kr</p>
                  <p className="text-muted-foreground text-[11px]">담당 파트너</p>
                </div>
              </div>
              <div className="bg-card/60 rounded-lg px-3 py-2 space-y-1">
                <p className="text-foreground text-[13px] font-bold">🍾 테이블 1세트 + 프리드링크 2잔</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-black text-red-400">30%</span>
                  <span className="text-[11px] text-muted-foreground line-through">120,000원</span>
                  <span className="text-[15px] font-black text-foreground">84,000원</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gradient-to-r from-pink-500/20 to-fuchsia-500/20 border border-pink-500/30 rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-pink-400" />
                  <span className="text-pink-300 text-[11px] font-bold truncate">@{PREVIEW_MD_INSTAGRAM}</span>
                </div>
                <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-money" />
                  <span className="text-money text-[11px] font-bold truncate">오픈채팅</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-brand-amber" />
          </div>

          {/* Step 3: 직접 컨택 → 즉시 송객 */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">3</div>
              <p className="text-[13px] text-foreground font-bold">게스트가 직접 연락 → 즉시 송객</p>
            </div>
            <div className="flex items-center justify-around bg-black/30 rounded-xl py-3">
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-pink-400" />
                </div>
                <span className="text-[10px] text-muted-foreground font-bold">DM</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-money" />
                </div>
                <span className="text-[10px] text-muted-foreground font-bold">전화</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-yellow-400" />
                </div>
                <span className="text-[10px] text-muted-foreground font-bold">카톡</span>
              </div>
            </div>
            <p className="text-[12px] text-amber-100 leading-snug pl-8">
              입찰·대기 없이 바로 만나요
            </p>
          </div>

          {/* CTA */}
          <Link
            href="/md/hotdeal-now?new=1"
            onClick={() => onOpenChange(false)}
            className="w-full h-14 bg-amber-500 text-black font-black text-[15px] rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            🔥 지금 핫딜 등록하기
          </Link>


        </div>
      </SheetContent>
    </Sheet>
  );
}
