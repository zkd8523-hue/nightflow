"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics/events";
import { validateDisplayName, isDisplayNameTaken, generateRandomNickname } from "@/lib/utils/displayName";
import { normalizeProfileImage } from "@/lib/utils/image";
import { ChevronRight, Check, ArrowLeft, Camera } from "lucide-react";
import Link from "next/link";
import { useLeaveConfirm } from "@/hooks/useLeaveConfirm";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { COUNTRIES, countryFlag } from "@/lib/utils/countryFlag";
import { isValidEmailFormat, suggestEmail } from "@/lib/utils/emailCheck";
import { getLang, makeT } from "@/lib/i18n";
import { DateWheelPicker } from "@/components/ui/DateWheelPicker";

import type { User as AuthUser } from "@supabase/supabase-js";

function toNicknameError(msg: string | undefined, isForeigner: boolean): string | null {
  if (!msg) return null;
  if (!isForeigner) return msg;
  if (msg.includes("2-16자") || msg.includes("2–16")) return "Nickname must be 2–16 characters.";
  if (msg.includes("사용할 수 없는")) return "This nickname is not allowed.";
  return msg;
}

interface SignupFormProps {
  referralCode?: string | null;
  mdReferrer?: string | null;
}

// profile = 생년월일 + 성별 통합 단계 (전화번호 인증 제거로 스텝 수를 줄임)
type Step = "agree" | "country" | "profile" | "nickname";

export function SignupForm({ referralCode, mdReferrer }: SignupFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const lang = searchParams.get("lang");
  // 외국인 = 한국어 아닌 모든 언어(en/ja/zh). 과거 lang==="en"만 보던 버그로 ja/zh가 한글을 보던 문제 수정.
  const isForeigner = !!lang && lang !== "ko";
  const tt = makeT(getLang(lang)); // 표시 문구 번역 (ja/zh는 사전 경유, 없으면 영어 폴백)

  // 외국인 유저가 회원가입 완료 후 next 경로로 이동할 때 lang 파라미터를 반드시 유지.
  // 실제 이탈 사례: en 유저 → /flags/new?lang=en → login → /signup?next=/flags/new(lang 유실)
  // → 회원가입 후 /flags/new(lang 없음) → getLang(undefined)="ko" → 한국어 폼 노출 → 이탈.
  const appendLangIfMissing = (url: string, langCode: string | null): string => {
    if (!langCode || langCode === "ko") return url;
    // fragment 분리 (#) — 있으면 나중에 다시 붙임
    const [pathAndQuery, hash] = url.split("#");
    const [path, query] = pathAndQuery.split("?");
    const params = new URLSearchParams(query || "");
    if (!params.has("lang")) params.set("lang", langCode);
    const qs = params.toString();
    return path + (qs ? `?${qs}` : "") + (hash ? `#${hash}` : "");
  };

  // 외국인의 회원가입 완료 후 목적지 결정:
  // - Ahsan(미국)/Maeve(프랑스) 케이스에서 회원가입 후 바로 /flags/new로 튕겨 폼 압도 → 이탈 확인
  // - 외국인은 홈(/en, /ja, /zh, /zh-tw)으로 복귀 → 3단계 설명·클럽 목록·소셜프루프 먼저 소화
  // - book_intent(sessionStorage)는 유지되므로 유저가 폼으로 가면 area 프리셀렉트됨
  // - 한국인은 기존대로 next 파라미터 존중 (홈 온보딩 팝업이 한국어라 폼 진입해도 문제 없음)
  const validNextParam =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;
  const foreignHome = lang === "ko" || !lang ? "/en" : `/${lang}`;
  const baseRedirect = isForeigner
    ? foreignHome  // 외국인은 next 무시하고 자기 언어 홈으로
    : (validNextParam || "/");
  const redirectAfterSignup = isForeigner
    ? appendLangIfMissing(baseRedirect, lang)
    : baseRedirect;
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  const [step, setStep] = useState<Step>("agree");

  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeAge, setAgreeAge] = useState(() =>
    !isForeigner && typeof window !== "undefined" && sessionStorage.getItem("nightflow_step1_age") === "1"
  );
  const [agreeTerms, setAgreeTerms] = useState(() =>
    !isForeigner && typeof window !== "undefined" && sessionStorage.getItem("nightflow_step1_terms") === "1"
  );
  const [agreePrivacy, setAgreePrivacy] = useState(() =>
    !isForeigner && typeof window !== "undefined" && sessionStorage.getItem("nightflow_step1_privacy") === "1"
  );
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  // 생년월일 + 성별 — "profile" 단계에서 한 화면으로 입력 (만 19세 게이트 포함)
  const [birthdayInput, setBirthdayInput] = useState("");
  // DateWheelPicker가 마운트 시 자동으로 기본값(예: 2001-01-01)을 emit해 birthdayInput이 즉시 채워짐 → 다음 버튼이 조작 없이 활성.
  // 유저가 실제로 휠을 돌리거나 다른 스텝에서 복귀한 경우만 유효 입력으로 간주하기 위해 별도 플래그.
  const [birthdayTouched, setBirthdayTouched] = useState(false);
  // 성별 (선택 항목, null = 선택안함)
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  // 닉네임 + 프로필 사진 단계
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const [nicknameRegenerating, setNicknameRegenerating] = useState(false);
  const [nicknameOk, setNicknameOk] = useState(false);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [countryFocused, setCountryFocused] = useState(false);
  // 이메일 폴백 입력 (OAuth가 email을 안 준 외국인만). authUser.email 있으면 미사용.
  const [emailInput, setEmailInput] = useState("");
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // object URL 정리
  const prevPreviewRef = useRef<string | null>(null);
  // 가입 완료 후 중복 호출/토스트 차단용 가드
  const completedRef = useRef(false);


  // 닉네임 단계 진입 시 입력값 초기화 + 랜덤 닉네임 자동 채움(한국인만).
  // 빈 입력창에서 뭘 쓸지 고민하다 이탈하는 게 가입 퍼널 마지막 단계 최대 이탈 지점이라
  // 기본값을 채워 타이핑 0번으로 "가입 완료"까지 갈 수 있게 함 — 마음에 안 들면 직접 수정 가능.
  // 아래 debounce 중복확인 effect가 이 값도 그대로 검증하므로 별도 처리 불필요.
  useEffect(() => {
    if (step !== "nickname") return;
    setNicknameInput("");
    setNicknameError(null);
    setNicknameOk(false);
    if (isForeigner) return;
    let cancelled = false;
    (async () => {
      const name = await generateRandomNickname(supabase);
      if (!cancelled) setNicknameInput(name);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 리롤 버튼 — 자동 채워진 닉네임이 마음에 안 들면 새로 하나 더 뽑기.
  // "빈칸에서 직접 입력" 대신 "채워진 걸 원하면 바꿀 수 있음"으로 통제감을 줌.
  const handleRegenerateNickname = async () => {
    if (nicknameRegenerating) return;
    setNicknameRegenerating(true);
    try {
      const name = await generateRandomNickname(supabase);
      setNicknameInput(name);
    } finally {
      setNicknameRegenerating(false);
    }
  };

  // 닉네임 debounce 중복 체크: 형식 통과 후 600ms 대기하여 자동 확인
  useEffect(() => {
    if (step !== "nickname") return;
    const val = nicknameInput.trim();
    const v = validateDisplayName(val);
    if (!v.ok) return;
    setNicknameChecking(true);
    const timer = setTimeout(async () => {
      try {
        const taken = await isDisplayNameTaken(supabase, val);
        if (taken) { setNicknameError(tt("이미 사용 중인 닉네임이에요", "This nickname is already taken.")); setNicknameOk(false); }
        else { setNicknameError(null); setNicknameOk(true); }
      } finally { setNicknameChecking(false); }
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nicknameInput, step]);

  const requiredMet = agreeAge && agreeTerms && agreePrivacy;

  const isDirty = step !== "agree" && !loading && !completedRef.current;
  const { showConfirm, setShowConfirm, confirmLeave, cancelLeave } = useLeaveConfirm(isDirty);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          // 이미 가입 완료된 유저면 홈으로 redirect (phone을 더 이상 받지 않으므로 display_name으로만 판정)
          const { data: profile } = await supabase
            .from("users")
            .select("display_name")
            .eq("id", user.id)
            .maybeSingle();
          if (cancelled) return;
          if (profile?.display_name) {
            router.push(redirectAfterSignup);
            return;
          }
          setAuthUser(user);
          trackEvent("signup_start", { provider: user.app_metadata?.provider ?? "unknown" });
          return;
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
      if (!cancelled) router.push("/login?error=session_expired");
    };
    checkSession();
    return () => { cancelled = true; };
  }, [router, supabase]);

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
    setStep(isForeigner ? "country" : "profile"); // 외국인: 나라 먼저 / 한국인: 생년월일+성별
  };

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

  const handleCompleteSignup = async () => {
    if (!authUser) return;
    if (completedRef.current) return;
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
      let signupSource = isForeigner ? "en" : "direct";

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

      // 생년월일: profile 단계에서 19세 게이트를 통과한 값(YYYY-MM-DD). 유효할 때만 저장.
      const birthdayToSave = birthdayValid ? birthdayISO : null;

      // 이메일: 외국인 알림(첫 오퍼/수락/리마인더) 발송용.
      // OAuth(구글/애플)가 준 authUser.email 우선, 없으면 폴백 입력값.
      const emailToSave =
        (authUser.email || emailInput).trim().toLowerCase() || null;

      // 기존 row가 있으면 신규 가입 관련 필드만 UPDATE (role/referred_by/signup_source/kakao_id/profile_image 보존)
      // 없으면 INSERT (BEFORE INSERT 트리거 3종이 정상 발동)
      const { error } = existing
        ? await supabase
            .from("users")
            .update({
              display_name: displayName,
              birthday: birthdayToSave,
              gender,
              alimtalk_consent: agreeMarketing,
              alimtalk_consent_at: agreeMarketing ? new Date().toISOString() : null,
              ...(countryCode ? { country_code: countryCode } : {}),
              ...(emailToSave ? { email: emailToSave } : {}),
              lang: getLang(lang),
            })
            .eq("id", authUser.id)
        : await supabase.from("users").insert({
            id: authUser.id,
            kakao_id: meta.provider_id || authUser.id,
            display_name: displayName,
            birthday: birthdayToSave,
            gender,
            profile_image: finalProfileImage,
            role: "user",
            alimtalk_consent: agreeMarketing,
            alimtalk_consent_at: agreeMarketing ? new Date().toISOString() : null,
            referred_by: referredById,
            signup_source: signupSource,
            ...(countryCode ? { country_code: countryCode } : {}),
            ...(emailToSave ? { email: emailToSave } : {}),
            lang: getLang(lang),
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
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className={`w-full max-w-md p-8 bg-card border border-border shadow-2xl ${step === "agree" ? "space-y-6" : "space-y-4"}`}>
        <div className={`text-center ${step === "agree" ? "space-y-1.5" : ""}`}>
          <h1 className={`font-black text-foreground tracking-tight ${step === "agree" ? "text-3xl" : "text-xl"}`}>NightFlow</h1>
          {/* 부제·무료 안내는 첫 스텝(약관 동의)에만 노출. 이후 스텝은 폼 집중을 위해 로고까지 축소. */}
          {step === "agree" && (
            <>
              <p className="text-[15px] font-bold text-foreground">
                {tt("밤이 더 밝아진다, 나플", "Your night, brighter — NightFlow")}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {tt("모든 서비스 무료", "All services free")}
              </p>
            </>
          )}
        </div>

        {step === "agree" && (
          <>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleAgreeAll}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted border border-border hover:bg-muted transition-colors"
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  agreeAll ? "bg-white border-white" : "border-neutral-400"
                }`}>
                  {agreeAll && <Check className="w-4 h-4 text-black" />}
                </div>
                <span className="text-[15px] font-bold text-foreground">{tt("전체 동의", "Agree to all")}</span>
              </button>

              <div className="h-px bg-muted mx-2" />

              {/* "만 19세 이상" 항목 제거: profile 스텝에서 실제 생년월일로 검증하므로 중복 게이트 → 이탈 유발 */}
              {[
                { state: agreeTerms, set: setAgreeTerms, label: tt("서비스 이용약관 동의", "Terms of Service"), required: true, href: isForeigner ? `/terms?lang=${lang}` : "/terms" },
                { state: agreePrivacy, set: setAgreePrivacy, label: tt("개인정보 처리방침 동의", "Privacy Policy"), required: true, href: isForeigner ? `/privacy?lang=${lang}` : "/privacy" },
                { state: agreeMarketing, set: setAgreeMarketing, label: tt("마케팅 정보 수신 동의 (이메일·앱 푸시)", "Marketing notifications (Email, push)"), required: false, href: isForeigner ? `/marketing-consent?lang=${lang}` : "/marketing-consent" },
              ].map(({ state, set, label, required, href }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => set(!state)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      state ? "bg-white border-white" : "border-border"
                    }`}
                  >
                    {state && <Check className="w-3 h-3 text-black" />}
                  </button>
                  <span className="text-[14px] text-foreground/90 flex-1">
                    {label}{" "}
                    <span className={`text-[11px] ${required ? "text-red-400" : "text-muted-foreground"}`}>
                      ({required ? tt("필수", "required") : tt("선택", "optional")})
                    </span>
                  </span>
                  {href && (
                    <Link href={href} className="text-muted-foreground hover:text-foreground/80 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={handleAgreeNext}
              disabled={!requiredMet}
              className="w-full h-12 font-black text-base bg-inverse text-inverse-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground transition-all"
            >
              {tt("다음", "Next")}
            </Button>

            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push(isForeigner ? `/login?lang=${lang}` : "/login");
              }}
              className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> {tt("로그인 화면으로", "Back to login")}
            </button>
          </>
        )}

        {step === "profile" && (
          <>
            <div className="space-y-2 text-center">
              <p className="text-[18px] font-bold text-foreground">{tt("생년월일과 성별을 알려주세요", "Your date of birth and gender")}</p>
              <p className="text-[13px] text-muted-foreground">{tt("만 19세 이상만 가입할 수 있어요", "You must be 19 or older to join.")}</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <DateWheelPicker
                  value={birthdayInput}
                  onChange={(v) => {
                    // 마운트 직후 초기값 자동 emit은 touched로 취급 X.
                    // 이전 값과 다르게 변할 때만(=휠 조작) touched로 세팅.
                    setBirthdayInput((prev) => {
                      if (prev && prev !== v) setBirthdayTouched(true);
                      return v;
                    });
                  }}
                />
                {isUnderage && (
                  <p className="text-[13px] text-red-400 px-1 text-center">
                    {tt("만 19세 이상만 가입할 수 있어요", "You must be 19 or older to join.")}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: "male" as const, ko: "남성", en: "Male" },
                  { key: "female" as const, ko: "여성", en: "Female" },
                ]).map((opt) => {
                  const active = gender === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setGender(active ? null : opt.key)}
                      className={`h-14 rounded-xl border text-[15px] font-bold transition-colors ${
                        active
                          ? "bg-inverse text-inverse-foreground border-white"
                          : "bg-muted text-foreground/80 border-border hover:border-border"
                      }`}
                    >
                      {tt(opt.ko, opt.en)}
                    </button>
                  );
                })}
              </div>

              <Button
                onClick={() => setStep("nickname")}
                disabled={!birthdayTouched || !birthdayValid || !isAdult || !gender}
                className="w-full h-12 font-black text-base bg-inverse text-inverse-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground transition-all"
              >
                {tt("다음", "Next")}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setStep(isForeigner ? "country" : "agree")}
              className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> {tt("이전", "Back")}
            </button>
          </>
        )}

        {step === "nickname" && (
          <div className="space-y-7">
            <div className="space-y-1.5 text-center">
              <p className="text-[22px] font-bold text-foreground tracking-tight">{tt("프로필을 설정해주세요", "Set up your profile")}</p>
              <p className="text-[13px] text-muted-foreground">{tt("언제든지 변경할 수 있습니다", "You can change this anytime")}</p>
            </div>

            {/* 프로필 사진 */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="relative w-24 h-24 rounded-full overflow-hidden bg-muted border border-border hover:border-border transition-colors group"
              >
                {profileImagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileImagePreview}
                    alt="프로필 사진"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Camera className="w-8 h-8" strokeWidth={1.5} />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5 text-foreground" />
                </div>
              </button>
              <p className="text-[12px] text-muted-foreground">
                {isForeigner
                  ? (profileImageFile ? "Change photo" : "Profile photo · optional")
                  : (profileImageFile ? "사진 변경하기" : "프로필 사진 · 선택")}
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
                  placeholder={tt("닉네임", "Nickname")}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNicknameInput(val);
                    setNicknameOk(false);
                    const v = validateDisplayName(val);
                    setNicknameError(v.ok ? null : toNicknameError(v.message, isForeigner));
                  }}
                  onBlur={async () => {
                    const val = nicknameInput.trim();
                    const v = validateDisplayName(val);
                    if (!v.ok) { setNicknameError(toNicknameError(v.message, isForeigner)); setNicknameOk(false); return; }
                    setNicknameChecking(true);
                    try {
                      const taken = await isDisplayNameTaken(supabase, val);
                      if (taken) { setNicknameError(tt("이미 사용 중인 닉네임이에요", "This nickname is already taken.")); setNicknameOk(false); }
                      else { setNicknameError(null); setNicknameOk(true); }
                    } finally { setNicknameChecking(false); }
                  }}
                  className="w-full h-12 pl-4 pr-20 rounded-xl bg-muted border border-border text-foreground placeholder-neutral-500 text-[15px] font-medium focus:outline-none focus:border-white transition-colors"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground tabular-nums pr-0.5">{nicknameInput.length}/16</span>
                  {/* 리롤 버튼 — 외국인은 자동 채움 자체가 없으니(영어권엔 안 맞는 한글 조합) 숨김 */}
                  {!isForeigner && (
                    <button
                      type="button"
                      onClick={handleRegenerateNickname}
                      disabled={nicknameRegenerating}
                      aria-label={tt("닉네임 다시 생성", "Generate new nickname")}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-base hover:bg-card disabled:opacity-50 transition-colors"
                    >
                      <span className={nicknameRegenerating ? "animate-spin inline-block" : "inline-block"}>🎲</span>
                    </button>
                  )}
                </div>
              </div>

              {nicknameError && (
                <p className="text-[12px] text-red-400 font-medium px-1">{nicknameError}</p>
              )}
              {nicknameOk && !nicknameError && (
                <p className="text-[12px] text-money font-medium px-1">{tt("사용 가능한 닉네임이에요 ✓", "Nickname available ✓")}</p>
              )}
              {nicknameChecking && !nicknameError && (
                <p className="text-[12px] text-muted-foreground px-1">{tt("중복 확인 중...", "Checking...")}</p>
              )}
            </div>

            <div className="space-y-3 pt-1">
              <Button
                onClick={handleCompleteSignup}
                disabled={!nicknameOk || loading || nicknameChecking || uploadingImage || (isForeigner && (!birthdayValid || !isAdult))}
                className="w-full h-12 font-black text-base bg-inverse text-inverse-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground transition-all"
              >
                {uploadingImage ? tt("업로드 중...", "Uploading...") : loading ? tt("가입 중...", "Creating account...") : tt("가입 완료", "Join NightFlow")}
              </Button>
              <button
                type="button"
                onClick={() => setStep("profile")}
                className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground/80 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> {tt("이전", "Back")}
              </button>
            </div>
          </div>
        )}

        {step === "country" && (
          <div className="space-y-6">
            <div className="space-y-1 text-center">
              <p className="text-[22px] font-bold text-foreground tracking-tight">{tt("", "Where are you from?")}</p>
              <p className="text-[13px] text-muted-foreground">{tt("", "Your flag will appear on your posts")}</p>
            </div>

            <div className="relative">
              <div className="relative">
                {countryCode && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[22px] pointer-events-none">
                    {countryCode === "OTHER" ? "🌍" : countryFlag(countryCode)}
                  </span>
                )}
                <input
                  type="text"
                  placeholder={tt("", "Search country...")}
                  value={countrySearch}
                  onChange={(e) => {
                    setCountrySearch(e.target.value);
                    setCountryCode(null);
                  }}
                  onFocus={() => setCountryFocused(true)}
                  onBlur={() => setTimeout(() => setCountryFocused(false), 150)}
                  className={`w-full h-12 rounded-xl bg-muted border text-foreground placeholder-neutral-500 text-[15px] focus:outline-none focus:border-white transition-colors ${
                    countryCode ? "pl-12 pr-4 border-white" : "px-4 border-border"
                  }`}
                />
              </div>

              {(countryFocused && !countryCode) && (() => {
                const sorted = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
                const results = countrySearch
                  ? sorted.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
                  : sorted;
                if (results.length === 0) return null;
                return (
                  <div className="absolute z-10 w-full mt-1 rounded-xl bg-muted border border-border overflow-hidden max-h-52 overflow-y-auto shadow-xl">
                    {results.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCountryCode(c.code);
                          setCountrySearch(c.name);
                          setCountryFocused(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
                      >
                        <span className="text-[20px]">{c.code === "OTHER" ? "🌍" : countryFlag(c.code)}</span>
                        <span className="text-[15px] text-foreground">{c.name}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* 이메일 폴백: OAuth(구글/애플)가 email을 안 준 경우만 노출.
                외국인은 카카오 알림톡을 못 써서 이메일이 유일한 알림 채널. */}
            {isForeigner && authUser && !authUser.email && (
              <div className="space-y-1.5">
                <p className="text-[13px] text-muted-foreground">
                  {tt("", "Email")} <span className="text-muted-foreground">{tt("", "— we'll notify you when clubs send offers")}</span>
                </p>
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full h-12 rounded-xl bg-muted border border-border text-foreground placeholder-neutral-500 text-[15px] px-4 focus:outline-none focus:border-white transition-colors"
                />
                {(() => {
                  const sug = suggestEmail(emailInput);
                  if (!sug) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => setEmailInput(sug)}
                      className="text-[12px] text-brand-amber hover:text-brand-amber transition-colors"
                    >
                      {tt("", "Did you mean")} <span className="font-bold underline">{sug}</span>?
                    </button>
                  );
                })()}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <Button
                onClick={() => setStep("profile")}
                disabled={!countryCode || (isForeigner && !!authUser && !authUser.email && !isValidEmailFormat(emailInput))}
                className="w-full h-12 font-black text-base bg-inverse text-inverse-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground transition-all"
              >
                {tt("", "Next")} →
              </Button>
              <button
                type="button"
                onClick={() => setStep("agree")}
                className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground/80 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> {tt("이전", "Back")}
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
