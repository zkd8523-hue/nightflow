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

function getAuthError() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error) return "";
  if (error === "session_expired") return "세션이 만료되었습니다. 다시 로그인해주세요.";
  return "카카오 로그인에 실패했습니다. 다시 시도해주세요.";
}

export default function LoginPage() {
  const router = useRouter();
  const redirectPath = getRedirectPath();
  const authError = getAuthError();
  const [loading, setLoading] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devError, setDevError] = useState("");
  const [loginError, setLoginError] = useState("");
  const supabase = createClient();

  const handleKakaoLogin = async (customRedirect?: string) => {
    setLoading(true);
    setLoginError("");
    const target = customRedirect || redirectPath;
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
          scopes: "profile_nickname profile_image",
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        logger.error("Login error:", error);
        setLoginError(error.message);
        setLoading(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoginError(msg);
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
      console.log("[DEV Login] signInWithPassword 실패:", error.message);

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

      // 회원가입은 됐는데 세션이 없으면 (이메일 인증 필요)
      // 바로 signInWithPassword 재시도
      if (!signUpData.session) {
        console.log("[DEV Login] signUp 세션 없음 (이메일 미인증), 재로그인 시도");
        const { error: retryError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (retryError) {
          setDevError("회원가입은 완료되었으나 이메일 인증이 필요합니다. Supabase Dashboard > Auth > Settings에서 'Enable email confirmations'를 끄세요.");
          setLoading(false);
          return;
        }
      }

    }

    // users 테이블에 프로필 있는지 확인
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setDevError("세션이 생성되지 않았습니다. 이메일/비밀번호를 확인하세요.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .single();

    setLoading(false);

    if (!profile) {
      router.push("/signup");
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 p-4">
      <Card className="w-full max-w-md p-8 space-y-5">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold">NightFlow</h1>
          <p className="text-[15px] text-neutral-300 font-medium leading-relaxed">
            강남·홍대 인기 클럽<br />테이블을 내 가격에
          </p>
          <div className="flex items-center justify-center gap-3 text-[11px] text-neutral-500 whitespace-nowrap">
            <span>🔥 실시간 특가</span>
            <span>·</span>
            <span>📅 얼리버드 입찰</span>
            <span>·</span>
            <span>💰 사전결제 없음</span>
          </div>
        </div>

        {/* 세션 만료 안내 */}
        {redirectPath !== "/" && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
            <p className="text-[13px] text-amber-400 font-bold">로그인 후 이용할 수 있습니다.</p>
          </div>
        )}

        {(loginError || authError) && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
            <p className="text-[13px] text-red-400 font-bold">{loginError || authError}</p>
          </div>
        )}

        <div className="space-y-4">
          <Button
            onClick={() => handleKakaoLogin()}
            disabled={loading}
            className="w-full h-12 bg-[#FEE500] text-black hover:bg-[#FDD835] cursor-pointer"
          >
            {loading ? "로그인 중..." : "카카오로 시작하기"}
          </Button>

          <p className="text-xs text-center text-neutral-500">
            로그인 시{" "}
            <a href="/terms" className="underline">
              서비스 이용약관
            </a>{" "}
            및{" "}
            <a href="/privacy" className="underline">
              개인정보 처리방침
            </a>
            에 동의하게 됩니다.
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
