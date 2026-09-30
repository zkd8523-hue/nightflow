"use client";

// 네이티브 푸시 알림을 눌렀을 때(pushNotificationActionPerformed, pushNotifications.ts)
// window.location.href로 이동하면 앱 전체가 새로고침돼 제안서·확정서 화면이 뜨기까지
// 몇 초씩 걸렸다(2026-09-30, 홈이 잠깐 스쳐 지나간 뒤 목적지가 뜬다고 보고됨).
// 그 리스너는 React 컴포넌트 바깥의 순수 함수라 useRouter()를 직접 못 쓴다 — 대신
// GlobalRouterRegistrar(providers.tsx에 상시 마운트)가 최신 router 인스턴스를 여기
// 등록해두고, 리스너는 호출 시점에 이 전역값을 읽어 router.push로 클라이언트 전환한다.
// Next.js App Router의 router 객체는 앱 전체에서 안정적인 참조라 이 방식이 안전하다.

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

let currentRouter: AppRouterInstance | null = null;

export function setGlobalRouter(router: AppRouterInstance) {
  currentRouter = router;
}

/** true = 클라이언트 라우팅으로 처리함(push). false = router가 아직 없어 호출부가 폴백해야 함. */
export function navigateGlobally(url: string): boolean {
  if (!currentRouter) return false;
  currentRouter.push(url);
  return true;
}
