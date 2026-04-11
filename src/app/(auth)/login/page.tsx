"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/utils/logger";

const isDev = process.env.NODE_ENV === "development";

function getRedirectPath() {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams(window.location.search);
  return params.get("redirect") || "/";
}

export default function LoginPage() {
  const router = useRouter();
  const redirectPath = getRedirectPath();
  const [loading, setLoading] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devError, setDevError] = useState("");
  const supabase = createClient();

  const handleKakaoLogin = async (customRedirect?: string) => {
    setLoading(true);
    const target = customRedirect || redirectPath;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        // ✅ Kakao OAuth Redirect URI 쿼리 파라미터 처리
        // - 카카오 개발자 콘솔 등록 URI: http://localhost:3000/auth/callback (쿼리 제외)
        // - 실제 요청 URI: http://localhost:3000/auth/callback?next=%2F
        // - 카카오는 scheme/host/port/path만 검증하므로 쿼리 파라미터는 안전
        // - next 파라미터는 /auth/callback에서 로그인 후 리다이렉트에 사용
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
        scopes: "profile_nickname profile_image account_email phone_number birthday birthyear gender",
        skipBrowserRedirect: false,
      },
    });

    if (error) {
      logger.error("Login error:", error);
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setLoading(true);
    setDevError("");

    // 먼저 로그인 시도
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // 계정이 없으면 회원가입 시도
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setDevError(signUpError.message);
        setLoading(false);
        return;
      }

      // 회원가입 성공 시 users 테이블에 프로필 생성 (기존 프로필 있으면 건너뜀)
      if (signUpData.user) {
        await supabase.from("users").upsert({
          id: signUpData.user.id,
          role: "user",
          name: email.split("@")[0],
          kakao_id: `dev_${email}`,
        }, { ignoreDuplicates: true });
      }
    }

    // users 테이블에 프로필 있는지 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!profile) {
        await supabase.from("users").upsert({
          id: user.id,
          role: "user",
          name: email.split("@")[0],
          kakao_id: `dev_${email}`,
        }, { ignoreDuplicates: true });
      }
    }

    setLoading(false);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 p-4">
      <Card className="w-full max-w-md p-8 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">NightFlow</h1>
          <p className="text-neutral-500">클럽 테이블 경매 플랫폼</p>
        </div>

        {/* 세션 만료 안내 */}
        {redirectPath !== "/" && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
            <p className="text-[13px] text-amber-400 font-bold">로그인 후 이용할 수 있습니다.</p>
          </div>
        )}

        <div className="space-y-4">
          <Button
            onClick={() => handleKakaoLogin()}
            disabled={loading}
            className="w-full h-12 bg-[#FEE500] text-black hover:bg-[#FDD835]"
          >
            {loading ? "로그인 중..." : "카카오로 시작하기"}
          </Button>

          <p className="text-xs text-center text-neutral-500">
            로그인 시{" "}
            <a href="#" className="underline">
              서비스 이용약관
            </a>{" "}
            및{" "}
            <a href="#" className="underline">
              개인정보 처리방침
            </a>
            에 동의하게 됩니다.
          </p>

          <p className="text-xs text-center text-neutral-500">
            클럽 MD이신가요?{" "}
            <button
              onClick={() => handleKakaoLogin("/md/apply")}
              className="text-amber-500 underline font-medium"
            >
              파트너 신청하기
            </button>
          </p>
        </div>

        {/* 개발용 테스트 로그인 */}
        {isDev && (
          <div className="border-t border-neutral-800 pt-4 space-y-3">
            <p className="text-xs text-amber-500 text-center font-bold">
              DEV 테스트 로그인 (계정 없으면 자동 생성)
            </p>
            <Input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 bg-neutral-900 border-neutral-800 text-white"
            />
            <Input
              type="password"
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 bg-neutral-900 border-neutral-800 text-white"
            />
            {devError && (
              <p className="text-xs text-red-500">{devError}</p>
            )}
            <Button
              onClick={handleDevLogin}
              disabled={loading || !email || password.length < 6}
              className="w-full h-10 bg-amber-500 text-black font-bold hover:bg-amber-400"
            >
              {loading ? "로그인 중..." : "테스트 로그인"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
