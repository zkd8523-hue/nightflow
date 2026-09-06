import { LoadingSpinner } from "@/components/ui/skeleton";

/**
 * 홈 로딩 화면.
 *
 * 홈은 SSR에서 10여 개 쿼리를 병렬로 돌린다(revalidate 10). 라우터 캐시가
 * 비었을 때는 그 응답을 기다리는데, loading.tsx가 없으면 그동안 직전 화면이
 * 그대로 얼어 있어 탭 전환이 실패한 것처럼 보인다.
 *
 * 카드 모양을 흉내낸 스켈레톤 대신 중앙 스피너로 통일한다(2026-09-06,
 * 목업 3안 채택) — 실제 콘텐츠 모양과 어차피 완전히 같을 수 없어 뭘 흉내내도
 * 어색하고, 사이트 전체에서 로딩 화면이 저마다 다른 인상을 준다.
 *
 * ⚠️ (main) 세그먼트 루트라 하위 라우트 중 자체 loading.tsx가 없는 화면에도
 *    이게 뜬다.
 */
export default function MainLoading() {
  return <LoadingSpinner minHeight="70vh" />;
}
