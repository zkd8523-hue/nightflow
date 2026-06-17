"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useRouter, useSearchParams } from "next/navigation";
import { logger } from "@/lib/utils/logger";
import { trackEvent } from "@/lib/analytics/events";
import { isInstantEnabled } from "@/lib/features";
import { isInAppBrowser, isIOS } from "@/lib/utils/browser";
import { BackButton } from "@/components/ui/BackButton";
import { Suspense } from "react";

const isDev = process.env.NODE_ENV === "development";
const isTestLoginEnabled =
  isDev || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";

const TEST_PASSWORD = "test1234";
const TEST_EMAILS = new Set([
  "test-user@nightflow.test",
  "test-md@nightflow.test",
  "test-admin@nightflow.test",
]);
const TEST_PRESETS = [
  { label: "User", email: "test-user@nightflow.test", color: "bg-amber-500 hover:bg-amber-400" },
  { label: "MD", email: "test-md@nightflow.test", color: "bg-purple-500 hover:bg-purple-400 text-white" },
  { label: "Admin", email: "test-admin@nightflow.test", color: "bg-red-500 hover:bg-red-400 text-white" },
] as const;

function getAuthErrorMessage(error: string | null) {
  if (!error) return "";
  if (error === "session_expired") return `세션이 만료되었습니다. 다시 로그인해주세요. (${error})`;
  if (error === "pkce_failed") return `보안 코드 오류입니다. 다시 시도해주세요. (${error})`;
  if (error === "exchange_failed") return `인증 코드 교환에 실패했습니다. (${error})`;
  if (error === "auth_failed") return `인증 코드를 받지 못했습니다. (${error})`;
  return `로그인 실패. (${error})`;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";
  const authError = getAuthErrorMessage(searchParams.get("error"));
  const [isInAppAndroid, setIsInAppAndroid] = useState(false);
  const [isIOSNative, setIsIOSNative] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [titleClicks, setTitleClicks] = useState(0);

  useEffect(() => {
    setIsInAppAndroid(isInAppBrowser() && !isIOS());
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      setIsIOSNative(
        Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios",
      );
    })();
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devError, setDevError] = useState("");
  const [loginError, setLoginError] = useState("");

  const supabase = createClient();

  // 💡 [캐시 초기화] 인증 에러가 있을 때만 잔여 세션 정리 (정상 진입 시에는 건드리지 않음)
  useEffect(() => {
    if (authError) {
      supabase.auth.signOut().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authError]);

  // 💡 이미 로그인된 유저가 접근 시 가입 상태에 따라 리다이렉트
  // 단, 테스트 로그인 모드에선 자동 리다이렉트를 끄고 직접 계정 전환이 가능하도록 함
  useEffect(() => {
    if (isTestLoginEnabled) return;
    let cancelled = false;
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("phone")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;
        if (profile?.phone) {
          router.push(redirectPath); // 가입 완료자 → redirect 파라미터 우선
        } else {
          router.push(`/signup${redirectPath !== "/" ? `?next=${encodeURIComponent(redirectPath)}` : ""}`); // 가입 미완료자
        }
      }
    };
    checkUser();
    return () => { cancelled = true; };
  }, [router, supabase]);

  const handleKakaoLogin = async (customRedirect?: string) => {
    trackEvent('login_click', { method: 'kakao' });
    setLoading(true);
    setLoginError("");
    const target = customRedirect || redirectPath;

    try {
      // Capacitor 앱: 카카오 네이티브 SDK (주소창 없음)
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { kakaoNativeLogin } = await import("@/lib/native/kakaoLogin");
        const { isNewUser } = await kakaoNativeLogin();
        if (isNewUser) {
          router.push(`/signup${target !== "/" ? `?next=${encodeURIComponent(target)}` : ""}`);
        } else {
          router.push(target);
          router.refresh();
        }
        setLoading(false);
        return;
      }

      // 웹: 기존 플로우 유지
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
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

  const handleAppleLogin = async (customRedirect?: string) => {
    trackEvent('login_click', { method: 'apple' });
    setLoading(true);
    setLoginError("");
    const target = customRedirect || redirectPath;

    try {
      const { appleNativeLogin } = await import("@/lib/native/appleLogin");
      const { isNewUser } = await appleNativeLogin();
      if (isNewUser) {
        router.push(`/signup${target !== "/" ? `?next=${encodeURIComponent(target)}` : ""}`);
      } else {
        router.push(target);
        router.refresh();
      }
      setLoading(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoginError(msg);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (customRedirect?: string) => {
    trackEvent('login_click', { method: 'google' });
    setLoading(true);
    setLoginError("");
    const target = customRedirect || redirectPath;

    try {
      // Capacitor 앱: 구글 네이티브 SDK (주소창 없음, PKCE 우회)
      const { Capacitor: Cap } = await import("@capacitor/core");
      if (Cap.isNativePlatform()) {
        const { googleNativeLogin } = await import("@/lib/native/googleLogin");
        const { isNewUser } = await googleNativeLogin();
        if (isNewUser) {
          router.push(`/signup${target !== "/" ? `?next=${encodeURIComponent(target)}` : ""}`);
        } else {
          router.push(target);
          router.refresh();
        }
        setLoading(false);
        return;
      }

      // 웹: 기존 플로우 유지
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
          queryParams: { access_type: "offline", prompt: "select_account" },
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

  const handleDevLogin = async (presetEmail?: string, presetPassword?: string) => {
    setLoading(true);
    setDevError("");

    const loginEmail = presetEmail ?? email;
    const loginPassword = presetPassword ?? password;

    // 계정 전환을 위해 기존 세션 정리 (프리셋 클릭 시)
    if (presetEmail) {
      await supabase.auth.signOut().catch(() => {});
    }

    // 먼저 로그인 시도
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (error) {
      console.log("[DEV Login] signInWithPassword 실패:", error.message);

      // 계정이 없으면 회원가입 시도
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: loginEmail,
        password: loginPassword,
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
          email: loginEmail,
          password: loginPassword,
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

    // 테스트 프리셋 계정은 가입 절차 전체를 서버에서 자동 완료
    if (user.email && TEST_EMAILS.has(user.email)) {
      try {
        const res = await fetch("/api/auth/test-bootstrap", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setDevError(`테스트 계정 초기화 실패: ${data.message || data.error || res.statusText}`);
          setLoading(false);
          return;
        }
      } catch (e) {
        setDevError(`테스트 계정 초기화 오류: ${e instanceof Error ? e.message : String(e)}`);
        setLoading(false);
        return;
      }
      setLoading(false);
      window.location.replace(redirectPath);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .single();

    setLoading(false);

    if (!profile) {
      router.push(`/signup${redirectPath !== "/" ? `?next=${encodeURIComponent(redirectPath)}` : ""}`);
      return;
    }

    router.push(redirectPath);
    router.refresh();
  };



  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-neutral-950 to-neutral-900 p-4">
      <Card className="w-full max-w-md p-8 space-y-5 relative">
        <div className="absolute top-4 left-4 z-10">
          <BackButton fallbackHref="/" />
        </div>
        <div className="text-center space-y-2">
          <h1
            className="cursor-pointer select-none leading-snug"
            onClick={() => {
              setTitleClicks((prev) => {
                const next = prev + 1;
                if (next >= 5) {
                  setShowDevLogin(true);
                  return 0;
                }
                return next;
              });
            }}
          >
            <span className="block text-2xl font-bold">NightFlow</span>
            <span className="block text-sm font-medium text-neutral-300">접속하는 순간, VIP</span>
          </h1>
          <div className="flex items-center justify-center text-[11px] text-neutral-500 font-normal whitespace-nowrap">
            모든 서비스 무료
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
          {isInAppAndroid ? (
            <>
              <Button
                onClick={() => {
                  const path = window.location.pathname + window.location.search;
                  window.location.href =
                    `intent://nightflow.kr${path}#Intent;scheme=https;package=com.android.chrome;end`;
                }}
                className="w-full h-12 bg-white text-black hover:bg-neutral-100 cursor-pointer"
              >
                🌐 Chrome으로 열고 로그인하기
              </Button>
              <p className="text-xs text-center text-neutral-500 leading-relaxed">
                인스타그램 인앱에서는 로그인이 동작하지 않습니다.<br />
                Chrome에서 열어 카카오/구글로 로그인해보세요!
              </p>
            </>
          ) : (
            <>
              {(isIOSNative || isTestLoginEnabled) && (
                <Button
                  onClick={() => handleAppleLogin()}
                  disabled={loading}
                  className="w-full h-12 bg-black text-white border border-neutral-700 hover:bg-neutral-900 cursor-pointer"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  {loading ? "로그인 중..." : "Apple로 시작하기"}
                </Button>
              )}

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
            </>
          )}

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
        {(isTestLoginEnabled || showDevLogin) && (
          <div className="border-t border-neutral-800 pt-4 space-y-3">
            <p className="text-xs text-amber-500 text-center font-bold">
              Test Login (auto-creates account if missing)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TEST_PRESETS.map((preset) => (
                <Button
                  key={preset.email}
                  onClick={() => handleDevLogin(preset.email, TEST_PASSWORD)}
                  disabled={loading}
                  className={`h-10 font-bold ${preset.color}`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-500 text-center">
              Password: <code className="text-neutral-400">{TEST_PASSWORD}</code> · or enter manually
            </p>
            <p className="text-[10px] text-amber-400/80 text-center leading-relaxed">
              회원가입 시 전화번호는 <code className="text-amber-300">010-0000-0000</code> 입력 → 인증번호 <code className="text-amber-300">000000</code> 자동 통과
            </p>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 bg-neutral-900 border-neutral-800 text-white"
            />
            <Input
              type="password"
              placeholder="Password (6+ chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 bg-neutral-900 border-neutral-800 text-white"
            />
            {devError && (
              <p className="text-xs text-red-500">{devError}</p>
            )}
            <Button
              onClick={() => handleDevLogin()}
              disabled={loading || !email || password.length < 6}
              className="w-full h-10 bg-amber-500 text-black font-bold hover:bg-amber-400"
            >
              {loading ? "Logging in..." : "Test Login"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
      <LoginContent />
    </Suspense>
  );
}
