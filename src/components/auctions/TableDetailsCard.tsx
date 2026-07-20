"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

interface TableDetailsCardProps {
  includes: string[];
  notes?: string;
  /** 테이블맵(플로어맵) 토글 영역. 테이블 구성 칩 아래에 삽입됨 */
  floorPlanSlot?: React.ReactNode;
  /** "테이블 구성" 제목 오버라이드 (예: MD 직통 조각의 클럽명) */
  titleOverride?: string;
  /** titleOverride 클릭 시 이동할 클럽 상세 링크 (MD 직통 조각용) */
  titleHref?: string;
}

/**
 * 테이블 상세 정보 카드
 * - 주류 패키지와 테이블 구성 아이템을 분류하여 표시
 * - 테이블맵(선택)
 * - 참고 사항 표시
 */
export function TableDetailsCard({ includes, notes, floorPlanSlot, titleOverride, titleHref }: TableDetailsCardProps) {
  const { liquorItems, extraItems } = useMemo(() => {
    const liquorKeywords = [
      "병",
      "샴페인",
      "보드카",
      "위스키",
      "와인",
      "럼",
      "데킬라",
      "진",
      "맥주",
      "소주",
      "하이볼",
      "논알콜",
    ];

    const liquor = includes.filter((item) =>
      liquorKeywords.some((kw) => item.includes(kw))
    );
    const extra = includes.filter(
      (item) => !liquorKeywords.some((kw) => item.includes(kw))
    );

    return { liquorItems: liquor, extraItems: extra };
  }, [includes]);

  return (
    <Card className="bg-card border-border/50 rounded-2xl px-4 py-3 space-y-2.5">
      <div className="space-y-2.5">
        {/* 테이블 구성 (주류 포함) */}
        {(includes.length > 0 || titleOverride) && (
          <div className="space-y-2.5">
            {titleOverride && titleHref ? (
              <Link href={titleHref} className="inline-flex items-center gap-1 group">
                <h2 className="text-[19px] font-black text-foreground tracking-tight group-hover:text-brand-amber transition-colors">{titleOverride}</h2>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            ) : (
              <h2 className="text-[19px] font-black text-foreground tracking-tight">{titleOverride || "테이블 구성"}</h2>
            )}
            {liquorItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5 w-full">
                {liquorItems.map((item) => (
                  <Badge
                    key={item}
                    variant="secondary"
                    className="bg-amber-500/10 text-brand-amber border-amber-500/30 px-2.5 py-1 font-bold text-[12px] whitespace-normal break-words h-auto"
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            )}
            {extraItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5 w-full">
                {extraItems.map((item) => (
                  <Badge
                    key={item}
                    variant="secondary"
                    className="bg-card/50 text-muted-foreground border-border px-2.5 py-1 font-bold text-[12px] whitespace-normal break-words h-auto"
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 테이블맵 토글 */}
        {floorPlanSlot && (
          <div className="pt-2.5 border-t border-border/30">{floorPlanSlot}</div>
        )}
      </div>

      {/* 참고 사항 */}
      {notes && (
        <div className="space-y-1.5 pt-3 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">
            참고 사항
          </p>
          <p className="text-[14px] text-muted-foreground font-medium leading-relaxed whitespace-pre-line">
            {notes}
          </p>
        </div>
      )}
    </Card>
  );
}
