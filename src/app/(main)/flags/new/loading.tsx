import { Skeleton } from "@/components/ui/skeleton";

// 깃발 등록 진입 전용 스켈레톤 — force-dynamic 페이지(auth + 프로필 조회) 서버 왕복 동안 즉시 노출.
// 라우트 레벨이라 lang을 모른다 → 한국인(2카드 게이트)·외국인(1카드 여행 게이트) 어느 쪽으로
// 이어져도 튀지 않도록 "중립 단일 카드" 골격으로 통일(앰버·2카드 제거). 예전 한국형 2카드
// 골격은 외국인 진입 시 모양이 급변해 깜빡임이 심했음.
export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-20 animate-in fade-in duration-200">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* 뒤로 */}
        <div className="flex items-center gap-1 -ml-1 mb-6">
          <Skeleton className="w-5 h-5 rounded-md bg-card" />
          <Skeleton className="h-4 w-10 rounded bg-card" />
        </div>

        {/* 헤더 */}
        <div className="mb-6 space-y-2">
          <Skeleton className="h-7 w-52 rounded-lg bg-card" />
          <Skeleton className="h-4 w-40 rounded bg-card/60" />
        </div>

        {/* 단일 카드 (게이트/폼 공통 골격) */}
        <div className="rounded-3xl border border-border bg-card p-6 space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-4/5 bg-muted" />
            <Skeleton className="h-3 w-3/5 bg-muted/60" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-2xl bg-muted" />
            <Skeleton className="h-14 w-full rounded-2xl bg-muted/60" />
          </div>
        </div>
      </div>
    </div>
  );
}
