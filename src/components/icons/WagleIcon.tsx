/**
 * Wagle (와글/OPEN) 아이콘 — 겹친 말풍선 2개
 *
 * 컨셉: "여러 명이 동시에 떠드는 열린 방"
 * - 뒤쪽 말풍선 + 앞쪽 말풍선이 겹친 형태
 *
 * 개수로 구분하는 이유: 하단 네비에 '채팅'(MessageCircle) 탭이 함께 노출된다.
 * 채팅=말풍선 1개(1:1 닫힌 대화) / OPEN=말풍선 2개(열린 광장).
 * 20px에서도 실루엣 개수 차이는 남으므로 형태 대비보다 안전하다.
 *
 * lucide-react 아이콘 패턴과 동일한 인터페이스 — props: className, size
 */

interface WagleIconProps {
  className?: string;
  size?: number | string;
  /** "off" 상태(채워지지 않은 라인 스타일) / "on" 상태(채워진 활성) */
  filled?: boolean;
  strokeWidth?: number;
}

export function WagleIcon({
  className,
  size = 24,
  filled = false,
  strokeWidth = 1.9,
}: WagleIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* 앞쪽 말풍선 — 뒤쪽과 겹치는 부분을 가려야 두 장으로 읽힌다.
          filled=false 여도 배경색이 아닌 currentColor 대비가 필요하므로
          앞 풍선을 먼저 그리지 않고, 뒤 풍선을 그린 뒤 앞 풍선이 덮는 순서로 둔다. */}
      {/* 뒤쪽 말풍선 (우상단) */}
      <path
        d="M9.6 6.5V5.4a1.6 1.6 0 0 1 1.6-1.6h6.2A1.6 1.6 0 0 1 19 5.4v9.9l-3.2-2.9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {/* 앞쪽 말풍선 (좌하단) — 겹침 표현을 위해 내부를 배경색으로 채운다 */}
      <path
        d="M15.5 13.5a1.6 1.6 0 0 1-1.6 1.6H8.2L5 18V8.1a1.6 1.6 0 0 1 1.6-1.6h7.3a1.6 1.6 0 0 1 1.6 1.6z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "var(--background, #0A0A0A)"}
      />
    </svg>
  );
}
