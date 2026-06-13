"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";
import { validateDisplayName, isDisplayNameTaken } from "@/lib/utils/displayName";
import { normalizeProfileImage } from "@/lib/utils/image";
import { ChevronRight, Check, ArrowLeft, RefreshCw, Camera } from "lucide-react";
import Link from "next/link";
import { useLeaveConfirm } from "@/hooks/useLeaveConfirm";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import type { User as AuthUser } from "@supabase/supabase-js";

interface SignupFormProps {
  referralCode?: string | null;
  mdReferrer?: string | null;
}

type Step = "agree" | "phone" | "otp" | "nickname";

const RESEND_COOLDOWN_SEC = 60;

const isTestLoginEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";

const TEST_PHONE_BY_EMAIL: Record<string, string> = {
  "test-user@nightflow.test": "01099990001",
  "test-md@nightflow.test": "01099990002",
  "test-admin@nightflow.test": "01099990003",
};

const MAGIC_PHONES = [
  "01000000000",
  "01012345678",
  "01099990001",
  "01099990002",
  "01099990003"
];

const isMagicPhoneClient = (phone: string) => {
  const normalized = phone.replace(/[^0-9]/g, "");
  return MAGIC_PHONES.includes(normalized);
};

const formatPhoneDisplay = (raw: string) => {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

// 생년월일 8자리(YYYYMMDD)를 YYYY.MM.DD로 표시
const formatBirthdayDisplay = (raw: string) => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length < 5) return digits;
  if (digits.length < 7) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
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
  const [agreeAge, setAgreeAge] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("nightflow_step1_age") === "1"
  );
  const [agreeTerms, setAgreeTerms] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("nightflow_step1_terms") === "1"
  );
  const [agreePrivacy, setAgreePrivacy] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("nightflow_step1_privacy") === "1"
  );
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  const [phoneInput, setPhoneInput] = useState("");
  // 생년월일 (phone 단계에서 입력 — 만 19세 미만 SMS 발송 전 차단용)
  const [birthdayInput, setBirthdayInput] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // OTP 검증 후 nickname 단계로 넘기기 위해 보관
  const [verifiedPhoneState, setVerifiedPhoneState] = useState<string | null>(null);
  // 닉네임 + 프로필 사진 단계
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const [nicknameOk, setNicknameOk] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // object URL 정리
  const prevPreviewRef = useRef<string | null>(null);
  // 가입 완료 후 중복 호출/토스트 차단용 가드
  const completedRef = useRef(false);

  const NICK_COLORS = ["빨간","파란","초록","노란","보라","주황","하늘빛","민트빛","산호빛","금빛","달빛","별빛"];
  const NICK_ADJECTIVES = ["신나는","빛나는","화려한","자유로운","멋진","설레는","뜨거운","찬란한","유쾌한","활기찬"];
  const NICK_ANIMALS = ["재규어","표범","독수리","나비","여우","늑대","치타","팬더","코알라","돌고래","고래","매","올빼미","토끼","수달","라쿤","알파카","카피바라"];
  const pickRandom = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

  const applyRandomNickname = useCallback(async () => {
    const candidate = `${Math.random() < 0.5 ? pickRandom(NICK_COLORS) : pickRandom(NICK_ADJECTIVES)}${pickRandom(NICK_ANIMALS)}`;
    setNicknameInput(candidate);
    setNicknameError(null);
    setNicknameOk(false);
    setNicknameChecking(true);
    try {
      const taken = await isDisplayNameTaken(supabase, candidate);
      setNicknameOk(!taken);
      if (taken) setNicknameError("이미 사용 중인 닉네임이에요");
    } finally {
      setNicknameChecking(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // 닉네임 단계 진입 시 입력값 초기화
  useEffect(() => {
    if (step === "nickname") {
      setNicknameInput("");
      setNicknameError(null);
      setNicknameOk(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const requiredMet = agreeAge && agreeTerms && agreePrivacy;

  const isDirty = (step !== "agree" || phoneInput.length > 0) && !otpVerifying && !loading && !completedRef.current;
  const { showConfirm, setShowConfirm, confirmLeave, cancelLeave } = useLeaveConfirm(isDirty);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          // 이미 가입 완료된 유저(phone 인증 완료)면 홈으로 redirect
          const { data: profile } = await supabase
            .from("users")
            .select("phone")
            .eq("id", user.id)
            .maybeSingle();
          if (cancelled) return;
          if (profile?.phone) {
            router.push("/");
            return;
          }
          setAuthUser(user);
          trackEvent("signup_start", { provider: user.app_metadata?.provider ?? "unknown" });
          // 테스트 모드: 프리셋 계정이면 약관/전화번호 자동 채움
          if (isTestLoginEnabled && user.email && TEST_PHONE_BY_EMAIL[user.email]) {
            setAgreeAge(true);
            setAgreeTerms(true);
            setAgreePrivacy(true);
            setAgreeMarketing(true);
            setPhoneInput(TEST_PHONE_BY_EMAIL[user.email]);
          }
          return;
        }
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

  // 약관 페이지에서 "동의하고 돌아가기" 후 체크박스 자동 동기화
  useEffect(() => {
    const checkStorage = () => {
      if (sessionStorage.getItem("nightflow_agreed_terms") === "1") {
        setAgreeTerms(true);
        sessionStorage.removeItem("nightflow_agreed_terms");
      }
      if (sessionStorage.getItem("nightflow_agreed_privacy") === "1") {
        setAgreePrivacy(true);
        sessionStorage.removeItem("nightflow_agreed_privacy");
      }
    };
    checkStorage();
    document.addEventListener("visibilitychange", checkStorage);
    window.addEventListener("pageshow", checkStorage);
    window.addEventListener("focus", checkStorage);
    return () => {
      document.removeEventListener("visibilitychange", checkStorage);
      window.removeEventListener("pageshow", checkStorage);
      window.removeEventListener("focus", checkStorage);
    };
  }, []);

  // 체크박스 state → sessionStorage 동기화 (페이지 이동 후 remount 시 복원용)
  useEffect(() => {
    sessionStorage.setItem("nightflow_step1_age", agreeAge ? "1" : "0");
  }, [agreeAge]);
  useEffect(() => {
    sessionStorage.setItem("nightflow_step1_terms", agreeTerms ? "1" : "0");
  }, [agreeTerms]);
  useEffect(() => {
    sessionStorage.setItem("nightflow_step1_privacy", agreePrivacy ? "1" : "0");
  }, [agreePrivacy]);

  const handleAgreeNext = () => {
    if (!requiredMet) return;
    trackEvent("signup_agree", { marketing_consent: agreeMarketing });
    setStep("phone");
  };

  const phoneDigits = phoneInput.replace(/\D/g, "");
  const phoneValid = /^01[016789]\d{7,8}$/.test(phoneDigits);

  // 생년월일 검증 (만 19세 이상만 가입 가능 — 청소년보호법 기준)
  // birthdayInput은 숫자 8자리(YYYYMMDD)로 보관 → YYYY-MM-DD로 파싱.
  const birthdayDigits = birthdayInput.replace(/\D/g, "");
  const birthdayComplete = birthdayDigits.length === 8;
  const birthdayISO = birthdayComplete
    ? `${birthdayDigits.slice(0, 4)}-${birthdayDigits.slice(4, 6)}-${birthdayDigits.slice(6, 8)}`
    : "";
  // 실재하는 날짜인지 strict 확인 (예: 19990230 같은 가짜 날짜 거름)
  const birthdayValid =
    birthdayComplete &&
    dayjs(birthdayISO).isValid() &&
    dayjs(birthdayISO).format("YYYY-MM-DD") === birthdayISO &&
    !dayjs(birthdayISO).isAfter(dayjs());
  const age = birthdayValid ? dayjs().diff(dayjs(birthdayISO), "year") : null;
  const isAdult = age !== null && age >= 19;
  // 8자리를 다 입력했는데 19세 미만/잘못된 날짜일 때만 경고 (입력 중에는 침묵)
  const isUnderage = birthdayComplete && !isAdult;

  const handleSendOtp = async () => {
    if (!phoneValid || !isAdult || otpSending) return;
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
      if (isMagicPhoneClient(phoneDigits)) {
        setOtpCode("000000");
      } else {
        setOtpCode(isTestLoginEnabled ? "000000" : "");
      }
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

  const handleVerifyOtp = async () => {
    if (!authUser) return;
    if (completedRef.current) return;
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
      trackEvent("signup_phone_verified");
      setVerifiedPhoneState(verifiedPhone);
      setStep("nickname");
      setNicknameInput("");
      setNicknameError(null);
      setNicknameOk(false);
    } catch (error: unknown) {
      logger.error("OTP verify error:", error);
      toast.error(error instanceof Error ? error.message : "인증 중 오류가 발생했습니다");
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleCompleteSignup = async () => {
    if (!authUser) return;
    if (completedRef.current) return;
    if (!verifiedPhoneState) {
      toast.error("인증 정보가 만료됐어요. 처음부터 다시 시도해주세요");
      setStep("phone");
      return;
    }
    const displayName = nicknameInput.trim();
    if (!displayName) {
      toast.error("닉네임을 입력해주세요");
      setStep("nickname");
      return;
    }
    const nameValidation = validateDisplayName(displayName);
    if (!nameValidation.ok) {
      toast.error(nameValidation.message);
      setStep("nickname");
      return;
    }
    try {
      const verifiedPhone = verifiedPhoneState;
      setLoading(true);
      const taken = await isDisplayNameTaken(supabase, displayName);
      if (taken) {
        toast.error("이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요");
        setStep("nickname");
        setNicknameError("이미 사용 중인 닉네임이에요");
        setNicknameOk(false);
        setLoading(false);
        return;
      }
      const meta = authUser.user_metadata ?? {};

      // 프로필 사진 (Migration 187 — 정책 변경)
      // 카카오 OAuth에서 받은 avatar_url은 더 이상 저장하지 않음 (별도 동의 미수집 리스크)
      // 회원이 직접 업로드한 사진만 저장 (opt-in)
      let finalProfileImage: string | null = null;
      if (profileImageFile) {
        setUploadingImage(true);
        try {
          const ext = profileImageFile.name.split(".").pop() ?? "jpg";
          const path = `${authUser.id}/avatar.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(path, profileImageFile, { upsert: true });
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
          finalProfileImage = `${urlData.publicUrl}?t=${Date.now()}`;
        } catch {
          toast.error("사진 업로드에 실패했어요. 사진 없이 가입을 계속합니다");
        } finally {
          setUploadingImage(false);
        }
      }

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

      // 잔재 row 존재 여부 확인 (cf151e8 시기 phone-null row 대응)
      // RLS "Users can read own profile" (Migration 116) 정책으로 본인 row 조회 가능
      const { data: existing, error: selectError } = await supabase
        .from("users")
        .select("id, deleted_at")
        .eq("id", authUser.id)
        .maybeSingle();

      if (selectError) {
        logger.error("Signup pre-check error:", selectError);
        toast.error("사용자 정보를 확인하는 중 오류가 발생했습니다.");
        return;
      }

      if (existing?.deleted_at) {
        // 탈퇴 상태 잔재 row → 복구 페이지로 안내
        toast.error("탈퇴 처리된 계정입니다. 복구 페이지로 이동합니다.");
        router.replace("/recover-account");
        return;
      }

      // 생년월일: phone 단계에서 19세 게이트를 통과한 값(YYYY-MM-DD). 유효할 때만 저장.
      const birthdayToSave = birthdayValid ? birthdayISO : null;

      // 기존 row가 있으면 신규 가입 관련 필드만 UPDATE (role/referred_by/signup_source/kakao_id/profile_image 보존)
      // 없으면 INSERT (BEFORE INSERT 트리거 3종이 정상 발동)
      const { error } = existing
        ? await supabase
            .from("users")
            .update({
              display_name: displayName,
              phone: verifiedPhone,
              birthday: birthdayToSave,
              alimtalk_consent: agreeMarketing,
              alimtalk_consent_at: agreeMarketing ? new Date().toISOString() : null,
            })
            .eq("id", authUser.id)
        : await supabase.from("users").insert({
            id: authUser.id,
            kakao_id: meta.provider_id || authUser.id,
            display_name: displayName,
            phone: verifiedPhone,
            birthday: birthdayToSave,
            profile_image: finalProfileImage,
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
      completedRef.current = true;
      // 가입 완료 후 step1 임시 state 정리
      ["nightflow_step1_age", "nightflow_step1_terms", "nightflow_step1_privacy",
       "nightflow_agreed_terms", "nightflow_agreed_privacy"].forEach((k) =>
        sessionStorage.removeItem(k)
      );
      toast.success(`어서오세요, ${displayName}님!`);
      // 하드 리다이렉트 — 세션 쿠키 새로 로드 + 뒤로가기로 /signup 재진입 시 또 가입되는 것 차단
      window.location.replace(redirectAfterSignup);
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
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/login");
              }}
              className="w-full flex items-center justify-center gap-1 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> 로그인 화면으로
            </button>

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
                { state: agreeMarketing, set: setAgreeMarketing, label: "마케팅 정보 수신 동의 (알림톡·SMS·앱 푸시)", required: false, href: "/marketing-consent" },
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
                    <Link href={href} className="text-neutral-500 hover:text-neutral-300 transition-colors">
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
              {/* 생년월일 — 만 19세 미만 차단 게이트 (SMS 발송 전). 숫자 직접 입력. */}
              <div className="space-y-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="bday"
                  value={formatBirthdayDisplay(birthdayInput)}
                  onChange={(e) => setBirthdayInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="생년월일 8자리 (예: 19990101)"
                  className={`w-full h-14 px-4 rounded-xl bg-neutral-800 border text-white text-[16px] placeholder-neutral-500 focus:outline-none transition-colors ${
                    isUnderage ? "border-red-500 focus:border-red-500" : "border-neutral-700 focus:border-white"
                  }`}
                />
                {isUnderage && (
                  <p className="text-[13px] text-red-400 px-1">
                    만 19세 이상만 가입할 수 있어요
                  </p>
                )}
              </div>

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
                disabled={!phoneValid || !isAdult || otpSending}
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
                onClick={handleVerifyOtp}
                disabled={otpCode.length !== 6 || otpVerifying || loading}
                className="w-full h-12 font-black text-base bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500 transition-all"
              >
                {otpVerifying ? "확인 중..." : "확인"}
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

        {step === "nickname" && (
          <div className="space-y-7">
            <div className="space-y-1.5 text-center">
              <p className="text-[22px] font-bold text-white tracking-tight">프로필을 설정해주세요</p>
              <p className="text-[13px] text-neutral-500">언제든지 변경할 수 있습니다</p>
            </div>

            {/* 프로필 사진 */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full overflow-hidden bg-neutral-800 border border-neutral-700 hover:border-neutral-500 transition-colors group"
              >
                {profileImagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileImagePreview}
                    alt="프로필 사진"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-500">
                    <Camera className="w-8 h-8" strokeWidth={1.5} />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </button>
              <p className="text-[12px] text-neutral-500">
                {profileImageFile ? "사진 변경하기" : "프로필 사진 · 선택"}
              </p>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error("5MB 이하 이미지만 업로드 가능해요");
                    return;
                  }
                  // 이전 object URL 해제
                  if (prevPreviewRef.current) URL.revokeObjectURL(prevPreviewRef.current);
                  const url = URL.createObjectURL(file);
                  prevPreviewRef.current = url;
                  setProfileImageFile(file);
                  setProfileImagePreview(url);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={nicknameInput}
                  maxLength={16}
                  placeholder="닉네임"
                  onChange={(e) => {
                    const val = e.target.value;
                    setNicknameInput(val);
                    setNicknameOk(false);
                    const v = validateDisplayName(val);
                    setNicknameError(v.ok ? null : (v.message ?? null));
                  }}
                  onBlur={async () => {
                    const val = nicknameInput.trim();
                    const v = validateDisplayName(val);
                    if (!v.ok) { setNicknameError(v.message ?? null); setNicknameOk(false); return; }
                    setNicknameChecking(true);
                    try {
                      const taken = await isDisplayNameTaken(supabase, val);
                      if (taken) { setNicknameError("이미 사용 중인 닉네임이에요"); setNicknameOk(false); }
                      else { setNicknameError(null); setNicknameOk(true); }
                    } finally { setNicknameChecking(false); }
                  }}
                  className="w-full h-12 px-4 pr-28 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 text-[15px] font-medium focus:outline-none focus:border-white transition-colors"
                />
                {/* 글자수 + 자동생성 버튼 */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <span className="text-[11px] text-neutral-600 tabular-nums">{nicknameInput.length}/16</span>
                  <button
                    type="button"
                    onClick={applyRandomNickname}
                    disabled={nicknameChecking}
                    className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-bold text-neutral-300 bg-neutral-700 hover:bg-neutral-600 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${nicknameChecking ? "animate-spin" : ""}`} />
                    자동생성
                  </button>
                </div>
              </div>

              {nicknameError && (
                <p className="text-[12px] text-red-400 font-medium px-1">{nicknameError}</p>
              )}
              {nicknameOk && !nicknameError && (
                <p className="text-[12px] text-green-400 font-medium px-1">사용 가능한 닉네임이에요 ✓</p>
              )}
              {nicknameChecking && !nicknameError && (
                <p className="text-[12px] text-neutral-500 px-1">중복 확인 중...</p>
              )}
            </div>

            <div className="space-y-3 pt-1">
              <Button
                onClick={handleCompleteSignup}
                disabled={!nicknameOk || loading || nicknameChecking || uploadingImage}
                className="w-full h-12 font-black text-base bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500 transition-all"
              >
                {uploadingImage ? "사진 업로드 중..." : loading ? "가입 중..." : "가입 완료"}
              </Button>
              <button
                type="button"
                onClick={() => setStep("otp")}
                className="w-full flex items-center justify-center gap-1 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> 이전
              </button>
            </div>
          </div>
        )}
      </Card>
      <ConfirmDialog
        isOpen={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
        title="정말요?"
        description="진행 중인 가입이 취소됩니다."
        confirmText="나가기"
        cancelText="계속하기"
        variant="danger"
      />
    </div>
  );
}
