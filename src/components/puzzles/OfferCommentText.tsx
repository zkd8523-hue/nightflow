"use client";

import { useTranslatedComment } from "@/hooks/useTranslatedComment";
import { type Lang } from "@/lib/i18n";

// 오퍼 comment 표시. 외국인이면 번역(useTranslatedComment), 아니면 원문.
// map() 안에서 훅을 쓸 수 없으므로 오퍼마다 이 컴포넌트로 분리해 렌더.
export function OfferCommentText({
  comment,
  lang = "ko",
  className = "text-[12px] text-neutral-400 italic",
}: {
  comment: string;
  lang?: Lang;
  className?: string;
}) {
  const isForeigner = lang !== "ko";
  const en = useTranslatedComment(comment, isForeigner, lang);
  const shown = isForeigner ? (en ?? comment) : comment;
  return <p className={className}>&ldquo;{shown}&rdquo;</p>;
}
