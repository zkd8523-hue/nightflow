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

import type { User as AuthUser } from "@supabase/supabase-js";

interface SignupFormProps {
  referralCode?: string | null;
  mdReferrer?: string | null;
}

export function SignupForm({ referralCode, mdReferrer }: SignupFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const redirectAfterSignup = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    birthday: "",
    gender: "",
    alimtalkConsent: false,
  });

  useEffect(() => {
    // 카카오 로그인 후 auth user 가져오기
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthUser(user);
      // 카카오 프로필에서 이름 가져오기
      const meta = user.user_metadata ?? {};
      const kakaoName = meta.full_name || meta.name || "";

      // 카카오 phone_number 형식: "+82 10-1234-5678" → "01012345678"
      const phone = meta.phone_number
        ? meta.phone_number.replace(/^\+82\s?/, "0").replace(/\D/g, "")
        : "";

      // 카카오 birthyear: "2000", birthday: "0714" (MMDD) → "2000-07-14"
      const birthday =
        meta.birthyear && meta.birthday
          ? `${meta.birthyear}-${String(meta.birthday).slice(0, 2)}-${String(meta.birthday).slice(2, 4)}`
          : "";

      // 카카오 gender: "male" | "female"
      const gender = meta.gender ?? "";

      setFormData((prev) => ({ ...prev, name: kakaoName, phone, birthday, gender }));
    });
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;

    setLoading(true);

    // 성인 게이트 (청소년보호법: 만 19세 이상)
    if (!formData.birthday) {
      toast.error("생년월일 정보가 필요합니다. 카카오 동의 항목에서 생년월일을 허용해주세요.");
      setLoading(false);
      return;
    }
    const birthYear = parseInt(formData.birthday.slice(0, 4));
    const birthMonth = parseInt(formData.birthday.slice(5, 7));
    const birthDay = parseInt(formData.birthday.slice(8, 10));
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

    try {
      // 추천인 자동 조회 (유저에게 비노출)
      let referredById: string | null = null;
      let signupSource = 'direct';

      if (referralCode) {
        const { data: referrer } = await supabase
          .from("users")
          .select("id")
          .eq("referral_code", referralCode)
          .is("deleted_at", null)
          .single();
        if (referrer && referrer.id !== authUser.id) {
          referredById = referrer.id;
          signupSource = 'referral';
        }
      } else if (mdReferrer) {
        referredById = mdReferrer;
        signupSource = 'md_profile';
      }

      // users 테이블에 프로필 생성
      const { error } = await supabase.from("users").insert({
        id: authUser.id,
        kakao_id: authUser.user_metadata?.provider_id || authUser.id,
        name: formData.name,
        phone: formData.phone,
        profile_image: authUser.user_metadata?.avatar_url || null,
        role: "user",
        birthday: formData.birthday || null,
        gender: formData.gender || null,
        age_verified_at: formData.birthday ? new Date().toISOString() : null,
        alimtalk_consent: formData.alimtalkConsent,
        alimtalk_consent_at: formData.alimtalkConsent ? new Date().toISOString() : null,
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
            <Label htmlFor="name">이름 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="홍길동"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">전화번호 *</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              placeholder="010-1234-5678"
              required
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.alimtalkConsent}
              onChange={(e) =>
                setFormData({ ...formData, alimtalkConsent: e.target.checked })
              }
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
