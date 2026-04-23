"use client";

import { useState, useEffect, useMemo } from "react";
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

const SKIP_PHONE_VERIFICATION = process.env.NEXT_PUBLIC_SKIP_PHONE_VERIFICATION === "true";

import type { User as AuthUser } from "@supabase/supabase-js";

function formatKoreanPhone(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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

  // OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(SKIP_PHONE_VERIFICATION);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  const requiredMet = agreeAge && agreeTerms && agreePrivacy;
  const phoneDigits = phone.replace(/[^0-9]/g, "");
  const isValidPhone = useMemo(() => {
    if (process.env.NODE_ENV === "development" && /^070\d{7,8}$/.test(phoneDigits)) return true;
    return /^01[016789]\d{7,8}$/.test(phoneDigits);
  }, [phoneDigits]);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
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
      if (!cancelled) {
        router.push("/login?error=session_expired");
      }
    };

    checkSession();
    return () => { cancelled = true; };
  }, [router, supabase]);

  // OTP 만료 카운트다운
  useEffect(() => {
    if (!otpExpiresAt || otpVerified) {
      setRemainingTime(0);
      return;
    }
    const tick = () => {
      const rem = Math.max(0, Math.floor((otpExpiresAt - Date.now()) / 1000));
      setRemainingTime(rem);
      if (rem === 0) {
        setOtpSent(false);
        setOtpExpiresAt(null);
        setOtpError("인증번호가 만료되었습니다. 다시 발송해주세요.");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [otpExpiresAt, otpVerified]);

  // 재발송 쿨다운 카운트다운
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // 전체 동의 토글
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

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "").slice(0, 11);
    if (digits !== phoneDigits) {
      setOtpSent(false);
      setOtpVerified(false);
      setOtpCode("");
      setOtpError("");
      setOtpExpiresAt(null);
    }
    setPhone(digits);
    if (phoneError) setPhoneError("");
  };

  const handleSendOtp = async () => {
    if (!isValidPhone) {
      setPhoneError("올바른 휴대폰 번호를 입력해주세요 (예: 010-1234-5678)");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    setPhoneError("");

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "phone_already_registered") {
          setPhoneError("이미 가입된 번호입니다. 로그인하거나 다른 번호를 사용해주세요.");
        } else if (data.error === "phone_cooldown") {
          const sec = data.retry_after_sec ?? 60;
          setOtpError(`잠시 후 다시 시도해주세요 (${sec}초)`);
          setResendCooldown(sec);
        } else if (data.error === "phone_daily_limit") {
          setOtpError("하루 발송 한도(5회)를 초과했습니다. 내일 다시 시도해주세요.");
        } else if (data.error === "ip_limit") {
          setOtpError("요청이 너무 많습니다. 10분 후 다시 시도해주세요.");
        } else if (data.error === "sms_send_failed") {
          setOtpError("SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
        } else if (data.error === "invalid_phone") {
          setPhoneError("올바른 휴대폰 번호를 입력해주세요.");
        } else {
          setOtpError("인증번호 발송에 실패했습니다.");
        }
        return;
      }

      setOtpSent(true);
      setOtpVerified(false);
      setOtpCode("");
      setOtpExpiresAt(new Date(data.expires_at).getTime());
      setResendCooldown(60);
      toast.success("인증번호가 발송되었습니다");
    } catch (e) {
      logger.error("[send-otp] network error:", e);
      setOtpError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError("6자리 숫자를 입력해주세요.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDigits, code: otpCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "wrong_code") {
          setOtpError(`인증번호가 맞지 않습니다. (남은 시도: ${data.remaining_attempts ?? 0}회)`);
        } else if (data.error === "expired") {
          setOtpError("인증번호가 만료되었습니다. 다시 발송해주세요.");
          setOtpSent(false);
          setOtpExpiresAt(null);
        } else if (data.error === "too_many_attempts") {
          setOtpError("오입력 횟수 초과. 다시 발송해주세요.");
          setOtpSent(false);
          setOtpExpiresAt(null);
        } else if (data.error === "no_pending_verification") {
          setOtpError("인증 요청이 없습니다. 인증번호를 먼저 받아주세요.");
          setOtpSent(false);
        } else {
          setOtpError("인증에 실패했습니다.");
        }
        return;
      }

      setOtpVerified(true);
      setOtpError("");
      toast.success("휴대폰 인증이 완료되었습니다");
    } catch (e) {
      logger.error("[verify-otp] network error:", e);
      setOtpError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!authUser || !requiredMet) return;

    const trimmedName = displayName.trim();
    const validation = validateDisplayName(trimmedName);
    if (!validation.ok) {
      setNameError(validation.message || "닉네임을 확인해주세요.");
      return;
    }

    if (!SKIP_PHONE_VERIFICATION && !isValidPhone) {
      setPhoneError("올바른 휴대폰 번호를 입력해주세요 (예: 010-1234-5678)");
      return;
    }

    if (!SKIP_PHONE_VERIFICATION && !otpVerified) {
      setPhoneError("SMS 인증을 완료해주세요.");
      return;
    }

    setLoading(true);
    setNameError("");
    setPhoneError("");

    try {
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
        phone: SKIP_PHONE_VERIFICATION ? null : phoneDigits,
        profile_image: meta.avatar_url || null,
        role: "user",
        alimtalk_consent: agreeMarketing,
        alimtalk_consent_at: agreeMarketing ? new Date().toISOString() : null,
        referred_by: referredById,
        signup_source: signupSource,
      });

      if (error) {
        // UNIQUE(phone) 충돌
        if (error.code === "23505" || (error.message ?? "").includes("idx_users_unique_phone")) {
          setPhoneError("이미 가입된 번호입니다. 로그인 해주세요.");
          return;
        }
        // phone OTP 트리거 실패
        if ((error.message ?? "").includes("phone_not_verified")) {
          setPhoneError("SMS 인증이 만료됐습니다. 다시 인증해주세요.");
          setOtpVerified(false);
          setOtpSent(false);
          return;
        }
        throw error;
      }

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

        <div className={`space-y-2${SKIP_PHONE_VERIFICATION ? " hidden" : ""}`}>
          <label className="text-[13px] font-bold text-neutral-300">
            휴대폰 번호
          </label>
          <div className="flex gap-2">
            <Input
              type="tel"
              inputMode="numeric"
              value={formatKoreanPhone(phone)}
              onChange={(e) => handlePhoneChange(e.target.value)}
              maxLength={13}
              placeholder="010-1234-5678"
              disabled={otpVerified}
              className="h-11 bg-neutral-800 border-neutral-700 text-white font-mono placeholder:text-neutral-500 focus-visible:border-white disabled:opacity-70"
            />
            {otpVerified ? (
              <div className="shrink-0 h-11 px-3 flex items-center gap-1 text-green-400 font-bold text-[13px]">
                <Check className="w-5 h-5" />
                인증 완료
              </div>
            ) : (
              <Button
                type="button"
                onClick={handleSendOtp}
                disabled={!isValidPhone || otpLoading || resendCooldown > 0}
                className="shrink-0 h-11 px-3 bg-white text-black font-bold hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-400 text-[13px]"
              >
                {otpLoading && !otpSent
                  ? "발송 중..."
                  : resendCooldown > 0
                  ? `재발송 ${resendCooldown}초`
                  : otpSent
                  ? "재발송"
                  : "인증번호 받기"}
              </Button>
            )}
          </div>
          {phoneError && (
            <p className="text-[12px] text-red-400 font-bold">{phoneError}</p>
          )}

          {otpSent && !otpVerified && (
            <div className="space-y-2 mt-3 p-3 bg-neutral-800/50 rounded-xl border border-neutral-700">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-neutral-400 font-bold">인증번호</span>
                <span className="text-amber-400 font-mono">
                  {remainingTime > 0 ? `남은 시간 ${formatMMSS(remainingTime)}` : "만료됨"}
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6));
                    if (otpError) setOtpError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && otpCode.length === 6) {
                      handleVerifyOtp();
                    }
                  }}
                  maxLength={6}
                  placeholder="6자리 숫자"
                  className="h-10 bg-neutral-900 border-neutral-700 text-white font-mono text-center tracking-[0.3em] text-lg focus-visible:border-white"
                />
                <Button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={otpCode.length !== 6 || otpLoading || remainingTime === 0}
                  className="shrink-0 h-10 px-4 bg-white text-black font-bold hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-400"
                >
                  {otpLoading ? "확인 중..." : "확인"}
                </Button>
              </div>
              {otpError && (
                <p className="text-[12px] text-red-400 font-bold">{otpError}</p>
              )}
            </div>
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
          disabled={!requiredMet || (!SKIP_PHONE_VERIFICATION && !otpVerified) || loading}
          className="w-full h-12"
        >
          {loading ? "가입 중..." : !SKIP_PHONE_VERIFICATION && !otpVerified ? "SMS 인증을 완료해주세요" : "동의하고 시작하기"}
        </Button>
      </Card>
    </div>
  );
}
