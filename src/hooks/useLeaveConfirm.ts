import { useEffect, useRef, useState } from "react";

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
  // confirmLeave가 트리거한 history.back()의 popstate를 모달로 다시 잡지 않기 위한 가드.
  const isLeavingRef = useRef(false);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    // 가드 state 푸시 — 첫 popstate에서 모달 띄우기 위함
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      if (isLeavingRef.current) {
        isLeavingRef.current = false;
        return;
      }
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
    /** 사용자 "확인" → 가드 state + 폼 페이지 두 칸 뒤로 가서 실제 이전 페이지로 이동 */
    confirmLeave: () => {
      isLeavingRef.current = true;
      setShowConfirm(false);
      setTimeout(() => window.history.go(-2), 0);
    },
    cancelLeave: () => setShowConfirm(false),
  };
}
