/**
 * 안읽음 개수 꺼내기 — Migration 484 이전 RPC(unread_count 없음)에서도
 * 최소 1개로 표시되도록 boolean unread로 폴백한다.
 */
export function unreadCountOf(row: { unread?: boolean; unread_count?: number }): number {
  if (typeof row.unread_count === "number") return row.unread_count;
  return row.unread ? 1 : 0;
}

/**
 * 카톡식 안읽음 개수 뱃지 (빨간 원 + 숫자).
 * 나의 채팅 목록/탭, 하단 네비 "채팅" 아이콘에서 공용으로 사용.
 * count가 0 이하면 아무것도 렌더하지 않는다.
 */
export function UnreadBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black leading-none tabular-nums ${className}`}
    >
      {count > 999 ? "999+" : count}
    </span>
  );
}
