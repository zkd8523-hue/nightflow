/**
 * 홈 로딩 스켈레톤.
 *
 * 홈은 SSR에서 10여 개 쿼리를 병렬로 돌린다(revalidate 10). 라우터 캐시가
 * 비었을 때는 그 응답을 기다리는데, loading.tsx가 없으면 그동안 직전 화면이
 * 그대로 얼어 있어 탭 전환이 실패한 것처럼 보인다.
 *
 * page.tsx와 같은 컨테이너(container max-w-lg lg:max-w-4xl px-4 pt-2)를 써서
 * 실제 콘텐츠가 들어올 때 좌우 정렬이 튀지 않게 한다.
 *
 * ⚠️ (main) 세그먼트 루트라 하위 라우트 중 자체 loading.tsx가 없는 화면에도
 *    이게 뜬다. 홈 전용 모양을 넣지 않고 일반적인 카드 스켈레톤만 두는 이유.
 */
export default function MainLoading() {
  return (
    <div className="container mx-auto max-w-lg lg:max-w-4xl px-4 pt-2 pb-4">
      {/* 전광판(LineupTicker) 자리 */}
      <div className="h-12 rounded-lg bg-[#1C1C1E] animate-pulse mb-3" />

      {/* 가로 스크롤 카드 줄 */}
      <div className="flex gap-3 overflow-hidden mb-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-40 flex-shrink-0 rounded-2xl bg-[#1C1C1E] animate-pulse"
            style={{ height: 180 }}
          />
        ))}
      </div>

      {/* 섹션 제목 + 목록 카드 */}
      <div className="h-4 w-32 rounded bg-[#1C1C1E] animate-pulse mb-3" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl bg-[#1C1C1E] p-4 flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-white/5 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded bg-white/5 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
              <div className="h-2.5 w-1/3 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
