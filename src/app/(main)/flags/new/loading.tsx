import { Skeleton } from "@/components/ui/skeleton";

// 깃발 등록 진입 전용 스켈레톤 — /start에서 "깃발 꽂기" 클릭 시 force-dynamic 페이지
// (auth + 프로필 조회) 서버 왕복 동안 즉시 노출. 일정확정 게이트(뒤로+헤더+2카드)와
// 동일 골격이라 로딩 화면 정체감 없이 게이트로 매끄럽게 이어진다.
export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-20 animate-in fade-in duration-200">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* 뒤로 */}
        <div className="flex items-center gap-1 -ml-1 mb-6">
          <Skeleton className="w-5 h-5 rounded-md bg-card" />
          <Skeleton className="h-4 w-10 rounded bg-card" />
        </div>

        {/* 헤더 (일정이 확정됐나요?) */}
        <div className="mb-6">
          <Skeleton className="h-8 w-52 rounded-lg bg-card" />
        </div>

        {/* 좌우 2카드 */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`rounded-3xl border p-5 space-y-3 ${
                i === 1
                  ? "border-amber-500/40 bg-amber-500/[0.05]"
                  : "border-border bg-card/30"
              }`}
            >
              <Skeleton className="w-9 h-9 rounded-lg bg-muted" />
              <Skeleton className="h-5 w-16 bg-muted" />
              <Skeleton className="h-3 w-24 bg-muted/60" />
              <Skeleton className="h-10 w-full rounded-xl bg-muted !mt-6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
