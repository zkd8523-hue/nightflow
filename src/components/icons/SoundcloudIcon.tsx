/**
 * SoundCloud 아이콘 — 브랜드 로고(구름 + 파형 막대)
 *
 * lucide 의 Music(음표)으로 대체하고 있었는데, 그건 "음악"이라는 뜻일 뿐
 * 사운드클라우드라는 걸 알려주지 못한다. 유저는 로고 실루엣으로 서비스를
 * 알아보므로 브랜드 마크를 그대로 쓴다.
 *
 * 왼쪽 파형 막대 5개 + 오른쪽 구름 = 사운드클라우드의 고유 실루엣.
 * 막대 높이가 왼쪽으로 갈수록 낮아지는 것이 로고의 핵심 특징이라 유지한다.
 *
 * currentColor 를 쓰므로 text-orange-400 등으로 색을 준다
 * (WagleIcon 과 동일한 인터페이스 — props: className, size).
 */

interface SoundcloudIconProps {
  className?: string;
  size?: number | string;
}

export function SoundcloudIcon({ className, size = 24 }: SoundcloudIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* 파형 막대 — 왼쪽일수록 낮다 */}
      <rect x="1" y="12.5" width="1.4" height="5" rx="0.7" />
      <rect x="3.7" y="10.5" width="1.4" height="7" rx="0.7" />
      <rect x="6.4" y="9" width="1.4" height="8.5" rx="0.7" />
      <rect x="9.1" y="10" width="1.4" height="7.5" rx="0.7" />
      {/* 구름 — 오른쪽 덩어리 */}
      <path d="M12.2 7.6c.5-.36 1.1-.57 1.76-.57 1.62 0 2.95 1.26 3.06 2.85.3-.13.63-.2.98-.2 1.38 0 2.5 1.12 2.5 2.5s-1.12 2.5-2.5 2.5H12.2a.7.7 0 0 1-.7-.7V8.16c0-.22.1-.43.28-.56Z" />
    </svg>
  );
}
