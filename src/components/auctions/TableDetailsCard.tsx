"use client";

import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface TableDetailsCardProps {
  includes: string[];
  notes?: string;
}

const DRINK_CATEGORY_STYLES = {
  champagne: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  spirit: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  extra: { bg: "bg-neutral-800/50", text: "text-neutral-300", border: "border-neutral-700" },
};

function getLiquorCategory(item: string) {
  if (item.includes("샴페인")) return "champagne";
  if (["보드카", "위스키", "럼", "데킬라", "진"].some(kw => item.includes(kw))) return "spirit";
  return "extra";
}

/**
 * 테이블 상세 정보 카드
 * - 주류 패키지와 테이블 구성 아이템을 분류하여 표시
 * - 참고 사항 표시
 */
export function TableDetailsCard({ includes, notes }: TableDetailsCardProps) {
  return (
    <Card className="bg-[#1C1C1E] border-neutral-800/50 p-6 space-y-6">
      <div className="space-y-5">
        {/* 테이블 구성 (주류 포함) */}
        {includes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-[18px] font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-500" />
              테이블 구성
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {includes.map((item) => {
                const category = getLiquorCategory(item);
                const style = DRINK_CATEGORY_STYLES[category] || DRINK_CATEGORY_STYLES.extra;
                
                return (
                  <Badge
                    key={item}
                    variant="secondary"
                    className={cn(
                      "px-5 py-2.5 font-bold text-[15px] border transition-colors",
                      style.bg,
                      style.text,
                      style.border
                    )}
                  >
                    {item}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* 주류 변경 안내 */}
        {(includes || []).some(item => getLiquorCategory(item) !== 'extra') && (
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
            <p className="text-[13px] text-orange-500 font-bold mb-2">
              주류 변경 안내
            </p>
            <div className="space-y-1">
              <p className="text-[12px] text-orange-500/70 flex items-start gap-1.5">
                <span className="mt-1 w-1 h-1 rounded-full bg-orange-500/50 shrink-0" />
                현장에서 동급 브랜드 변경 가능
              </p>
              <p className="text-[12px] text-orange-500/70 flex items-start gap-1.5">
                <span className="mt-1 w-1 h-1 rounded-full bg-orange-500/50 shrink-0" />
                낙찰가 이하 환불 불가
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 참고 사항 */}
      {notes && (
        <div className="space-y-3 pt-6 border-t border-neutral-800/50">
          <p className="text-[12px] text-neutral-500 font-bold uppercase tracking-[0.1em]">
            참고 사항
          </p>
          <p className="text-[15px] text-neutral-300 font-medium leading-relaxed whitespace-pre-line">
            {notes}
          </p>
        </div>
      )}
    </Card>
  );
}
