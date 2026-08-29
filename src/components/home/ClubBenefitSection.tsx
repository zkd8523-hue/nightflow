import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Heart } from "lucide-react";
import { benefitLabel } from "@/lib/utils/hotdeal";
import type { ClubBenefitItem } from "@/lib/home/clubBenefitData";

/**
 * 데이터는 page.tsx(RSC)에서 SSR로 미리 가공해 props로 넘어온다 — 파티/클럽다이렉트와
 * 같은 최초 페인트에 함께 채워지도록(예전엔 클라이언트 useEffect라 hydration 이후에야
 * 채워져 화면 상단이 하단보다 늦게 뜨는 문제가 있었다). 가공 로직은
 * @/lib/home/clubBenefitData의 buildClubBenefitItems 참고.
 */
export function ClubBenefitSection({ items }: { items: ClubBenefitItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <Link href="/clubs?view=list" className="flex items-baseline justify-between px-1">
        <h2 className="text-[18px] font-black text-foreground flex items-center gap-1.5 tracking-tight">
          <span className="text-[18px]">🥂</span>
          오늘 어디갈래?
        </h2>
        <span className="text-[11px] text-muted-foreground hover:text-foreground font-bold inline-flex items-center gap-0.5">
          더보기
          <ChevronRight className="w-3 h-3" />
        </span>
      </Link>

      <div
        data-no-pull-refresh
        className="flex gap-2.5 overflow-x-auto scrollbar-hide snap-x snap-proximity touch-pan-x touch-pan-y pb-1 -ml-2 -mr-4 pr-4"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {items.map((item) => (
          <Link
            key={item.club_id}
            href={`/clubs/${item.club_id}`}
            className="flex-shrink-0 w-[44%] max-w-[180px] snap-start snap-always active:scale-[0.98] transition-transform"
          >
            {/* 혜택 띠 + 이미지를 하나의 테두리로 감싸 카드 경계를 명확히 함 (라이트에서 흰 로고가 배경과 붙어 보이는 문제 방지) */}
            <div className="rounded-md border border-border overflow-hidden">
              {/* 혜택 띠 (이미지 위 별도 영역).
                  MD가 문구를 안 쓰고 칩만 고른 경우도 있으므로, 텍스트가 없으면
                  칩 라벨을 이어붙여 띠를 만든다("무료입장 · 프리드링크"). */}
              {(() => {
                const bannerText =
                  item.benefit_text?.trim() ||
                  item.benefit_tags.slice(0, 2).map((t) => benefitLabel(t).label).join(" · ");
                if (!bannerText) return null;
                return (
                  <div className="bg-amber-500 px-2.5 pt-1.5 pb-1 border-b border-black/20">
                    <span
                      className="block whitespace-pre-line text-black text-[13px] tracking-tight text-center leading-[1.1] line-clamp-2"
                      style={{ fontFamily: "var(--font-display-kr)" }}
                    >
                      {bannerText}
                    </span>
                  </div>
                );
              })()}

              {/* 이미지 */}
              <div className="relative w-full aspect-[4/3] bg-card">
              {item.club_thumbnail ? (
                <Image
                  src={item.club_thumbnail}
                  alt={`${item.club_area ? `${item.club_area} ` : ""}${item.club_name} 클럽 사진`}
                  fill
                  sizes="180px"
                  className="object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[28px] font-black text-foreground/30">
                  {item.club_name.charAt(0)}
                </div>
              )}
              </div>
            </div>

            {/* 텍스트 */}
            <div className="mt-2 px-0.5 space-y-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-foreground font-bold text-[13px] truncate leading-tight min-w-0">
                  {item.club_name}
                </p>
                {item.fav_count > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-red-500 flex-shrink-0">
                    <Heart className="w-3 h-3 fill-red-500 stroke-none" />
                    {item.fav_count}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {item.club_area ?? "기타"}
              </p>
              {item.benefit_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.benefit_tags.slice(0, 3).map((tag) => {
                    const { label, emoji } = benefitLabel(tag);
                    return (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/30 text-[9px] font-black leading-none"
                      >
                        {emoji && <span>{emoji}</span>}
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
