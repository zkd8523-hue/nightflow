import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

/** 사이트 전체 공용 로딩 화면. 회색 블록 스켈레톤 대신 중앙 스피너 하나로
    통일한다 — 화면마다 카드 모양이 달라 스켈레톤을 매번 그려주면 실제
    레이아웃과 어긋나기 쉽고, 문구를 넣으면 화면마다 다르게 관리해야 해서
    번거롭다(2026-09-06 목업 검토, 3안 채택. 문구는 화면별로 갈리니 뺀다).
    최소 높이만 주고 나머지는 부모가 정한다. */
function LoadingSpinner({ className, minHeight = "40vh" }: { className?: string; minHeight?: string | number }) {
  return (
    <div
      role="status"
      aria-label="로딩 중"
      className={cn("flex items-center justify-center", className)}
      style={{ minHeight }}
    >
      <div className="w-11 h-11 rounded-full border-[3px] border-white/10 border-t-money animate-spin" />
    </div>
  )
}

export { Skeleton, LoadingSpinner }
