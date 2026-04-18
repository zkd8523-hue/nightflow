"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";
import { suggestDisplayName } from "@/lib/utils/displayName";
import { ChevronRight, Check } from "lucide-react";
import Link from "next/link";

import type { User as AuthUser } from "@supabase/supabase-js";

interface SignupFormProps {
  referralCode?: string | null;
  mdReferrer?: string | null;
}

export function SignupForm({ referralCode, mdReferrer }: SignupFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const redirectAfterSignup =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  const requiredMet = agreeAge && agreeTerms && agreePrivacy;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthUser(user);
    });
  }, [router, supabase]);

  // 전체 동의 토글
  const handleAgreeAll = () => {
    const next = !agreeAll;
    setAgreeAll(next);
    setAgreeAge(next);
    setAgreeTerms(next);
    setAgreePrivacy(next);
    setAgreeMarketing(next);
  };

  // 개별 체크 시 전체 동의 상태 동기화
  useEffect(() => {
    setAgreeAll(agreeAge && agreeTerms && agreePrivacy && agreeMarketing);
  }, [agreeAge, agreeTerms, agreePrivacy, agreeMarketing]);

  const handleSubmit = async () => {
    if (!authUser || !requiredMet) return;

    setLoading(true);

    try {
      const meta = authUser.user_metadata ?? {};
      const kakaoNickname =
        typeof meta.nickname === "string" && meta.nickname.trim().length > 0
          ? meta.nickname.trim()
          : "유저";

      let referredById: string | null = null;
      let signupSource = "direct";

      if (referralCode) {
        const { data: referrer } = await supabase
          .from("users")
          .select("id")
          .eq("referral_code", referralCode)
          .is("deleted_at", null)
          .single();
        if (referrer && referrer.id !== authUser.id) {
          referredById = referrer.id;
          signupSource = "referral";
        }
      } else if (mdReferrer) {
        referredById = mdReferrer;
        signupSource = "md_profile";
      }

      const { error } = await supabase.from("users").insert({
        id: authUser.id,
        kakao_id: meta.provider_id || authUser.id,
        display_name: suggestDisplayName(kakaoNickname),
        profile_image: meta.avatar_url || null,
        role: "user",
        alimtalk_consent: agreeMarketing,
        alimtalk_consent_at: agreeMarketing ? new Date().toISOString() : null,
        referred_by: referredById,
        signup_source: signupSource,
      });

      if (error) throw error;

      trackEvent("signup_completed", {
        user_type: "user",
        signup_source: signupSource,
        has_referrer: !!referredById,
        marketing_consent: agreeMarketing,
      });
      toast.success("가입이 완료되었습니다!");
      router.push(redirectAfterSignup);
    } catch (error: unknown) {
      logger.error("Signup error:", error);
      toast.error(error instanceof Error ? error.message : "가입 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  if (!authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">NightFlow</h1>
          <p className="text-sm text-neutral-500">
            서비스 이용을 위해 약관에 동의해주세요.
          </p>
        </div>

        <div className="space-y-3">
          {/* 전체 동의 */}
          <button
            type="button"
            onClick={handleAgreeAll}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-neutral-800/50 border border-neutral-700 hover:bg-neutral-800 transition-colors"
          >
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              agreeAll ? "bg-white border-white" : "border-neutral-600"
            }`}>
              {agreeAll && <Check className="w-4 h-4 text-black" />}
            </div>
            <span className="text-[15px] font-bold text-white">전체 동의</span>
          </button>

          <div className="h-px bg-neutral-800" />

          {/* 만 19세 이상 (필수) */}
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setAgreeAge(!agreeAge)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                agreeAge ? "bg-white border-white" : "border-neutral-600"
              }`}
            >
              {agreeAge && <Check className="w-3 h-3 text-black" />}
            </button>
            <span className="text-[14px] text-neutral-300 flex-1">
              만 19세 이상입니다 <span className="text-red-400 text-[11px]">(필수)</span>
            </span>
          </div>

          {/* 이용약관 (필수) */}
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setAgreeTerms(!agreeTerms)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                agreeTerms ? "bg-white border-white" : "border-neutral-600"
              }`}
            >
              {agreeTerms && <Check className="w-3 h-3 text-black" />}
            </button>
            <span className="text-[14px] text-neutral-300 flex-1">
              서비스 이용약관 동의 <span className="text-red-400 text-[11px]">(필수)</span>
            </span>
            <Link href="/terms" target="_blank" className="text-neutral-600 hover:text-neutral-400 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* 개인정보 처리방침 (필수) */}
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setAgreePrivacy(!agreePrivacy)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                agreePrivacy ? "bg-white border-white" : "border-neutral-600"
              }`}
            >
              {agreePrivacy && <Check className="w-3 h-3 text-black" />}
            </button>
            <span className="text-[14px] text-neutral-300 flex-1">
              개인정보 처리방침 동의 <span className="text-red-400 text-[11px]">(필수)</span>
            </span>
            <Link href="/privacy" target="_blank" className="text-neutral-600 hover:text-neutral-400 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* 마케팅 알림 수신 (선택) */}
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setAgreeMarketing(!agreeMarketing)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                agreeMarketing ? "bg-white border-white" : "border-neutral-600"
              }`}
            >
              {agreeMarketing && <Check className="w-3 h-3 text-black" />}
            </button>
            <span className="text-[14px] text-neutral-300 flex-1">
              마케팅 알림 수신 동의 <span className="text-neutral-600 text-[11px]">(선택)</span>
            </span>
          </div>
          <p className="px-4 text-[11px] text-neutral-600">
            경매 시작, 입찰 역전 등 경쟁 관련 알림을 카카오 알림톡으로 받습니다.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!requiredMet || loading}
          className="w-full h-12"
        >
          {loading ? "가입 중..." : "동의하고 시작하기"}
        </Button>
      </Card>
    </div>
  );
}
