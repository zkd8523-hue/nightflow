"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { getFeedbackScore, isFeedbackSnoozed, FEEDBACK_THRESHOLD } from "@/lib/utils/appFeedbackEngagement";

// 세션 내 dismiss/submit 이후 재노출 방지 (React 상태로만 — 새로고침 시 dev 재테스트 가능)
const SESSION_KEY = "naflFeedbackSessionClosed";

/**
 * 앱 피드백 프롬프트 노출 여부.
 *
 * 프로덕션 조건: 네이티브 앱 && 로그인 && !app_feedback_prompt_seen && 인게이지먼트 임계 도달.
 * 로컬(dev) 테스트: 네이티브/임계/seen 무시하고 항상 후보 → 웹 localhost에서 바로 확인 가능.
 *   (process.env.NODE_ENV === 'development' 에서만. 프로덕션 빌드에선 자동 비활성.)
 */
export function useAppFeedbackPrompt() {
  const { user, isLoading } = useCurrentUser();
  const { isNative, resolved } = useIsNativeApp();
  const [closed, setClosed] = useState(false);
  const [armed, setArmed] = useState(false);

  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (typeof window === "undefined") return;
    // dev는 세션 기억을 무시 → 새로고침마다 다시 떠서 바로 재테스트 가능
    if (!isDev && sessionStorage.getItem(SESSION_KEY)) { setClosed(true); return; }
    if (isLoading || !resolved) return;
    if (!user) return;

    if (isDev) { setArmed(true); return; }               // dev: 조건 무시하고 노출
    if (!isNative) return;                                 // prod: 네이티브만
    if (user.app_feedback_prompt_seen) return;             // prod: 제출 완료 계정 제외(영구)
    if (isFeedbackSnoozed()) return;                       // prod: "다음에" 후 30일간 숨김
    if (getFeedbackScore() < FEEDBACK_THRESHOLD) return;   // prod: 인게이지먼트 임계
    setArmed(true);
  }, [isDev, isLoading, resolved, user, isNative]);

  const close = () => {
    // dev에선 세션 기억을 남기지 않아 새로고침 시 다시 뜸(재테스트용)
    if (!isDev) { try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* noop */ } }
    setClosed(true);
  };

  return { shouldShow: armed && !closed, close, user };
}
