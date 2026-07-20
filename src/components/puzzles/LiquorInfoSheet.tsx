"use client";

import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getLiquorCategory, formatPriceBucket } from "@/lib/utils/format";
import type { LiquorProduct } from "@/types/database";

const CATEGORY_LABEL: Record<string, string> = {
  champagne: "샴페인",
  vodka: "보드카",
  whisky: "위스키",
  tequila: "데킬라",
  cognac: "꼬냑",
  wine: "와인",
  rum: "럼",
  gin: "진",
  etc: "주류",
  extra: "주류",
};

interface LiquorInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 매칭된 구조화 데이터 — 없으면 이미지 없이 이름/카테고리만 표시 */
  product: LiquorProduct | null;
  /** 매칭 실패 시 이름으로 쓸 원본 텍스트 */
  includeText: string;
}

export function LiquorInfoSheet({ open, onOpenChange, product, includeText }: LiquorInfoSheetProps) {
  const category = getLiquorCategory(includeText);
  const priceBucket = product ? formatPriceBucket(product.price_min, product.price_max) : null;

  // 확인된 실제 상품 이미지가 없으면 카테고리 폴백 없이 그냥 빈 상태로 둔다 (틀린 사진 노출 방지)
  const imageUrl = product?.image_url || null;
  const name = product?.name || includeText;
  const description = product?.description || null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* z-[210]: 풀스크린 비교창(z-200) 위에서도 뜨도록 */}
      <SheetContent side="bottom" className="z-[210] bg-card border-border rounded-t-3xl pb-10">
        <SheetHeader>
          <SheetTitle className="sr-only">주류 정보</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center gap-3 pt-2">
          {imageUrl ? (
            <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-card">
              <Image src={imageUrl} alt={name} fill className="object-cover" sizes="112px" />
            </div>
          ) : (
            <div className="w-28 h-28 rounded-2xl bg-card flex items-center justify-center text-3xl">
              🍾
            </div>
          )}

          <div className="text-center space-y-1.5">
            <p className="text-[17px] font-black text-foreground">{name}</p>
            {!product && (
              <p className="text-[12px] text-muted-foreground">{CATEGORY_LABEL[category] ?? "주류"}</p>
            )}

            {(product?.origin || product?.abv) && (
              <div className="flex items-center justify-center gap-1.5 pt-0.5">
                {product?.origin && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-foreground/80">
                    {product.origin}
                  </span>
                )}
                {product?.abv != null && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-foreground/80">
                    도수 {product.abv}%
                  </span>
                )}
              </div>
            )}

            {description && (
              <p className="text-[13px] text-muted-foreground pt-1">{description}</p>
            )}
          </div>

          {product?.accolade && (
            <p className="text-[12px] text-brand-amber dark:text-brand-amber/90 italic text-center px-2">
              &ldquo;{product.accolade}&rdquo;
            </p>
          )}

          {priceBucket && (
            <span className="text-[13px] font-bold px-3 py-1.5 rounded-full bg-amber-500/15 text-brand-amber border border-amber-500/30">
              시세 {priceBucket}
            </span>
          )}

          {!product && (
            <p className="text-[11px] text-muted-foreground">가격 정보 준비 중이에요</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
