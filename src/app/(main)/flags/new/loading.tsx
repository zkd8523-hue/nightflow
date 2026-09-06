import { LoadingSpinner } from "@/components/ui/skeleton";

// 깃발 등록 진입 전용 로딩 화면 — force-dynamic 페이지(auth + 프로필 조회) 서버 왕복 동안 즉시 노출.
// 예전엔 "중립 단일 카드" 스켈레톤이었다. 한국인(2카드 게이트)·외국인(1카드
// 여행 게이트) 어느 쪽으로 이어져도 모양이 안 튀게 하려던 것인데, 스피너로
// 바꾸면 애초에 흉내낼 모양 자체가 없어 이 문제가 사라진다(2026-09-06,
// 목업 3안 채택 — 사이트 전체 로딩 화면 통일).
export default function Loading() {
  return <LoadingSpinner minHeight="60vh" />;
}
