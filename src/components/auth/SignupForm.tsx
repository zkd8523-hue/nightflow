"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";
import { validateDisplayName, isDisplayNameTaken } from "@/lib/utils/displayName";
import { ChevronRight, Check } from "lucide-react";
import Link from "next/link";

import type { User as AuthUser } from "@supabase/supabase-js";

function formatKoreanPhone(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

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
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  const requiredMet = agreeAge && agreeTerms && agreePrivacy;

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      // 모바일에서 쿠키 설정 지연 대응: 최대 3회 재시도
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          setAuthUser(user);
          return;
        }
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      // 3회 모두 실패
      if (!cancelled) {
        router.push("/login?error=session_expired");
      }
    };

    checkSession();
    return () => { cancelled = true; };
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

    // 닉네임 검증
    const trimmedName = displayName.trim();
    const validation = validateDisplayName(trimmedName);
    if (!validation.ok) {
      setNameError(validation.message || "닉네임을 확인해주세요.");
      return;
    }

    // 전화번호 검증
    const trimmedPhone = phone.replace(/[^0-9]/g, "");
    if (!/^01[016789]\d{7,8}$/.test(trimmedPhone)) {
      setPhoneError("올바른 휴대폰 번호를 입력해주세요 (예: 010-1234-5678)");
      return;
    }

    setLoading(true);
    setNameError("");
    setPhoneError("");

    try {
      // 중복 체크
      const taken = await isDisplayNameTaken(supabase, trimmedName);
      if (taken) {
        setNameError("이미 사용 중인 닉네임입니다.");
        setLoading(false);
        return;
      }

      const meta = authUser.user_metadata ?? {};

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
        display_name: trimmedName,
        phone: trimmedPhone,
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
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] p-4">
      <Card className="w-full max-w-md p-8 space-y-6 bg-[#1C1C1E] border border-neutral-800 shadow-2xl">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight">NightFlow</h1>
          <p className="text-sm text-neutral-400">
            더 뜨거운 주말까지 딱 한걸음!
          </p>
        </div>

        {/* 닉네임 입력 */}
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-neutral-300">
            닉네임
          </label>
          <Input
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (nameError) setNameError("");
            }}
            maxLength={16}
            placeholder="2-16자"
            className="h-11 bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500 focus-visible:border-white"
          />
          {nameError && (
            <p className="text-[12px] text-red-400 font-bold">{nameError}</p>
          )}
          <p className="text-[11px] text-neutral-500">나중에 프로필에서 언제든지 변경할 수 있어요.</p>
        </div>

        {/* 전화번호 입력 */}
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-neutral-300">
            휴대폰 번호
          </label>
          <Input
            type="tel"
            inputMode="numeric"
            value={formatKoreanPhone(phone)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 11);
              setPhone(digits);
              if (phoneError) setPhoneError("");
            }}
            maxLength={13}
            placeholder="010-1234-5678"
            className="h-11 bg-neutral-800 border-neutral-700 text-white font-mono placeholder:text-neutral-500 focus-visible:border-white"
          />
          {phoneError && (
            <p className="text-[12px] text-red-400 font-bold">{phoneError}</p>
          )}
          <p className="text-[11px] text-neutral-500">낙찰 알림, 경매 알림 수신에 사용됩니다.</p>
        </div>

        <div className="space-y-3">
          {/* 전체 동의 */}
          <button
            type="button"
            onClick={handleAgreeAll}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition-colors"
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
