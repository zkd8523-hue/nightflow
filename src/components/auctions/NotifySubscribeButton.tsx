"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuctionStartNotify } from "@/hooks/useAuctionStartNotify";
import { getErrorMessage, logError } from "@/lib/utils/error";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NotifySubscribeButtonProps {
  auctionId: string;
  compact?: boolean;
}

export function NotifySubscribeButton({ auctionId, compact = false }: NotifySubscribeButtonProps) {
  const { user, isLoading: userLoading } = useCurrentUser();
  const supabase = createClient();

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!user);
  const [loading, setLoading] = useState(false);
  const [showPhoneSheet, setShowPhoneSheet] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [consent, setConsent] = useState(false);

  // 기존 in-app 알림도 유지 (보조 수단, compact 모드에서는 Realtime 구독 생략)
  useAuctionStartNotify(auctionId, !compact && isSubscribed);

  // 구독 상태 확인
  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setInitialLoading(false);
      return;
    }

    async function checkSubscription() {
      const { data } = await supabase
        .from("auction_notify_subscriptions")
        .select("id")
        .eq("auction_id", auctionId)
        .eq("user_id", user!.id)
        .limit(1);

      if (data && data.length > 0) {
        setIsSubscribed(true);
      }
      setInitialLoading(false);
    }

    checkSubscription();
  }, [user, userLoading, auctionId, supabase]);

  const handleClick = async () => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }

    // 이미 구독 중이면 해제
    if (isSubscribed) {
      setLoading(true);
      try {
        await supabase
          .from("auction_notify_subscriptions")
          .delete()
          .eq("auction_id", auctionId)
          .eq("user_id", user.id);

        setIsSubscribed(false);
        toast.success("알림이 해제되었습니다");
      } catch (error: unknown) {
        logError(error, "Notify Unsubscribe");
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
      return;
    }

    // 전화번호 확인
    if (!user.phone) {
      setShowPhoneSheet(true);
      return;
    }

    // 구독 등록
    await subscribe(user.phone);
  };

  const subscribe = async (phone: string) => {
    if (!user) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from("auction_notify_subscriptions")
        .insert({
          user_id: user.id,
          auction_id: auctionId,
          phone,
        });

      if (error) {
        if (error.code === "23505") {
          // unique constraint - 이미 구독됨
          setIsSubscribed(true);
          return;
        }
        throw error;
      }

      setIsSubscribed(true);
      toast.success("경매 시작 시 카카오 알림톡으로 알려드릴게요!");
    } catch (error: unknown) {
      logError(error, "Notify Subscribe");
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSubmit = async () => {
    if (!user) return;

    const cleanPhone = phoneInput.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      toast.error("올바른 전화번호를 입력해주세요");
      return;
    }

    if (!consent) {
      toast.error("알림톡 수신 동의가 필요합니다");
      return;
    }

    setLoading(true);
    try {
      // 전화번호 + 동의 저장
      await supabase
        .from("users")
        .update({
          phone: cleanPhone,
          alimtalk_consent: true,
          alimtalk_consent_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      setShowPhoneSheet(false);

      // 구독 등록
      await subscribe(cleanPhone);
    } catch (error: unknown) {
      logError(error, "Phone Save");
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {compact ? (
        <button
          onClick={handleClick}
          disabled={loading || initialLoading}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-[0.95] ${
            initialLoading
              ? "bg-neutral-800 text-neutral-400 border border-neutral-700"
              : isSubscribed
                ? "bg-white text-black"
                : "bg-neutral-800 text-neutral-400 border border-neutral-700"
          }`}
          title={isSubscribed ? "알림 해제" : "경매 시작 알림받기"}
        >
          {loading || initialLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Bell className={`w-4 h-4 ${isSubscribed ? "fill-current" : ""}`} />
          )}
        </button>
      ) : (
        <button
          onClick={handleClick}
          disabled={loading || initialLoading}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
            isSubscribed
              ? "bg-neutral-800 border border-neutral-700 text-white"
              : "bg-neutral-900 border border-neutral-800 text-neutral-400"
          }`}
        >
          {loading || initialLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSubscribed ? (
            <>
              <BellOff className="w-4 h-4" />
              알림 해제하기
            </>
          ) : (
            <>
              <Bell className="w-4 h-4" />
              경매 시작 알림받기
            </>
          )}
        </button>
      )}

      {/* 전화번호 입력 Sheet */}
      <Sheet open={showPhoneSheet} onOpenChange={setShowPhoneSheet}>
        <SheetContent
          side="bottom"
          className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-white font-black text-xl">
              알림톡 수신 설정
            </SheetTitle>
            <SheetDescription className="text-neutral-400">
              경매 시작 시 카카오 알림톡으로 알려드립니다
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <label className="text-sm text-neutral-400 font-bold">
                휴대폰 번호
              </label>
              <Input
                type="tel"
                placeholder="01012345678"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="bg-neutral-900/80 border-neutral-800 h-12 text-white font-bold"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-neutral-700 bg-neutral-900 accent-neutral-400"
              />
              <span className="text-sm text-neutral-400 leading-relaxed">
                카카오 알림톡 수신에 동의합니다. 경매 시작, 낙찰, 결제 등
                거래 관련 알림이 발송됩니다.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3 pb-8">
              <Button
                variant="outline"
                onClick={() => setShowPhoneSheet(false)}
                className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
              >
                취소
              </Button>
              <Button
                onClick={handlePhoneSubmit}
                disabled={loading || !consent || !phoneInput}
                className="h-14 rounded-2xl font-black text-lg bg-white hover:bg-neutral-200 text-black"
              >
                {loading ? "처리 중..." : "확인"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
