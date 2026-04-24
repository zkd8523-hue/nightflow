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

  const handleSubmit = async () => {
    if (!authUser || !requiredMet) return;
    setLoading(true);

    try {
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
        phone: null,
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
      toast.success(`어서오세요, ${displayName}님!`);
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
        <p className="text-neutral-400">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] p-4">
      <Card className="w-full max-w-md p-8 space-y-6 bg-[#1C1C1E] border border-neutral-700 shadow-2xl">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight">NightFlow</h1>
          <p className="text-sm text-neutral-300">클럽이 스마트해진다.</p>
        </div>

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
          onClick={handleSubmit}
          disabled={!requiredMet || loading}
          className="w-full h-12 font-black text-base bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-500 transition-all"
        >
          {loading ? "가입 중..." : "동의하고 시작하기"}
        </Button>
      </Card>
    </div>
  );
}
