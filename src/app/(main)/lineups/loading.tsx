import { LoadingSpinner } from "@/components/ui/skeleton";

/**
 * /lineups 로딩 화면.
 *
 * 이 화면은 서버 렌더(revalidate 300)라 최초 진입 시 RSC 응답을 기다린다.
 * loading.tsx가 없으면 그동안 이전 화면이 그대로 멈춰 있어 "탭이 안 눌렸나"로
 * 읽힌다 — 실제 대기시간보다 훨씬 길게 느껴지는 원인.
 *
 * 카드 모양을 흉내낸 스켈레톤 대신 중앙 스피너로 통일한다(2026-09-06,
 * 목업 3안 채택) — 사이트 전체 로딩 화면을 하나로 맞춘다.
 */
export default function LineupsLoading() {
  return <LoadingSpinner minHeight="70vh" />;
}
