"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics/events";
import { isInstantEnabled } from "@/lib/features";
import { isInAppBrowser, isIOS } from "@/lib/utils/browser";

const isDev = process.env.NODE_ENV === "development";

function getRedirectPath() {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams(window.location.search);
  return params.get("redirect") || "/";
}

async function tryOpenChrome(): Promise<boolean> {
  if (!isInAppBrowser() || isIOS()) return false;

  return new Promise((resolve) => {
    let opened = false;
    const onVisibilityChange = () => {
      if (document.hidden) opened = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const path = window.location.pathname + window.location.search;
    window.location.href =
      `intent://nightflow.kr${path}#Intent;scheme=https;package=com.android.chrome;end`;

    setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resolve(opened);
    }, 1500);
  });
}

function getAuthError() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error) return "";
  // 진단용: raw 에러 코드를 괄호 안에 함께 표시
  if (error === "session_expired") return `세션이 만료되었습니다. 다시 로그인해주세요. (${error})`;
  if (error === "pkce_failed") return `보안 코드 오류입니다. 다시 시도해주세요. (${error})`;
  if (error === "exchange_failed") return `인증 코드 교환에 실패했습니다. (${error})`;
  if (error === "auth_failed") return `인증 코드를 받지 못했습니다. (${error})`;
  return `로그인 실패. (${error})`;
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
    if (await tryOpenChrome()) return;
    trackEvent('login_click', { method: 'kakao' });
    setLoading(true);
    setLoginError("");
    const target = customRedirect || redirectPath;

    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setLoginError("로그인 페이지로 이동에 실패했습니다. Chrome 또는 Safari에서 다시 시도해주세요.");
    }, 5000);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        clearTimeout(safetyTimer);
        logger.error("Login error:", error);
        setLoginError(error.message);
        setLoading(false);
      }
    } catch (e: unknown) {
      clearTimeout(safetyTimer);
      const msg = e instanceof Error ? e.message : String(e);
      setLoginError(msg);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (customRedirect?: string) => {
    if (await tryOpenChrome()) return;
    trackEvent('login_click', { method: 'google' });
    setLoading(true);
    setLoginError("");
    const target = customRedirect || redirectPath;

    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setLoginError("로그인 페이지로 이동에 실패했습니다. Chrome 또는 Safari에서 다시 시도해주세요.");
    }, 5000);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        clearTimeout(safetyTimer);
        logger.error("Login error:", error);
        setLoginError(error.message);
        setLoading(false);
      }
    } catch (e: unknown) {
      clearTimeout(safetyTimer);
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
          <div className="space-y-1">
            <p className="text-[15px] text-neutral-300 font-medium whitespace-nowrap">
              {isInstantEnabled() ? "불금이 스마트해지는 세 가지 도구" : "불금이 스마트해지는 두 가지 도구"}
            </p>
            <div className="flex items-center justify-center gap-3 text-[11px] text-neutral-500 whitespace-nowrap">
              <span>⛳ 깃발</span>
              <span>·</span>
              <span>📅 얼리버드 경매</span>
              {isInstantEnabled() && (
                <>
                  <span>·</span>
                  <span>🔥 오늘특가</span>
                </>
              )}
            </div>
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
            onClick={() => handleGoogleLogin()}
            disabled={loading}
            className="w-full h-12 bg-white text-black border border-neutral-300 hover:bg-neutral-100 cursor-pointer"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {loading ? "로그인 중..." : "Google로 시작하기"}
          </Button>

          <Button
            onClick={() => handleKakaoLogin()}
            disabled={loading}
            className="w-full h-12 bg-[#FEE500] text-black hover:bg-[#FDD835] cursor-pointer"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.8 5.2 4.5 6.65L5.5 21l3.5-2.25c.97.2 2 .3 3 .3 5.52 0 10-3.48 10-7.8S17.52 3 12 3z" fill="#000" />
            </svg>
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
