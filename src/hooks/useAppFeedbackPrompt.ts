"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getFeedbackScore, isFeedbackSnoozed, FEEDBACK_THRESHOLD } from "@/lib/utils/appFeedbackEngagement";

// 세션 내 dismiss/submit 이후 재노출 방지
const SESSION_KEY = "naflFeedbackSessionClosed";

/**
 * 앱 피드백 프롬프트 노출 여부. (스토어 리뷰가 아니라 자체 피드백이라 웹/앱 모두 대상)
 *
 * 노출 조건: 로그인 && !app_feedback_prompt_seen && !snooze(30일) && 인게이지먼트 임계 도달.
 *   진입 즉시 팝업이 아니라 상세 열람·홈 스크롤 등 어느 정도 써본 뒤에만 노출.
 *   (로컬/프로덕션 동일 게이팅. 로컬에서 강제로 보려면 상세 3개 열람 등으로 점수를 채우면 됨.)
 */
export function useAppFeedbackPrompt() {
  const { user, isLoading } = useCurrentUser();
  const [closed, setClosed] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY)) { setClosed(true); return; }
    if (isLoading || !user) return;
    if (user.app_feedback_prompt_seen) return;             // 제출 완료 계정 제외(영구)
    if (isFeedbackSnoozed()) return;                       // "다음에" 후 30일간 숨김
    if (getFeedbackScore() < FEEDBACK_THRESHOLD) return;   // 인게이지먼트 임계
    setArmed(true);
  }, [isLoading, user]);

  const close = () => {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* noop */ }
    setClosed(true);
  };

  return { shouldShow: armed && !closed, close, user };
}
