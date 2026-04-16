"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics";
import {
  isDisplayNameTaken,
  suggestDisplayName,
  validateDisplayName,
} from "@/lib/utils/displayName";

import type { User as AuthUser } from "@supabase/supabase-js";

interface SignupFormProps {
  referralCode?: string | null;
  mdReferrer?: string | null;
}

interface KakaoProfile {
  name: string;
  phone: string;
  birthday: string;
  gender: "male" | "female" | "";
  profileImage: string | null;
  suggestedNickname: string;
}

function extractKakaoProfile(meta: Record<string, unknown>): KakaoProfile | null {
  const fullName =
    typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const fallbackName = typeof meta.name === "string" ? meta.name.trim() : "";
  const name = fullName || fallbackName;

  // 카카오 phone_number 형식: "+82 10-1234-5678" → "01012345678"
  const rawPhone = typeof meta.phone_number === "string" ? meta.phone_number : "";
  const phone = rawPhone
    ? rawPhone.replace(/^\+82\s?/, "0").replace(/\D/g, "")
    : "";

  // 카카오 birthyear: "2000", birthday: "0714" (MMDD) → "2000-07-14"
  const birthyear = typeof meta.birthyear === "string" ? meta.birthyear : "";
  const birthdayRaw = typeof meta.birthday === "string" ? meta.birthday : "";
  const birthday =
    birthyear && birthdayRaw && birthdayRaw.length >= 4
      ? `${birthyear}-${birthdayRaw.slice(0, 2)}-${birthdayRaw.slice(2, 4)}`
      : "";

  const gender = meta.gender === "male" || meta.gender === "female" ? meta.gender : "";

  const profileImage =
    typeof meta.avatar_url === "string" ? meta.avatar_url : null;

  const kakaoNickname =
    typeof meta.nickname === "string" && meta.nickname.trim().length > 0
      ? meta.nickname.trim()
      : "";
  const nicknameSeed =
    kakaoNickname && kakaoNickname !== name ? kakaoNickname : name || "유저";
  const suggestedNickname = suggestDisplayName(nicknameSeed).slice(0, 16);

  if (!name || !phone || !birthday) return null;

  return { name, phone, birthday, gender, profileImage, suggestedNickname };
}

function formatPhoneDisplay(raw: string): string {
  if (raw.length !== 11) return raw;
  return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7)}`;
}

export function SignupForm({ referralCode, mdReferrer }: SignupFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const redirectAfterSignup = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [kakaoProfile, setKakaoProfile] = useState<KakaoProfile | null>(null);
  const [scopeMissing, setScopeMissing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [alimtalkConsent, setAlimtalkConsent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthUser(user);

      const profile = extractKakaoProfile(user.user_metadata ?? {});
      if (!profile) {
        setScopeMissing(true);
        return;
      }
      setKakaoProfile(profile);
      setDisplayName(profile.suggestedNickname);
    });
  }, [router, supabase]);

  const handleReauth = async () => {
    await supabase.auth.signOut();
    router.push("/login?error=scope_required");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !kakaoProfile) return;

    setLoading(true);

    // 성인 게이트 (청소년보호법: 만 19세 이상)
    const birthYear = parseInt(kakaoProfile.birthday.slice(0, 4));
    const birthMonth = parseInt(kakaoProfile.birthday.slice(5, 7));
    const birthDay = parseInt(kakaoProfile.birthday.slice(8, 10));
    const today = new Date();
    let age = today.getFullYear() - birthYear;
    if (
      today.getMonth() + 1 < birthMonth ||
      (today.getMonth() + 1 === birthMonth && today.getDate() < birthDay)
    ) {
      age--;
    }
    if (age < 19) {
      toast.error("NightFlow는 만 19세 이상만 이용할 수 있습니다.");
      setLoading(false);
      return;
    }

    const displayNameTrimmed = displayName.trim();
    const nicknameCheck = validateDisplayName(displayNameTrimmed);
    if (!nicknameCheck.ok) {
      toast.error(nicknameCheck.message ?? "닉네임을 확인해주세요.");
      setLoading(false);
      return;
    }

    try {
      if (await isDisplayNameTaken(supabase, displayNameTrimmed)) {
        toast.error("이미 사용 중인 닉네임입니다.");
        setLoading(false);
        return;
      }
    } catch (checkErr) {
      logger.error("display_name duplicate check failed:", checkErr);
    }

    try {
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
        kakao_id: authUser.user_metadata?.provider_id || authUser.id,
        name: kakaoProfile.name,
        display_name: displayNameTrimmed,
        phone: kakaoProfile.phone,
        profile_image: kakaoProfile.profileImage,
        role: "user",
        birthday: kakaoProfile.birthday,
        gender: kakaoProfile.gender || null,
        age_verified_at: new Date().toISOString(),
        alimtalk_consent: alimtalkConsent,
        alimtalk_consent_at: alimtalkConsent ? new Date().toISOString() : null,
        referred_by: referredById,
        signup_source: signupSource,
      });

      if (error) throw error;

      trackEvent("signup_completed", {
        user_type: "user",
        signup_source: signupSource,
        has_referrer: !!referredById,
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

  if (scopeMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 p-4">
        <Card className="w-full max-w-md p-8 space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">추가 동의가 필요합니다</h1>
            <p className="text-sm text-neutral-500">
              NightFlow 가입을 위해 카카오에서 <strong>이름·전화번호·생년월일</strong> 제공 동의가 필요합니다.
            </p>
          </div>
          <div className="rounded-lg bg-neutral-900/60 border border-neutral-800 p-4 text-left text-xs text-neutral-500 space-y-1">
            <p>• 이름: MD 연락·현장 확인용</p>
            <p>• 전화번호: 낙찰 알림톡 발송</p>
            <p>• 생년월일: 만 19세 성인 인증</p>
          </div>
          <Button onClick={handleReauth} className="w-full">
            카카오 동의 다시 받기
          </Button>
        </Card>
      </div>
    );
  }

  if (!kakaoProfile) {
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
          <h1 className="text-2xl font-bold">프로필 설정</h1>
          <p className="text-sm text-neutral-500">
            NightFlow에 오신 것을 환영합니다!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">닉네임 *</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="2-16자"
              maxLength={16}
              required
              autoFocus
            />
            <p className="text-xs text-neutral-500">
              경매 입찰 시 다른 사용자에게 표시됩니다.
            </p>
          </div>

          <div className="rounded-lg bg-neutral-900/60 border border-neutral-800 p-4 space-y-2 text-sm">
            <p className="text-xs text-neutral-500 uppercase tracking-wider">
              카카오에서 가져온 정보
            </p>
            <div className="flex justify-between">
              <span className="text-neutral-500">이름</span>
              <span className="text-neutral-200">{kakaoProfile.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">전화번호</span>
              <span className="text-neutral-200">{formatPhoneDisplay(kakaoProfile.phone)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">생년월일</span>
              <span className="text-neutral-200">{kakaoProfile.birthday}</span>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={alimtalkConsent}
              onChange={(e) => setAlimtalkConsent(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-white"
            />
            <span className="text-sm text-neutral-400">
              카카오 알림톡 수신에 동의합니다 (경매 시작, 입찰 역전 등 경쟁 관련 알림)
              <br />
              <span className="text-xs text-neutral-500">
                * 거래 관련 알림(낙찰, 연락 마감 등)은 서비스 이용 시 자동 발송됩니다.
              </span>
            </span>
          </label>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "가입 중..." : "시작하기"}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push("/md/apply")}
              className="text-sm text-neutral-400 hover:text-neutral-200 underline"
            >
              MD로 활동하고 싶으신가요?
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
