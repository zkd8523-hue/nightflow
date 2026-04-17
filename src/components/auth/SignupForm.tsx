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
  const [alimtalkConsent, setAlimtalkConsent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthUser(user);

      const meta = user.user_metadata ?? {};
      const kakaoNickname =
        typeof meta.nickname === "string" && meta.nickname.trim().length > 0
          ? meta.nickname.trim()
          : "유저";
      setDisplayName(suggestDisplayName(kakaoNickname).slice(0, 16));
    });
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;

    setLoading(true);

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

      // 실명·전화·생일은 첫 PASS 본인인증 시점에 채워짐 (Migration 114)
      const { error } = await supabase.from("users").insert({
        id: authUser.id,
        kakao_id: authUser.user_metadata?.provider_id || authUser.id,
        display_name: displayNameTrimmed,
        profile_image: authUser.user_metadata?.avatar_url || null,
        role: "user",
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">프로필 설정</h1>
          <p className="text-sm text-neutral-500">
            NightFlow에 오신 것을 환영합니다!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
