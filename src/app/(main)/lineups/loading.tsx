/**
 * /lineups 로딩 스켈레톤.
 *
 * 이 화면은 서버 렌더(revalidate 300)라 최초 진입 시 RSC 응답을 기다린다.
 * loading.tsx가 없으면 그동안 이전 화면이 그대로 멈춰 있어 "탭이 안 눌렸나"로
 * 읽힌다 — 실제 대기시간보다 훨씬 길게 느껴지는 원인.
 *
 * 실제 목록과 같은 컨테이너(max-w-lg lg:max-w-4xl px-4 pt-6)를 써서
 * 내용이 도착할 때 가로 위치가 튀지 않게 한다.
 */
export default function LineupsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
        {/* LED 전광판 탭 자리 */}
        <div className="h-14 rounded-lg bg-[#1C1C1E] animate-pulse" />

        {/* 지역 필터 칩 줄 */}
        <div className="flex gap-2 overflow-hidden">
          {[56, 44, 52, 48, 60].map((w, i) => (
            <div
              key={i}
              className="h-7 rounded-full bg-[#1C1C1E] animate-pulse flex-shrink-0"
              style={{ width: w }}
            />
          ))}
        </div>

        {/* 검색창 자리 */}
        <div className="h-9 rounded-lg bg-[#1C1C1E] animate-pulse" />

        {/* 라인업 카드 */}
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-[#1C1C1E] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-white/5 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/2 rounded bg-white/5 animate-pulse" />
                  <div className="h-2.5 w-1/3 rounded bg-white/5 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2 pt-1">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="h-2.5 w-10 rounded bg-white/5 animate-pulse flex-shrink-0" />
                    <div className="h-2.5 flex-1 max-w-[40%] rounded bg-white/5 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
