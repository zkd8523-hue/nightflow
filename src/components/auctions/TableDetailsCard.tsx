"use client";

import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

interface TableDetailsCardProps {
  includes: string[];
  notes?: string;
}

/**
 * 테이블 상세 정보 카드
 * - 주류 패키지와 테이블 구성 아이템을 분류하여 표시
 * - 참고 사항 표시
 */
export function TableDetailsCard({ includes, notes }: TableDetailsCardProps) {
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
    <Card className="bg-[#1C1C1E] border-neutral-800/50 p-6 space-y-6">
      <div className="space-y-5">
        {/* 주류 패키지 */}
        {liquorItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
              주류 패키지
            </h2>
            <div className="space-y-2">
              {liquorItems.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 border bg-amber-500/10 border-amber-500/30"
                >
                  <span className="text-[14px] font-bold text-amber-400">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 테이블 구성 */}
        {extraItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              테이블 구성
            </h2>
            <div className="flex flex-wrap gap-2">
              {extraItems.map((item) => (
                <Badge
                  key={item}
                  variant="secondary"
                  className="bg-neutral-900/50 text-neutral-400 border-neutral-800 px-3 py-1 font-bold text-[11px]"
                >
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 주류 변경 안내 */}
        {liquorItems.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <p className="text-[11px] text-amber-500 font-bold">
              주류 변경 안내
            </p>
            <p className="text-[10px] text-amber-500/80 mt-1">
              • 현장에서 동급 브랜드 변경 가능
            </p>
            <p className="text-[10px] text-amber-500/80">
              • 낙찰가 이하 환불 불가
            </p>
          </div>
        )}
      </div>

      {/* 참고 사항 */}
      {notes && (
        <div className="space-y-2 pt-2 border-t border-neutral-800/30">
          <p className="text-[11px] text-neutral-500 font-bold uppercase tracking-widest">
            참고 사항
          </p>
          <p className="text-[14px] text-neutral-400 font-medium leading-relaxed whitespace-pre-line">
            {notes}
          </p>
        </div>
      )}
    </Card>
  );
}
