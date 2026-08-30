"use client";

import { ThumbsUp } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLineupLikes, type LikeTarget } from "@/hooks/useLineupLikes";
import { hypeTier, hypeButtonClass, hypeIconClass } from "@/lib/lineups/hypeTier";

/**
 * 좋아요 버튼 — 라인업(Migration 596)과 공연(Migration 597) 공용.
 *
 * 누르는 곳은 상세(제목 옆)뿐이다. 목록 카드는 0건이면 아예 안 그리는 읽기 전용 신호만 둔다
 * (회색 불이 카드마다 줄지어 있으면 커뮤니티가 아니라 빈 서비스처럼 보인다).
 *
 * 누적 수가 임계값(10/30/50/100)을 넘으면 버튼이 단계적으로 달아오른다 — hypeTier 참조.
 * 상세 페이지가 서버 컴포넌트라 이 조각만 클라이언트로 분리했다.
 */
export function LineupLikeButton({
  lineupId,
  target = "lineup",
}: {
  lineupId: string;
  target?: LikeTarget;
}) {
  const { user } = useCurrentUser();
  const { getLike, toggleLike } = useLineupLikes([lineupId], user?.id, target);
  const like = getLike(lineupId);
  const tier = hypeTier(like.count);
  /* "좋아요"만 두면 클럽을 찜하는 것으로 읽힌다 — 무엇이 좋다는 건지 밝힌다.
     공연(target="event")은 라인업이 아니라 그 공연 자체가 대상이다. */
  const label = target === "event" ? "공연이 좋아요" : "라인업이 좋아요";

  return (
    <button
      type="button"
      onClick={() => toggleLike(lineupId)}
      aria-pressed={like.likedByMe}
      // 보이는 글자는 숫자뿐이라 스크린리더가 맥락 없이 숫자만 읽는다 — 라벨로 보완
      aria-label={`${label} ${like.count}${like.likedByMe ? " (취소)" : ""}`}
      className={`inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full border font-black text-[13px] transition-all active:scale-95 ${hypeButtonClass(
        tier,
        like.likedByMe
      )}`}
    >
      <ThumbsUp
        className={`w-4 h-4 ${hypeIconClass(tier, like.likedByMe)}`}
        aria-hidden="true"
      />
      {/* 라벨은 항상 고정하고 숫자만 뒤에 붙인다 — 0일 때 "좋아요", 1건부터 숫자로
          바뀌던 예전 방식은 로딩 전후로 글자가 통째로 교체돼 새로고침마다 깜빡였다.
          숫자만 남으면 그게 무슨 수인지도 알 수 없다. */}
      <span>{label}</span>
      {like.count > 0 && (
        <span className="tabular-nums">{like.count}</span>
      )}
    </button>
  );
}
