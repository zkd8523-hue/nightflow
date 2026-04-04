"use client";

import { useState, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { Auction, ContactMethodType } from "@/types/database";
import { formatPrice, formatNumber } from "@/lib/utils/format";
import { isAuctionActive } from "@/lib/utils/auction";
import { getVisibleContactMethods } from "@/lib/utils/contact-methods";
import { ShieldCheck, MessageCircle, Instagram, Phone } from "lucide-react";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { trackEvent } from "@/lib/analytics";

interface MDContactInfo {
  name: string | null;
  instagram: string | null;
  phone: string | null;
  kakao_open_chat_url: string | null;
  preferred_contact_methods: ContactMethodType[] | null;
}

interface InstantBuyPanelProps {
  auction: Auction;
  onInterestRegistered?: () => void;
  alreadyInterested?: boolean;
}

export const InstantBuyPanel = memo(function InstantBuyPanel({
  auction,
  onInterestRegistered,
  alreadyInterested = false,
}: InstantBuyPanelProps) {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [mdContact, setMdContact] = useState<MDContactInfo | null>(null);
  const [interested, setInterested] = useState(alreadyInterested);

  // alreadyInterested가 바뀌면 동기화 + MD 연락처 미리 로드
  useEffect(() => {
    if (alreadyInterested && !interested) setInterested(true);
    if (alreadyInterested && !mdContact) {
      fetch("/api/auction/chat-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId: auction.id }),
      })
        .then(res => res.json())
        .then(data => { if (data.md) setMdContact(data.md); })
        .catch(() => {});
    }
  }, [alreadyInterested]);

  const isActive = isAuctionActive(auction);
  const price = auction.start_price;

  const handleInterest = async () => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auction/chat-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId: auction.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes("자신의 경매")) {
          toast.error("자신의 경매는 예약할 수 없습니다.");
        } else if (data.error?.includes("차단")) {
          toast.error("계정이 차단되어 예약할 수 없습니다.");
        } else if (data.error?.includes("정지")) {
          toast.error("이용이 정지된 계정입니다.");
        } else if (data.error?.includes("not active")) {
          toast.error("판매가 종료되었습니다.");
        } else {
          toast.error(data.error || "처리 중 문제가 발생했습니다.");
        }
        return;
      }

      trackEvent("instant_interest", {
        auction_id: auction.id,
        price,
        club_name: auction.club?.name,
      });

      setInterested(true);
      setMdContact(data.md);
      setShowConfirm(false);
      setShowContact(true);
      onInterestRegistered?.();

      toast.success("예약 관심이 등록되었습니다!");
    } catch (error: unknown) {
      logError(error, "InstantBuyPanel.handleInterest");
      const msg = getErrorMessage(error);
      if (error instanceof TypeError && msg.includes("fetch")) {
        toast.error("네트워크 연결이 불안정합니다.");
      } else {
        toast.error("처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 이미 관심 등록한 유저가 연락처를 다시 볼 때
  const handleShowContact = () => {
    if (mdContact) {
      setShowContact(true);
    } else {
      // 연락처를 다시 가져옴
      handleInterest();
    }
  };

  const visibleMethods = getVisibleContactMethods(mdContact);

  return (
    <>
      <Card className="p-3 space-y-2.5 bg-[#1C1C1E] border-neutral-800/50">
        {/* 판매가 */}
        <div className="px-1">
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">판매가</p>
          <div className="flex items-baseline font-black text-white tracking-tighter leading-none mt-1">
            <span className="text-[32px]">{formatNumber(price)}</span>
            <span className="text-[18px] ml-0.5 font-bold">원</span>
          </div>
        </div>

        {/* 예약하기 / MD 연락처 보기 버튼 */}
        {interested ? (
          <Button
            className="w-full h-12 text-base font-black rounded-xl transition-all active:scale-[0.98] bg-green-600 hover:bg-green-500 text-white"
            onClick={handleShowContact}
          >
            MD 연락처 보기
          </Button>
        ) : (
          <Button
            className={`w-full h-12 text-base font-black rounded-xl transition-all active:scale-[0.98] ${
              isActive && !loading
                ? "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                : "bg-neutral-800 text-neutral-500 shadow-none cursor-not-allowed"
            }`}
            onClick={() => setShowConfirm(true)}
            disabled={!isActive || loading}
          >
            {isActive ? "예약하기" : "판매 종료"}
          </Button>
        )}

        {/* 신뢰 + 안내 */}
        {isActive && (
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <p className="text-[11px] text-neutral-500 font-medium">
              매장에서 MD에게 직접 결제합니다
            </p>
          </div>
        )}
      </Card>

      {/* 확인 시트: 예약 확인 */}
      <Sheet open={showConfirm} onOpenChange={setShowConfirm}>
        <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">
              예약 확인
            </SheetTitle>
            <SheetDescription className="text-neutral-400">
              MD 연락처를 확인하시겠습니까?
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="bg-neutral-900/50 rounded-2xl p-4 space-y-3 border border-neutral-800/50">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 text-sm font-bold">상품</span>
                <span className="font-bold text-white text-right max-w-[200px] truncate">{auction.title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 text-sm font-bold">판매가</span>
                <span className="font-black text-2xl text-amber-400">
                  {formatPrice(price)}
                </span>
              </div>
              <div className="h-px bg-neutral-800/30" />
              <div className="flex items-start gap-2 pt-1">
                <ShieldCheck className="w-4 h-4 text-neutral-400 mt-0.5" />
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  예약하기를 누르면 MD 연락처가 표시됩니다. MD에게 직접 연락하여 방문을 확정하세요.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pb-8">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
              >
                취소
              </Button>
              <Button
                onClick={handleInterest}
                disabled={loading}
                className="h-14 rounded-2xl font-black text-lg text-black bg-amber-500 hover:bg-amber-400"
              >
                {loading ? "처리 중..." : "예약하기"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* MD 연락처 시트 */}
      <Sheet open={showContact} onOpenChange={setShowContact}>
        <SheetContent side="bottom" className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">
              {mdContact?.name ? `${mdContact.name} MD 연락처` : "MD 연락처"}
            </SheetTitle>
            <SheetDescription className="text-neutral-400">
              MD에게 직접 연락하여 방문을 확정하세요
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 mt-6 pb-8">
            {visibleMethods.includes("dm") && mdContact?.instagram && (
              <Button
                onClick={() => {
                  trackEvent("instant_contact", { auction_id: auction.id, contact_type: "dm" });
                  window.open(`https://instagram.com/${mdContact.instagram}`, "_blank", "noopener,noreferrer");
                }}
                className="w-full h-auto py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:opacity-90 flex flex-col items-center gap-0.5"
              >
                <span className="flex items-center gap-2 font-black text-sm">
                  <Instagram className="w-4 h-4" />
                  인스타그램 DM
                </span>
                <span className="text-[11px] font-medium text-white/70">@{mdContact.instagram}</span>
              </Button>
            )}

            {visibleMethods.includes("kakao") && mdContact?.kakao_open_chat_url && (
              <Button
                onClick={() => {
                  trackEvent("instant_contact", { auction_id: auction.id, contact_type: "kakao" });
                  window.open(mdContact.kakao_open_chat_url!, "_blank", "noopener,noreferrer");
                }}
                className="w-full h-auto py-3 bg-[#FEE500] text-[#191919] rounded-xl hover:bg-[#FDD835] flex flex-col items-center gap-0.5"
              >
                <span className="flex items-center gap-2 font-black text-sm">
                  <MessageCircle className="w-4 h-4" />
                  카카오톡 오픈채팅
                </span>
              </Button>
            )}

            {visibleMethods.includes("phone") && mdContact?.phone && (
              <Button
                onClick={() => {
                  trackEvent("instant_contact", { auction_id: auction.id, contact_type: "phone" });
                  window.location.href = `tel:${mdContact.phone}`;
                }}
                className="w-full h-11 bg-white text-black font-black text-sm rounded-xl flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" />
                전화
              </Button>
            )}

            {visibleMethods.length === 0 && (
              <div className="text-center py-6 text-neutral-500 text-sm">
                연락처 정보가 없습니다. 잠시 후 다시 시도해주세요.
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 pt-2">
              <ShieldCheck className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <p className="text-[11px] text-neutral-500 font-medium">
                매장에서 MD에게 직접 결제합니다
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}, (prev, next) => {
  return (
    prev.auction.id === next.auction.id &&
    prev.auction.status === next.auction.status &&
    prev.auction.start_price === next.auction.start_price &&
    prev.alreadyInterested === next.alreadyInterested
  );
});
