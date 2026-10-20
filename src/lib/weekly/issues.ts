import type { WeeklyIssueCard } from "@/components/home/WeeklyNewsCarousel";

/**
 * "10월 첫째 주" — 호의 기간 표기.
 *
 * 날짜 범위(10.05 — 10.11)는 읽는 사람이 머릿속에서 달력을 한 번 그려야 한다.
 * 몇째 주인지가 바로 와닿는다.
 *
 * 세는 법은 그 주 월요일이 그 달 몇 번째 월요일인가다. 주가 달을 걸칠 때
 * 월요일이 속한 달을 그 주의 달로 본다(10/5 는 10월 첫 월요일 → 10월 첫째 주).
 */
/** 1~5 → 첫째/둘째/셋째/넷째/다섯째. 숫자+"째 주"는 글에서 어색하다. */
const NTH_KO = ["", "첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째"];
export function weekLabel(mondayISO: string): string {
  const monday = new Date(`${mondayISO}T12:00:00`);
  const month = monday.getMonth() + 1;

  // 그 달의 첫 월요일을 찾아 몇 주 떨어졌는지 센다
  const first = new Date(monday.getFullYear(), monday.getMonth(), 1, 12);
  while (first.getDay() !== 1) first.setDate(first.getDate() + 1);

  const nth = Math.round((monday.getTime() - first.getTime()) / 604800000) + 1;
  return `${month}월 ${NTH_KO[nth] ?? `${nth}째`} 주`;
}

/**
 * 발행한 주간 호 목록.
 *
 * DB 테이블로 안 만든 이유: 호는 매주 사람이 쓰는 글이고, 편집 중 버전이
 * 섞이면 안 된다. 코드에 두면 배포가 곧 발행이고, 되돌리기도 git 이면 된다.
 * 호가 수십 개로 늘거나 예약 발행이 필요해지면 그때 테이블로 옮긴다.
 *
 * 최신 호가 맨 앞이다(캐러셀이 받는 순서 그대로 그린다).
 */
export const WEEKLY_ISSUES: WeeklyIssueCard[] = [
  {
    slug: "2026-10-22",
    volume: "VOL.03",
    period: weekLabel("2026-10-19"),
    title: "칸예 · 스캇 앨범\n만든 DJ가 온다",
    // 표지는 이 호를 위해 그린 일러스트. 세로 그림을 16:9 로 자르면 주인공이
    // 통째로 날아가서(실측) 가로 구도로 따로 그렸다. 왼쪽을 비워 둔 건
    // 카드가 제목을 거기에 얹기 때문이다(2호와 같은 방식).
    // 그림 안에 제목을 박아 보기도 했는데, 호마다 카드 생김새가 달라져서 되돌렸다.
    // ⚠️ 그림을 고칠 때는 같은 파일명에 덮어쓰지 말고 새 이름(-v2, -v3)으로 올려라.
    //    URL 이 같으면 Next 이미지 캐시와 브라우저가 옛 그림을 계속 내보낸다.
    coverUrl: "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/weekly/2026-10-22/cover-v2.png",
    meta: "공연 9 · 금·토·일",
    // 발행 시각 — 이 값이 있어야 홈 카드에 24시간 NEW 리본이 붙는다.
    // ⚠️ 푸시 직전에 실제 배포 시각으로 다시 맞춰라(손으로 적는 값이라 쉽게 어긋난다).
    publishedAt: "2026-10-20T11:20:39Z",
  },
  {
    slug: "2026-10-15",
    volume: "VOL.02",
    period: weekLabel("2026-10-13"),
    title: "목요일 홍대 DMX Krew\n금요일 서면 BOBBY",
    // 표지는 BOBBY 포스터(@jeje_busan). 홈 카드에서 멈춰 세우는 힘이 이쪽이
    // 더 세다 — 포스터에 이름·날짜가 크게 박혀 있어 제목이 주어를 또 말할
    // 필요가 없다. 본문 안에서는 두 포스터를 각 섹션에 하나씩 쓴다.
    coverUrl:
      "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/weekly/2026-10-15/jeje.png",
    meta: "공연 2 · 홍대 · 부산 서면",
    // 발행 시각 — 이걸 넣은 호에만 24시간 동안 홈 카드에 NEW 리본이 붙는다
    publishedAt: "2026-10-12T13:20:00Z",
  },
  {
    slug: "2026-10-06",
    volume: "VOL.01",
    period: weekLabel("2026-10-05"),
    title: "스피커를 직접 만든\n남자가 온다",
    // 표지는 그 호의 주인공 클럽 사진을 쓴다 — 케이크샵(10/10 DILLINJA)
    coverUrl:
      "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/club-thumbnails/admin/0b95bc54-7c74-4098-90b8-52747240bde5/1782569186128.jpg",
    meta: "라인업 8 · DJ 40명 · 공연 8",
  },
];

/** 다음 호 예고 — 발행일(목) 전까지 캐러셀 끝에 세워 "매주 나온다"를 보여준다 */
export const UPCOMING_ISSUE: WeeklyIssueCard = {
  slug: "upcoming",
  volume: "준비 중",
  period: "",
  title: "다음 호는\n목요일 저녁에",
  coverUrl: null,
  meta: "매주 목요일 발행",
  upcoming: true,
};

export function getHomeWeeklyCards(): WeeklyIssueCard[] {
  return [...WEEKLY_ISSUES, UPCOMING_ISSUE];
}
