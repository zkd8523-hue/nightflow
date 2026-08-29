/**
 * khhcalendar 등 외부 공개 정보로 확인한 공연을 club_events 에 수동 입력한다.
 *
 * 왜 수동인가:
 *   khhcalendar.com 은 JS 렌더링이라 fetch 로는 격자가 비어서 온다(실측).
 *   그래서 달력 스크린샷으로 목록을 잡고, 각 공연을 개별 웹검색으로 교차 확인한
 *   뒤 확정된 것만 넣는다.
 *
 * ⚠️ 원칙: 날짜·장소가 출처로 확인되지 않은 공연은 넣지 않는다.
 *   추측으로 채우면 테이블 전체 신뢰도가 무너진다. 확인 안 된 것은 아래
 *   UNVERIFIED 에 근거와 함께 남겨 다음 사람이 이어받게 한다.
 *
 * source_post_id 규약:
 *   UNIQUE(source_post_id, club_name_raw, event_date) 를 타므로 수동분은
 *   인스타 게시물 ID 가 없다. "manual:<slug>:<date>" 로 고유값을 만든다.
 *   자동 수집분과 절대 겹치지 않는다(자동분은 전부 숫자 ID).
 *
 * 사용: DRY_RUN=1 node scripts/import-khhcalendar-manual.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";

const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SOURCE = "khhcalendar_manual";

// 날짜·장소가 외부 출처로 확인된 것만. note 는 확인 근거다.
const EVENTS = [
  {
    slug: "madly-medley-2026",
    dates: ["2026-09-05", "2026-09-06"],
    title: "MADLY MEDLEY 2026",
    venue: "문화비축기지",
    area: "서울",
    lineup: ["나플라", "쿠기", "씨잼", "블랙넛", "AKMU", "몬스타엑스", "더로즈"],
    note: "다음뉴스·NOL티켓·라이브닷 교차확인. 9/5~9/6 마포 문화비축기지",
  },
  {
    slug: "sumin-dinnermode",
    dates: ["2026-09-18", "2026-09-19", "2026-09-20"],
    title: "2026 SUMIN LIVE 〈dinnermode〉",
    venue: "LG아트센터 서울 U+ 스테이지",
    area: "서울",
    lineup: ["SUMIN"],
    note: "khhcalendar 팝업 스크린샷(장소·18:00) + 웹검색 교차확인",
  },
  {
    slug: "jt2de-welcome-to-my-home",
    dates: ["2026-09-19", "2026-09-20"],
    title: "JT2DE: Welcome to My HOME",
    venue: "명화라이브홀",
    area: "서울",
    lineup: ["저스디스"],
    note: "khhcalendar 팝업 + X 나눔공지(19-20/9 @명화라이브홀) 교차확인. 투매홈 10주년",
  },
  {
    slug: "gangwon-red-frys-2026",
    dates: ["2026-10-24"],
    title: "강원 RED FRYS 2026",
    venue: "강릉 경포해변 중앙광장",
    area: "강원",
    lineup: ["다이나믹듀오", "마이노스", "허클베리피", "범키", "그리"],
    note: "톱스타뉴스·환경감시일보·엑스포뉴스 교차확인. 주최 FRONTROW",
  },
  {
    slug: "hypnosis-therapy-sync-next-26",
    dates: ["2026-09-04", "2026-09-05"],
    title: "HYPNOSIS THERAPY on Sync Next 26",
    venue: "세종S씨어터",
    area: "서울",
    lineup: ["HYPNOSIS THERAPY"],
    note: "khhcalendar 팝업(세종문화회관 21:00) + 서울문화투데이. 싱크넥스트26 폐막작",
  },
  {
    slug: "daegu-hiphop-festival-2026",
    dates: ["2026-12-25", "2026-12-26"],
    title: "2026 대구힙합페스티벌",
    venue: null, // 장소 미공개 — 주최측이 "추후 공개"라고 명시
    area: "대구",
    lineup: [],
    note: "Threads @korea.real.hiphop 주최측 공지로 날짜만 확정. 장소·라인업 미공개",
  },
];

// ⚠️ 연도 없는 일정표 함정 (2026-08-30 실측)
//
// 힙합플레이야 "9월/10월 국내 공연 일정" 캐러셀을 넣으려다 걸렀다. 표에는
// [9/21-22] 처럼 월·일만 있고 연도가 없다. 그대로 읽으면 전부 올해로 보인다.
//
// 실제로는 2024년 게시물이었다. 교차검색에서 날짜가 2024년 실제 공연과
// 완전히 일치해 드러났다:
//   빈지노 NOWITZKI LIVE  [9/21-22]  → 2024-09-21~22 워커힐 빛의 시어터
//   2NE1 WELCOME BACK     [10/4-6]   → 2024-10-04~06 올림픽홀
//   현대카드 다빈치모텔    [9/27-29]  → 2024-09-27~29 이태원
// 결정타는 랩비트였다. 표에는 [9/21-22]인데 2026년 랩비트는 6/20-21이다.
//
// 규칙: 연도가 안 적힌 일정표는 반드시 공연 2~3건을 교차검색해 연도를 못박고
// 나서 쓴다. 날짜가 과거 연도와 정확히 겹치면 옛 게시물을 의심한다.

// 확인 못 한 것 — 넣지 않는다. 다음 사람이 이어받을 목록.
const UNVERIFIED = [
  "10-04 Paloalto 단독공연 — 티켓처 검색 무소득, 장소 불명",
  "10-16~17 제8회 블랙뮤직페스티벌 — 2026 회차 정보 미공개(2025 제7회만 검색됨)",
  "11-13~15 CHANGMO : MON… — 제목 잘림, 11월 공연 검색 무소득",
  "09-04 HIPHOPPLAYA SHOW Vol.63 — Vol.61(7/10)까지만 확인, 63회차 미확인",
  "09-19 CROSS THE NIGHT @무신사 개러지 — 스크린샷 외 교차출처 없음",
  "09-19 Problems Vol.1 @신촌 허니클로버 — 스크린샷 외 교차출처 없음",
  "09-05 Valorant Sound Busan @부산 스페이스 원지 — 스크린샷 외 교차출처 없음",
  "09-02 반타01 / 09-03 milli vs the world / 09-06 JAEHA·VINYL ON TRACK /",
  "09-07 MAINSTREAM / 09-09 Dogma / 10-03 새천년 — 장소 미확인(월 격자엔 장소 없음)",
];

let inserted = 0, skipped = 0;

for (const ev of EVENTS) {
  for (const date of ev.dates) {
    const clubNameRaw = ev.venue ?? "(미상)";
    const postId = `manual:${ev.slug}:${date}`;

    // 같은 날짜·장소가 이미 있으면 건너뛴다(자동 수집분과의 충돌 방지).
    const { data: dup } = await sb
      .from("club_events")
      .select("id,title,source_account")
      .eq("event_date", date)
      .eq("club_name_raw", clubNameRaw)
      .maybeSingle();
    if (dup) {
      console.log(`  건너뜀 ${date} ${ev.title} — 이미 있음(${dup.source_account})`);
      skipped++;
      continue;
    }

    const payload = {
      club_id: null,
      club_name_raw: clubNameRaw,
      venue_area: ev.area,
      event_date: date,
      title: ev.title,
      lineup: ev.lineup,
      source_account: SOURCE,
      source_post_id: postId,
      source_url: null,
      raw_caption: `[수동 입력] ${ev.note}`,
      status: "approved",
    };

    if (DRY_RUN) {
      console.log(`  [DRY] ${date} | ${ev.title} | ${clubNameRaw} | 출연 ${ev.lineup.length}명`);
      inserted++;
      continue;
    }

    const { error } = await sb.from("club_events").insert(payload);
    if (error) {
      console.error(`  실패 ${date} ${ev.title}: ${error.message}`);
      continue;
    }
    console.log(`  입력 ${date} | ${ev.title} | ${clubNameRaw}`);
    inserted++;
  }
}

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}입력 ${inserted}건 / 건너뜀 ${skipped}건`);
console.log(`\n확인 못 해 넣지 않은 것 ${UNVERIFIED.length}줄:`);
for (const u of UNVERIFIED) console.log(`  - ${u}`);
