"use client";

import { useState, useEffect, useMemo } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
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

interface AreaNotifyBannerProps {
  selectedArea: string | null;
  variant: "inline" | "empty-state";
}

export function AreaNotifyBanner({ selectedArea, variant }: AreaNotifyBannerProps) {
  const { user, isLoading: userLoading } = useCurrentUser();
  const supabase = useMemo(() => createClient(), []);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribedViaAll, setSubscribedViaAll] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!user);
  const [loading, setLoading] = useState(false);
  const [showPhoneSheet, setShowPhoneSheet] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [consent, setConsent] = useState(false);

  // 구독할 지역 키 ("전체" 또는 특정 지역)
  const areaKey = selectedArea || "전체";

  // 구독 상태 확인
  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setIsSubscribed(false);
      setInitialLoading(false);
      return;
    }

    let cancelled = false;

    async function checkSubscription() {
      // 특정 지역이면 "전체" 구독도 함께 확인
      const areas = areaKey === "전체" ? ["전체"] : [areaKey, "전체"];
      const { data } = await supabase
        .from("area_notify_subscriptions")
        .select("id, area")
        .eq("user_id", user!.id)
        .in("area", areas)
        .limit(2);

      if (!cancelled) {
        const hasExact = data?.some(d => d.area === areaKey) ?? false;
        const hasAll = areaKey !== "전체" && (data?.some(d => d.area === "전체") ?? false);
        setIsSubscribed(hasExact || hasAll);
        setSubscribedViaAll(!hasExact && hasAll);
        setInitialLoading(false);
      }
    }

    checkSubscription();
    return () => { cancelled = true; };
  }, [user, userLoading, areaKey, supabase]);

  const handleClick = async () => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }

    // 이미 구독 중이면 해제
    if (isSubscribed) {
      // "전체" 구독에 포함된 경우 안내만
      if (subscribedViaAll) {
        toast("전체 지역 알림에 포함되어 있습니다", {
          description: "'전체'에서 알림을 해제해주세요",
        });
        return;
      }
      setLoading(true);
      try {
        await supabase
          .from("area_notify_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("area", areaKey);

        setIsSubscribed(false);
        toast.success("알림이 해제되었습니다");
      } catch (error: unknown) {
        logError(error, "Area Notify Unsubscribe");
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

    await subscribe(user.phone);
  };

  const subscribe = async (phone: string) => {
    if (!user) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from("area_notify_subscriptions")
        .insert({
          user_id: user.id,
          area: areaKey,
          phone,
        });

      if (error) {
        if (error.code === "23505") {
          setIsSubscribed(true);
          return;
        }
        throw error;
      }

      setIsSubscribed(true);
      toast.success(`${areaKey} 지역에 새 경매가 올라오면 알려드릴게요!`);
    } catch (error: unknown) {
      logError(error, "Area Notify Subscribe");
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
      await supabase
        .from("users")
        .update({
          phone: cleanPhone,
          alimtalk_consent: true,
          alimtalk_consent_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      setShowPhoneSheet(false);
      await subscribe(cleanPhone);
    } catch (error: unknown) {
      logError(error, "Area Notify Phone Save");
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // ── inline variant: 지역 필터 바 아래 컴팩트 배너 ──
  if (variant === "inline") {
    return (
      <>
        <button
          onClick={handleClick}
          disabled={loading || initialLoading}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] ${
            isSubscribed
              ? "bg-white/5 border border-neutral-700 text-neutral-300"
              : "bg-neutral-900 border border-neutral-800 text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {loading || initialLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isSubscribed ? (
            <>
              <BellOff className="w-3.5 h-3.5" />
              {areaKey} 알림 해제하기
            </>
          ) : (
            <>
              <Bell className="w-3.5 h-3.5" />
              {areaKey} 새 경매 알림 받기
            </>
          )}
        </button>

        <PhoneSheet
          open={showPhoneSheet}
          onOpenChange={setShowPhoneSheet}
          phoneInput={phoneInput}
          onPhoneChange={setPhoneInput}
          consent={consent}
          onConsentChange={setConsent}
          loading={loading}
          onSubmit={handlePhoneSubmit}
        />
      </>
    );
  }

  // ── empty-state variant: 빈 상태 카드형 CTA ──
  return (
    <>
      <div className="bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center">
            <Bell className="w-4 h-4 text-neutral-400" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-white">
              {isSubscribed ? "새 경매가 올라오면 알려드립니다!" : "새 경매가 올라오면 알려드릴까요?"}
            </p>
            <p className="text-[11px] text-neutral-500">
              {areaKey} 지역 경매 시작 시 카카오 알림톡 발송
            </p>
          </div>
        </div>
        <button
          onClick={handleClick}
          disabled={loading || initialLoading}
          className={`w-full h-11 rounded-xl text-[13px] font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
            isSubscribed
              ? "bg-neutral-800 border border-neutral-700 text-neutral-300"
              : "bg-white text-black hover:bg-neutral-200"
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
              알림 받기
            </>
          )}
        </button>
      </div>

      <PhoneSheet
        open={showPhoneSheet}
        onOpenChange={setShowPhoneSheet}
        phoneInput={phoneInput}
        onPhoneChange={setPhoneInput}
        consent={consent}
        onConsentChange={setConsent}
        loading={loading}
        onSubmit={handlePhoneSubmit}
      />
    </>
  );
}

// ── 전화번호 수집 Sheet (재사용 내부 컴포넌트) ──
function PhoneSheet({
  open,
  onOpenChange,
  phoneInput,
  onPhoneChange,
  consent,
  onConsentChange,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneInput: string;
  onPhoneChange: (v: string) => void;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto bg-[#1C1C1E] border-neutral-800 rounded-t-3xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-white font-black text-xl">
            알림톡 수신 설정
          </SheetTitle>
          <SheetDescription className="text-neutral-400">
            새 경매 등록 시 카카오 알림톡으로 알려드립니다
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
              onChange={(e) => onPhoneChange(e.target.value)}
              className="bg-neutral-900/80 border-neutral-800 h-12 text-white font-bold"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => onConsentChange(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-neutral-700 bg-neutral-900 accent-neutral-400"
            />
            <span className="text-sm text-neutral-400 leading-relaxed">
              카카오 알림톡 수신에 동의합니다. 새 경매 등록, 입찰 관련 알림이
              발송됩니다.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 pb-8">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-14 rounded-2xl border-neutral-800 text-neutral-400 font-bold"
            >
              취소
            </Button>
            <Button
              onClick={onSubmit}
              disabled={loading || !consent || !phoneInput}
              className="h-14 rounded-2xl font-black text-lg bg-white hover:bg-neutral-200 text-black"
            >
              {loading ? "처리 중..." : "확인"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
