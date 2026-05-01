"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";
import { generateRandomNickname } from "@/lib/utils/displayName";
import { ChevronRight, Check, ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { User as AuthUser } from "@supabase/supabase-js";

interface SignupFormProps {
  referralCode?: string | null;
  mdReferrer?: string | null;
}

type Step = "agree" | "phone" | "otp";

const RESEND_COOLDOWN_SEC = 60;

const formatPhoneDisplay = (raw: string) => {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const sendOtpErrorMessage = (code: string): string => {
  switch (code) {
    case "invalid_phone": return "올바른 휴대폰 번호를 입력해주세요";
    case "phone_already_registered": return "이미 가입된 번호입니다";
    case "phone_cooldown":
    case "rate_limited": return "너무 자주 시도했습니다. 잠시 후 다시 시도해주세요";
    case "sms_send_failed": return "SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요";
    default: return "인증번호 발송 중 오류가 발생했습니다";
  }
};

const verifyOtpErrorMessage = (code: string): string => {
  switch (code) {
    case "wrong_code": return "인증번호가 일치하지 않습니다";
    case "expired": return "인증번호가 만료되었습니다. 다시 받아주세요";
    case "too_many_attempts": return "시도 횟수를 초과했습니다. 다시 받아주세요";
    case "no_pending_verification": return "발송된 인증번호가 없습니다. 다시 받아주세요";
    case "already_verified": return "인증번호가 이미 사용됐습니다. 다시 받아주세요";
    default: return "인증 중 오류가 발생했습니다";
  }
};

export function SignupForm({ referralCode, mdReferrer }: SignupFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const redirectAfterSignup =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [step, setStep] = useState<Step>("agree");

  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  const [phoneInput, setPhoneInput] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const requiredMet = agreeAge && agreeTerms && agreePrivacy;

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) { setAuthUser(user); return; }
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
      if (!cancelled) router.push("/login?error=session_expired");
    };
    checkSession();
    return () => { cancelled = true; };
  }, [router, supabase]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleAgreeAll = () => {
    const next = !agreeAll;
    setAgreeAll(next);
    setAgreeAge(next);
    setAgreeTerms(next);
    setAgreePrivacy(next);
    setAgreeMarketing(next);
  };

  useEffect(() => {
    setAgreeAll(agreeAge && agreeTerms && agreePrivacy && agreeMarketing);
  }, [agreeAge, agreeTerms, agreePrivacy, agreeMarketing]);

  const handleAgreeNext = () => {
    if (!requiredMet) return;
    setStep("phone");
  };

  const phoneDigits = phoneInput.replace(/\D/g, "");
  const phoneValid = /^01[016789]\d{7,8}$/.test(phoneDigits);

  const handleSendOtp = async () => {
    if (!phoneValid || otpSending) return;
    setOtpSending(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits, purpose: "signup" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(sendOtpErrorMessage(data.error));
        return;
      }
      toast.success("인증번호를 보냈어요");
      setStep("otp");
      setOtpCode("");
      setResendIn(RESEND_COOLDOWN_SEC);
    } catch (err) {
      logger.error("send-otp failed:", err);
      toast.error("네트워크 오류가 발생했습니다");
    } finally {
      setOtpSending(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendIn > 0) return;
    await handleSendOtp();
  };

  const handleVerifyAndSignup = async () => {
    if (!authUser) return;
    if (!/^\d{6}$/.test(otpCode)) {
      toast.error("6자리 숫자를 입력해주세요");
      return;
    }
    setOtpVerifying(true);
    try {
      const verifyRes = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits, code: otpCode, purpose: "signup" }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        toast.error(verifyOtpErrorMessage(verifyData.error));
        if (["already_verified", "expired", "too_many_attempts", "no_pending_verification"].includes(verifyData.error)) {
          setStep("phone");
          setOtpCode("");
          setResendIn(0);
        }
        return;
      }

      const verifiedPhone: string = verifyData.phone;

      setLoading(true);
      const displayName = await generateRandomNickname(supabase);
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
        display_name: displayName,
        phone: verifiedPhone,
        profile_image: meta.avatar_url || null,
        role: "user",
        alimtalk_consent: agreeMarketing,
        alimtalk_consent_at: agreeMarketing ? new Date().toISOString() : null,
        referred_by: referredById,
        signup_source: signupSource,
      });

      if (error) {
        const msg = (error as { message?: string }).message || "가입 중 오류가 발생했습니다";
        logger.error("Signup insert error:", error);
        toast.error(msg);
        return;
      }

      trackEvent("signup_completed", {
        user_type: "user",
        signup_source: signupSource,
        has_referrer: !!referredById,
        marketing_consent: agreeMarketing,
      });
      toast.success(`어서오세요, ${displayName}님!`);
      router.push(redirectAfterSignup);
    } catch (error: unknown) {
      logger.error("Signup error:", error);
      toast.error(error instanceof Error ? error.message : "가입 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
      setOtpVerifying(false);
    }
  };

  if (!authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-neutral-400">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] p-4">
      <Card className="w-full max-w-md p-8 space-y-6 bg-[#1C1C1E] border border-neutral-700 shadow-2xl">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight">NightFlow</h1>
        </div>

        {step === "agree" && (
          <>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleAgreeAll}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-neutral-700 border border-neutral-600 hover:bg-neutral-600 transition-colors"
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  agreeAll ? "bg-white border-white" : "border-neutral-400"
                }`}>
                  {agreeAll && <Check className="w-4 h-4 text-black" />}
                </div>
                <span className="text-[15px] font-bold text-white">전체 동의</span>
              </button>

              <div className="h-px bg-neutral-700 mx-2" />

              {[
                { state: agreeAge, set: setAgreeAge, label: "만 19세 이상입니다", required: true, href: null },
                { state: agreeTerms, set: setAgreeTerms, label: "서비스 이용약관 동의", required: true, href: "/terms" },
                { state: agreePrivacy, set: setAgreePrivacy, label: "개인정보 처리방침 동의", required: true, href: "/privacy" },
                { state: agreeMarketing, set: setAgreeMarketing, label: "마케팅 알림 수신 동의", required: false, href: null },
              ].map(({ state, set, label, required, href }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => set(!state)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      state ? "bg-white border-white" : "border-neutral-500"
                    }`}
                  >
                    {state && <Check className="w-3 h-3 text-black" />}
                  </button>
                  <span className="text-[14px] text-neutral-200 flex-1">
                    {label}{" "}
                    <span className={`text-[11px] ${required ? "text-red-400" : "text-neutral-500"}`}>
                      ({required ? "필수" : "선택"})
                    </span>
                  </span>
                  {href && (
                    <Link href={href} target="_blank" className="text-neutral-500 hover:text-neutral-300 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={handleAgreeNext}
              disabled={!requiredMet}
              className="w-full h-12 font-black text-base bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500 transition-all"
            >
              다음
            </Button>
          </>
        )}

        {step === "phone" && (
          <>
            <div className="space-y-2 text-center">
              <p className="text-[18px] font-bold text-white">휴대폰 번호로 인증해주세요</p>
              <p className="text-[13px] text-neutral-400">오퍼 도착 시 알림톡으로 알려드려요</p>
            </div>

            <div className="space-y-3">
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={formatPhoneDisplay(phoneInput)}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="010-1234-5678"
                className="w-full h-14 px-4 rounded-xl bg-neutral-800 border border-neutral-700 text-white text-[16px] placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
              />
              <Button
                onClick={handleSendOtp}
                disabled={!phoneValid || otpSending}
                className="w-full h-12 font-black text-base bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500 transition-all"
              >
                {otpSending ? "발송 중..." : "인증번호 받기"}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setStep("agree")}
              className="w-full flex items-center justify-center gap-1 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <div className="space-y-2 text-center">
              <p className="text-[18px] font-bold text-white">{formatPhoneDisplay(phoneInput)}</p>
              <p className="text-[13px] text-neutral-400">6자리 인증번호를 입력하세요</p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="______"
                maxLength={6}
                className="w-full h-14 px-4 rounded-xl bg-neutral-800 border border-neutral-700 text-white text-center text-[20px] tracking-[0.5em] placeholder-neutral-600 focus:outline-none focus:border-white transition-colors"
              />
              <Button
                onClick={handleVerifyAndSignup}
                disabled={otpCode.length !== 6 || otpVerifying || loading}
                className="w-full h-12 font-black text-base bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500 transition-all"
              >
                {otpVerifying || loading ? "확인 중..." : "확인"}
              </Button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="flex items-center gap-1 text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> 이전
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendIn > 0 || otpSending}
                className="text-neutral-400 hover:text-white transition-colors disabled:text-neutral-600"
              >
                {resendIn > 0 ? `다시 받기 (${resendIn}s)` : "다시 받기"}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
