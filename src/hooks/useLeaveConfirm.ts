import { useEffect, useState } from "react";

/**
 * 페이지 이탈 가드 훅.
 * - beforeunload: 탭 닫기/새로고침 → 브라우저 네이티브 경고
 * - popstate: 뒤로가기 → showConfirm을 true로 세팅 (호출자가 모달 렌더)
 *
 * 사용 예:
 *   const { showConfirm, setShowConfirm, confirmLeave, cancelLeave } = useLeaveConfirm(isDirty);
 */
export function useLeaveConfirm(isDirty: boolean) {
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    // 가드 state 푸시 — 첫 popstate에서 모달 띄우기 위함
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      setShowConfirm(true);
      // 취소 케이스 대비 가드 재삽입
      window.history.pushState(null, "", window.location.href);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isDirty]);

  return {
    showConfirm,
    setShowConfirm,
    /** 사용자 "확인" → 모달 닫고 한 단계 더 뒤로가기로 가드 state 빠져나감 */
    confirmLeave: () => {
      setShowConfirm(false);
      setTimeout(() => window.history.back(), 0);
    },
    cancelLeave: () => setShowConfirm(false),
  };
}
