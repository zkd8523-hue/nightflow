import { Skeleton } from "@/components/ui/skeleton";

// 깃발 상세 전용 스켈레톤 — 등록 직후 router.push 전환 동안 즉시 노출되어
// 빈 화면 정체감을 없앤다. 실제 상세 레이아웃(헤더·날짜·깃발 카드·시크릿오퍼)과 동일 골격.
export default function Loading() {
  return (
    <div className="min-h-screen bg-background animate-in fade-in duration-300">
      <div className="container mx-auto max-w-lg px-4 py-6 space-y-6">
        {/* 상단 헤더 (뒤로가기 · 제목 · 상태칩) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-6 h-6 rounded-md bg-card" />
            <Skeleton className="h-6 w-24 rounded-lg bg-card" />
          </div>
          <Skeleton className="h-7 w-24 rounded-full bg-card" />
        </div>

        {/* 날짜 + D-day */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-40 rounded-lg bg-card" />
          <Skeleton className="h-6 w-12 rounded-full bg-card/60" />
        </div>

        {/* 깃발 카드 */}
        <div className="bg-card border border-border/50 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-24 rounded-full bg-card" />
            <Skeleton className="w-6 h-6 rounded-md bg-card" />
          </div>
          <Skeleton className="h-6 w-32 bg-card" />
          <Skeleton className="h-4 w-48 bg-card/50" />
          <Skeleton className="h-9 w-56 bg-card" />
          <Skeleton className="h-4 w-28 bg-card/50" />
        </div>

        {/* 시크릿오퍼 헤더 */}
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-6 w-32 bg-card" />
          <Skeleton className="h-4 w-20 bg-card/50" />
        </div>

        {/* 액션 버튼 2개 */}
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-2xl bg-card" />
          <Skeleton className="h-14 w-full rounded-2xl bg-card/60" />
        </div>
      </div>
    </div>
  );
}
