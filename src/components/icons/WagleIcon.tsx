/**
 * Wagle (와글) 아이콘 — GPS 핀 + 사운드 웨이브
 *
 * 컨셉: "지금 여기서 비트 치는 사람들"
 * - 외곽: 지도 위치 핀 (위치 인증)
 * - 내부: 이퀄라이저 막대 3개 (클럽 사운드/실시간성)
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
  strokeWidth = 2,
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
      {/* 핀 외곽 */}
      <path
        d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
      {/* 이퀄라이저 막대 3개 (핀 안쪽) — 가운데가 가장 길게 */}
      <g
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        // filled 상태에선 핀 색과 대비되도록 흰색
        style={filled ? { stroke: "#fff" } : undefined}
      >
        <line x1="9" y1="11.5" x2="9" y2="8.5" />
        <line x1="12" y1="12.5" x2="12" y2="6.5" />
        <line x1="15" y1="11.5" x2="15" y2="8.5" />
      </g>
    </svg>
  );
}
