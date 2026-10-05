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
