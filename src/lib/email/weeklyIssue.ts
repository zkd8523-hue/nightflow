// 아티클 한 호를 이메일 한 통으로 만든다.
//
// 왜 웹 컴포넌트를 재사용하지 않나:
// src/components/weekly/Issue20261022.tsx 는 Next.js <Image>, Web Audio 플레이어,
// iframe, Tailwind 클래스로 되어 있다. 메일 클라이언트는 외부 CSS·iframe·스크립트를
// 전부 막는다. 렌더해서 HTML 로 뽑아도 클래스만 남고 스타일이 사라진다.
// 그래서 같은 원고를 "메일용으로 다시 조판한" 한 벌을 따로 둔다.
// 원고가 바뀌면 두 곳을 같이 손봐야 한다 — 호마다 한 번 쓰고 끝나는 글이라
// 공통화보다 각자 읽기 쉬운 쪽을 택했다.
//
// 작성 규칙(newsletterWelcome.ts 와 같다, 다만 더 엄격하다):
//   - table 레이아웃만. flex / grid / position 금지
//   - 스타일은 전부 인라인 style= . <style> 블록은 지메일에서 잘린다
//   - 웹폰트 금지(시스템 폰트 스택)
//   - 본문 폭 600px 고정
//   - iframe / video / audio / script 금지 → 링크로 대체
//   - 배경을 어둡게 깔지 않는다. 지메일·네이버 다크모드가 색을 뒤집어도
//     흰 배경 + 검정 글씨는 "검정 배경 + 흰 글씨"가 되어 그대로 읽힌다.
//     반대로 검정 배경을 깔면 뒤집혔을 때 흰 배경 + 흰 글씨가 되는 조합이 생긴다.
//   - 이미지가 차단된 상태(지메일 기본값인 계정도 있다)에서도 뜻이 통해야 한다 →
//     날짜·장소·가격은 전부 본문 텍스트에 있고 이미지 안에만 있는 정보는 없다.

const INK = "#111111"; // 본문
const SUB = "#5B5B5B"; // 보조 — 흰 배경에서 4.5:1 이상
const LINE = "#E2E0DB";
const PAGE = "#F5F4F1"; // 바깥 여백
const CARD = "#FFFFFF";

/** 아티클 본문과 같은 요일 색. Issue20261022.tsx 의 ACCENT 를 그대로 옮긴 값이다. */
const ACCENT = {
  fri: "#9FC3DC",
  sat: "#E8894A",
  sun: "#A98BD9",
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/* ── 조판 조각 ───────────────────────────────────────────── */

/** 600px 폭 안에 들어가는 전폭 이미지. width 속성과 style 을 둘 다 준다(아웃룩). */
function img(src: string, alt: string): string {
  return `<img src="${src}" alt="${esc(alt)}" width="100%" style="width:100%;max-width:600px;height:auto;display:block;border:0;outline:none;text-decoration:none;" />`;
}

/** 요일 머리 — 색 띠. 띠 안의 글자는 어두운 색이라 다크모드에서 뒤집혀도 읽힌다. */
function dayHead(label: string, meta: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>
<td style="background:${color};padding:11px 16px;font-family:${FONT};">
<span style="font-size:17px;font-weight:900;color:#0A0A0A;letter-spacing:-0.3px;">${esc(label)}</span>
<span style="font-size:12px;font-weight:700;color:#1C1C1E;padding-left:8px;">${esc(meta)}</span>
</td></tr></table>`;
}

/** 날짜·장소·가격 표. 2열 테이블이다 — dl 은 메일 클라이언트마다 여백이 다르다. */
function facts(rows: [string, string][]): string {
  const body = rows
    .map(
      ([k, v]) => `<tr>
<td width="58" valign="top" style="padding:8px 10px 8px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:12px;color:${SUB};white-space:nowrap;">${esc(k)}</td>
<td valign="top" style="padding:8px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:1.55;color:${INK};">${esc(v)}</td>
</tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;border-top:1px solid ${LINE};">${body}</table>`;
}

function para(text: string, size = 15): string {
  return `<p style="margin:0 0 12px;font-family:${FONT};font-size:${size}px;line-height:1.75;color:${INK};">${text}</p>`;
}

/**
 * 커버가 아닌 여덟 곳. 제목 + 한 줄 + 정보표.
 * 본문과 같은 구조다 — 아홉 개를 같은 분량으로 쓰면 아홉 개가 다 안 읽힌다.
 */
function pick(o: {
  name: string;
  meta: string;
  color: string;
  lead: string;
  rows: [string, string][];
  note?: string;
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;"><tr><td style="font-family:${FONT};">
<p style="margin:0 0 4px;font-size:19px;line-height:1.35;font-weight:900;color:${INK};letter-spacing:-0.4px;">${esc(o.name)}</p>
<p style="margin:0 0 10px;font-size:12px;font-weight:700;color:${INK};">
<span style="background:${o.color};padding:2px 7px;color:#0A0A0A;">${esc(o.meta)}</span>
</p>
${para(o.lead)}
${facts(o.rows)}
${o.note ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${SUB};">${esc(o.note)}</p>` : ""}
</td></tr></table>`;
}

/* ── 호 ─────────────────────────────────────────────────── */

export interface WeeklyEmailIssue {
  slug: string;
  volume: string;
  /** 받은편지함 제목. 호를 특정할 수 있어야 한다 — 같은 제목이 반복되면 묶여버린다. */
  subject: string;
  /** 제목 아래 미리보기 한 줄. 넣지 않으면 메일 클라이언트가 본문 첫 글자를 끌어온다. */
  preheader: string;
  /** 웹 원문. "웹에서 보기" / "전문 읽기" 두 자리에 쓴다. */
  webUrl: string;
  html: (opts: { unsubscribeUrl: string }) => string;
}

const B =
  "https://ihqztsakxczzsxfvdkpq.supabase.co/storage/v1/object/public/auction-images/weekly/2026-10-22";
const WEB_URL_03 = "https://nightflow.kr/weekly/2026-10-22";

/**
 * 보일러룸 영상은 메일에 못 박는다(iframe 차단). 유튜브 썸네일 + 링크로 바꾼다.
 * hqdefault 는 4:3 이라 위아래에 검은 띠가 생긴다 — maxresdefault 가 16:9 원본이다.
 * (이 영상은 maxres 가 실제로 올라와 있는 걸 확인했다. 없는 영상에 쓰면 404 로 깨진다.)
 */
const BOILER_ROOM_ID = "5DmCnR7r8B0";
const BOILER_ROOM_THUMB = `https://i.ytimg.com/vi/${BOILER_ROOM_ID}/maxresdefault.jpg`;

function vol03Html({ unsubscribeUrl }: { unsubscribeUrl: string }): string {
  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>아티클 VOL.03</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%;">

<!-- 미리보기 한 줄. 화면에는 안 보이고 받은편지함 목록에만 뜬다 -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">금 이태원 2 · 홍대 1 / 토 홍대 · 이태원 · 강남 / 일 중구 · 홍대 · 을지로. 아홉 곳.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};">
<tr><td align="center" style="padding:20px 10px 32px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

<!-- ── 상단 ──────────────────────────────────────────── -->
<tr><td style="padding:0 0 12px;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="font-family:${FONT};">
<span style="font-size:17px;font-weight:900;color:${INK};letter-spacing:-0.5px;">NightFlow</span>
<span style="font-size:12px;color:${SUB};padding-left:8px;">주말 어디 갈지, 매주 목요일에</span>
</td>
<td valign="middle" align="right" style="font-family:${FONT};white-space:nowrap;">
<a href="${WEB_URL_03}" style="font-size:12px;font-weight:700;color:${INK};text-decoration:underline;">웹에서 보기</a>
</td>
</tr></table>
</td></tr>

<tr><td style="background:${CARD};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

<!-- ── 제목 블록 ───────────────────────────────────── -->
<tr><td style="padding:28px 24px 20px;font-family:${FONT};">
<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.4px;color:${SUB};">26.10.22 (목) &nbsp;VOL.03</p>
<h1 style="margin:0 0 12px;font-size:28px;line-height:1.28;font-weight:900;color:${INK};letter-spacing:-0.9px;">칸예 · 스캇 앨범 만든<br>DJ가 온다</h1>
<p style="margin:0;font-size:12px;color:${SUB};">from. 나이트플로우</p>
</td></tr>

<!-- ── 오프닝 아트 ─────────────────────────────────── -->
<tr><td style="padding:0;">
${img(
    `${B}/art_ig_4x5.png`,
    "칸예 웨스트와 트래비스 스캇을 뒤에 두고 디제잉하는 Evian Christ 일러스트 — 칸예·스캇 앨범 만든 DJ가 온다"
  )}
</td></tr>
<tr><td style="padding:8px 24px 0;font-family:${FONT};font-size:11px;color:${SUB};">
일러스트 · 나이트플로우
</td></tr>

<!-- ── 리드 ────────────────────────────────────────── -->
<tr><td style="padding:22px 24px 4px;font-family:${FONT};">
${para(
    "칸예 웨스트 <strong style=\"font-weight:900\">『Yeezus』</strong>를 같이 만든 프로듀서가 트랜스를 들고 이태원에 온다. 금요일 케이크샵이다.",
    16
  )}
${para(
    "그 밖에 우루과이 테크노, 네덜란드와 조지아 듀오, 뉴욕 부커, 도쿄 라멘 레이브, 20주년을 채운 메탈 밴드가 같은 사흘에 걸려 있다. 금토일 아홉 곳을 하루 세 곳씩 끊어 정리했다."
  )}
</td></tr>

<!-- ── 금요일 ──────────────────────────────────────── -->
<tr><td style="padding:24px 24px 0;font-family:${FONT};">
${dayHead("금요일", "10.23 · 이태원 2 · 홍대 1", ACCENT.fri)}

<!-- 커버 — 여기만 길게 간다 -->
<p style="margin:0 0 4px;font-size:23px;line-height:1.32;font-weight:900;color:${INK};letter-spacing:-0.6px;">Evian Christ in 이태원</p>
<p style="margin:0 0 14px;font-size:12px;font-weight:700;color:${INK};">
<span style="background:${ACCENT.fri};padding:2px 7px;color:#0A0A0A;">케이크샵 · 커버</span>
</p>
</td></tr>

<tr><td style="padding:0;">
${img(`${B}/evianchrist.jpg`, "10월 23일 금요일 케이크샵 Evian Christ 공연 포스터")}
</td></tr>
<tr><td style="padding:8px 24px 0;font-family:${FONT};font-size:11px;color:${SUB};">
10.23 케이크샵 공연 포스터 · @cakeshopseoul
</td></tr>

<tr><td style="padding:18px 24px 0;font-family:${FONT};">
${para(
    "조슈아 리어리. 영국 엘즈미어포트 출신이다. Warp Records 소속이고, 칸예 웨스트의 레이블 Donda와 소니 ATV에도 이름이 올라 있다."
  )}
${para(
    "이름을 알린 건 프로듀서로서다. 칸예 웨스트 『Yeezus』의 <strong style=\"font-weight:900\">&lsquo;I&rsquo;m In It&rsquo;</strong>을 공동 프로듀싱했고, 트래비스 스콧의 빌보드 1위 앨범에도 참여했다. 대니 브라운 작업도 있다."
  )}
${para(
    "그다음이 이상하다. 힙합 최전선에 있던 사람이 2013년 <strong style=\"font-weight:900\">TranceParty</strong>라는 클럽 나이트를 직접 차렸다. 트랜스다. 2000년대 초에 한 번 유행하고 조롱거리로 밀려났던 그 장르다."
  )}
${para(
    "2023년 Warp에서 낸 데뷔 앨범 『Revanchist』가 그 답이다. 여덟 곡으로 트랜스가 환희 너머의 숭고까지 갈 수 있는지를 밀어붙인 앨범이다. 제목을 직역하면 &lsquo;복수주의자&rsquo;다."
  )}
${facts([
    ["날짜", "10월 23일 (금)"],
    ["위치", "케이크샵 · 서울 용산구 이태원로 134"],
    ["가격", "자정 전 25,000원 / 자정 후 30,000원 (도어)"],
    ["라인업", "Evian Christ · Winter Back · Simo · Paola Laf · Tabris · Moon Go America · Audiogothh"],
  ])}
<p style="margin:10px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${SUB};">인스타 공지 기준이다. 가기 전에 확인할 것.</p>
</td></tr>

<!-- 보일러룸 — iframe 을 못 쓴다. 썸네일 + 링크로 보낸다 -->
<tr><td style="padding:22px 24px 0;font-family:${FONT};">
<p style="margin:0 0 10px;font-size:15px;font-weight:900;color:${INK};">본인이 차린 파티를 보일러룸이 찍었다</p>
<a href="https://www.youtube.com/watch?v=${BOILER_ROOM_ID}" style="text-decoration:none;">
<img src="${BOILER_ROOM_THUMB}" alt="Evian Christ | Boiler Room London: TranceParty — 유튜브로 보기 (1시간)" width="100%" style="width:100%;max-width:552px;height:auto;display:block;border:1px solid ${LINE};" />
</a>
<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${SUB};">
Boiler Room London: TranceParty · 한 시간짜리다 ·
<a href="https://www.youtube.com/watch?v=${BOILER_ROOM_ID}" style="color:${INK};font-weight:700;text-decoration:underline;">유튜브에서 보기</a>
</p>
</td></tr>

<!-- 리듬 플레이어 — 메일에는 소리를 넣을 수 없다. 웹 원문으로 보낸다 -->
<tr><td style="padding:18px 24px 0;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};"><tr><td style="padding:16px;font-family:${FONT};">
<p style="margin:0 0 6px;font-size:14px;font-weight:900;color:${INK};">트랜스와 테크노의 차이</p>
<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:${INK};">
둘 다 킥은 정박 네 번으로 같다. 다른 건 킥과 킥 사이다. 트랜스는 그 자리에 베이스를 한 번씩 밀어 넣어 계속 끌어올리고, 테크노는 비워 둔다. 같은 138 BPM인데 체감 속도가 다른 이유다.
</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${SUB};">
메일에는 소리를 넣을 수 없다. 한 마디씩 번갈아 들어보는 건 웹 원문에 있다 ·
<a href="${WEB_URL_03}#fri" style="color:${INK};font-weight:700;text-decoration:underline;">직접 들어보기</a>
</p>
</td></tr></table>
</td></tr>

<tr><td style="padding:26px 24px 0;font-family:${FONT};">
${pick({
    name: "Elias Sternin in 이태원",
    meta: "헤르츠 · 우루과이",
    color: ACCENT.fri,
    lead:
      "우루과이 몬테비데오를 대표하는 클럽 <strong style=\"font-weight:900\">Phonotheque</strong>의 레지던트다. 런던 Fold, 베를린 Club Der Visionaere를 돌았고 레이블 둘을 직접 굴린다. 본 세트가 새벽 2시부터 5시다 — 케이크샵에서 넘어오려면 그쪽이 먼저 끝나야 한다.",
    rows: [
      ["날짜", "10월 23일 (금) 밤 — 러닝오더 00:00 — 07:00"],
      ["위치", "헤르츠 · 서울 용산구 이태원동 126-1 1F"],
      ["가격", "예매 20,000원 (RA) / 도어 25,000원"],
      ["순서", "00:00 RAILROADMAN · 02:00 Elias Sternin (3시간) · 05:00 Jucid B2B Chani"],
    ],
    note: "클럽 공지에 요일이 'Sat'으로 적혀 있다. 날짜(10.23)를 기준으로 옮겼다.",
  })}

${pick({
    name: "PGMNT in 홍대",
    meta: "헨즈클럽 · 라이브 2팀 + DJ 7명",
    color: ACCENT.fri,
    lead:
      "금요일 셋 중 유일하게 이태원이 아니다. 파티 이름 PGMNT는 안료(pigment)다. 물에 녹는 염료와 달리 안료는 녹지 않는다는 게 주최 측이 내건 컨셉이다. 라이브 두 팀이 붙어서 DJ만 도는 밤과는 다르다.",
    rows: [
      ["날짜", "10월 23일 (금) · 오픈 밤 10시"],
      ["위치", "헨즈클럽 · 마포구 상수동 86-22 B1"],
      ["가격", "20,000원 (프리드링크 1잔)"],
      ["라이브", "a 9uy · ODEE"],
      ["DJ", "Baekho · CHANXER · Hanmandogi · KIHU · KWAKSEUNGEON · QUAN · SIM"],
    ],
    note: "미성년자 출입 금지. 현장 사진·영상 촬영이 있다.",
  })}
</td></tr>

<!-- ── 토요일 ──────────────────────────────────────── -->
<tr><td style="padding:10px 24px 0;font-family:${FONT};">
${dayHead("토요일", "10.24 · 홍대 1 · 이태원 1 · 강남 1", ACCENT.sat)}
<p style="margin:0 0 4px;font-size:19px;line-height:1.35;font-weight:900;color:${INK};letter-spacing:-0.4px;">IMMEDIATE PROXIMITY in 홍대</p>
<p style="margin:0 0 12px;font-size:12px;font-weight:700;color:${INK};">
<span style="background:${ACCENT.sat};padding:2px 7px;color:#0A0A0A;">vurt. · 네덜란드 + 조지아</span>
</p>
</td></tr>

<tr><td style="padding:0;">
${img(`${B}/vurt.jpg`, "10월 24일 토요일 vurt. Delta Funktionen & Napirelly 공연 포스터")}
</td></tr>
<tr><td style="padding:8px 24px 0;font-family:${FONT};font-size:11px;color:${SUB};">
vurtnight with Delta Funktionen &amp; Napirelly · @vurt_seoul
</td></tr>

<tr><td style="padding:16px 24px 0;font-family:${FONT};">
${para(
    "둘이 온다. <strong style=\"font-weight:900\">Delta Funktionen</strong>은 암스테르담 출신 딥테크노 프로듀서이고 지금은 베를린 트레조어 레지던트다. <strong style=\"font-weight:900\">Napirelly</strong>는 시베리아에 뿌리를 둔 조지아 출신이다. 2019년부터 IMMEDIATE PROXIMITY라는 듀오로 묶여 일렉트로·테크노·베이스·브레이크가 만나는 자리를 파 왔다."
  )}
${para(
    "이 밤의 핵심은 길이다. 새벽 1시부터 6시까지 다섯 시간, 따로 또 같이 돈다. 한 곡 듣고 나올 세트가 아니다."
  )}
${facts([
    ["날짜", "10월 24일 (토) 밤 11시 — 아침 8시"],
    ["위치", "vurt. · 서울 마포구 양화로6길 57 B1"],
    ["가격", "25,000원 (도어 / RA) · 새벽 4시 이후 10,000원"],
    ["순서", "23:00 Jama · 01:00 Delta Funktionen + Napirelly · 06:00 SJK"],
  ])}
</td></tr>

<tr><td style="padding:26px 24px 0;font-family:${FONT};">
${pick({
    name: "JADALAREIGN in 이태원",
    meta: "로쏘 · 뉴욕",
    color: ACCENT.sat,
    lead:
      "뉴욕에서 온다. 브루클린 클럽 Nowadays의 <strong style=\"font-weight:900\">금요일 라인업을 짜는 부커</strong>다. 누구를 세울지 고르는 사람이 직접 트는 밤이다. 재즈·소울·펑크·디스코에서 하우스와 테크노까지 끌고 간다.",
    rows: [
      ["날짜", "10월 24일 (토)"],
      ["위치", "로쏘 · 서울 용산구 대사관로31길 17 B1"],
      ["가격", "20,000원 (프리드링크 1잔)"],
      ["라인업", "JADALAREIGN · SERA · GIO · Youngisland · cityboyfromseoul"],
    ],
    note: "미성년자 출입 금지. 테이블은 @rosso_seoul DM.",
  })}

${pick({
    name: "BOTL in 강남",
    meta: "루카 · 하드테크노",
    color: ACCENT.sat,
    lead:
      "인더스트리얼 질감에 때리는 퍼커션, 거기에 우울이 얹힌 하드테크노다. 정작 눈에 띄는 건 <strong style=\"font-weight:900\">티켓이 여섯 단계</strong>라는 점이다. 슈퍼얼리버드 15,000원(공지 기준 거의 매진)부터 자정 이후 도어 38,000원까지, 가장 싼 표와 가장 비싼 표가 2.5배 차이다. 갈 거면 지금 끊는 게 싸다. 취향 문제가 아니라 산수다.",
    rows: [
      ["날짜", "10월 24일 (토) 밤 11시 — 아침 7시"],
      ["위치", "루카 · 서울 강남구 강남대로152길 46 B1"],
      ["가격", "15,000 / 20,000 / 26,000 / 30,000 / 35,000 / 38,000원"],
      ["라인업", "BOTL (Egg London · Hostile Takeover)"],
    ],
    note: "미성년자 출입 금지. 입장 시 신분증.",
  })}
</td></tr>

<!-- ── 일요일 ──────────────────────────────────────── -->
<tr><td style="padding:10px 24px 0;font-family:${FONT};">
${dayHead("일요일", "10.25 · 중구 · 홍대 · 을지로", ACCENT.sun)}
<p style="margin:0 0 4px;font-size:19px;line-height:1.35;font-weight:900;color:${INK};letter-spacing:-0.4px;">Tamanaramen in 축제</p>
<p style="margin:0 0 12px;font-size:12px;font-weight:700;color:${INK};">
<span style="background:${ACCENT.sun};padding:2px 7px;color:#0A0A0A;">중구 · 도쿄 + 런던</span>
</p>
</td></tr>

<tr><td style="padding:0;">
${img(`${B}/tamana.jpg`, "10월 25일 일요일 축제 Tamanaramen 공연 포스터")}
</td></tr>
<tr><td style="padding:8px 24px 0;font-family:${FONT};font-size:11px;color:${SUB};">
10.25 축제 공연 포스터 · @c_bong_sae
</td></tr>

<tr><td style="padding:16px 24px 0;font-family:${FONT};">
${para(
    "자매다. 언니 하나(Hana)가 비주얼, 동생 피캄(Pikam)이 보컬과 프로듀싱을 맡는다. 도쿄와 런던을 오가며 활동한다."
  )}
${para(
    "팀 이름은 동생이 고등학생 때 일본어 자판을 아무렇게나 두드려 나온 글자다. 그걸 그대로 쓰고 있다. 이름 따라 도쿄에서는 실제로 라멘을 먹으며 노는 &lsquo;Ramen Rave&rsquo;라는 파티도 굴린다. 음악은 오타쿠 문화에서 끌어온 앰비언트 팝, IDM, 테크노, 트랩, 베이스가 섞인다."
  )}
${facts([
    ["날짜", "10월 25일 (일) 저녁 7시 30분"],
    ["위치", "축제 · 서울 중구 수표로6길 10"],
    ["가격", "빠른예매 15,000원 / 늦은현매 20,000원"],
    ["라인업", "Tamanaramen · kirin & jinnin (라이브) · PEN:KEY · BBBT · DDD"],
  ])}
<p style="margin:10px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${SUB};">현장 인원에 따라 현매가 제한될 수 있다.</p>
</td></tr>

<tr><td style="padding:26px 24px 0;font-family:${FONT};">
${pick({
    name: "METHOD 20주년 in 홍대",
    meta: "롤링홀 · 메탈",
    color: ACCENT.sun,
    lead:
      "메써드가 20년을 채웠다. 클럽이 아니라 공연장이고, 시작도 저녁 6시다. 이날 밤을 어디서 시작할지 정하는 데 영향을 준다.",
    rows: [
      ["날짜", "10월 25일 (일) 저녁 6시"],
      ["위치", "롤링홀 · 홍대"],
      ["출연", "메써드(METHOD) · KILLKAISER"],
      ["예매", "멜론티켓"],
    ],
  })}

${pick({
    name: "Fake Product vol.5 in 을지로",
    meta: "신도시 별관 · 실험",
    color: ACCENT.sun,
    lead:
      "일요일 셋 중 제일 비싸고 제일 좁다. 세 팀이 순서대로 하고 사이사이 10분씩 쉰다. 춤추러 가는 자리가 아니라 보러 가는 자리다.",
    rows: [
      ["날짜", "10월 25일 (일) 저녁 6시"],
      ["위치", "신도시 별관 · 서울 중구 을지로11길 31 4층"],
      ["가격", "예매 30,000원 / 현매 35,000원"],
      ["출연", "stego · NokENok · Hellivision"],
    ],
    note: "순서마다 인터미션 10분이 들어간다.",
  })}
</td></tr>

<!-- ── 다음 호 + 전문 읽기 ─────────────────────────── -->
<tr><td style="padding:6px 24px 0;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${INK};"><tr><td style="padding:14px 0 0;font-family:${FONT};">
<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.2px;color:${SUB};">다음 호</p>
${para("다음 주는 핼러윈이다. 아직 공지를 안 올린 곳이 많아 다음 호에서 몰아 정리한다.")}
</td></tr></table>
</td></tr>

<tr><td align="center" style="padding:14px 24px 32px;font-family:${FONT};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${INK};">
<a href="${WEB_URL_03}" style="display:inline-block;padding:16px 36px;font-family:${FONT};font-size:15px;font-weight:900;color:#FFFFFF;text-decoration:none;">전문 읽기 →</a>
</td>
</tr></table>
<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${SUB};">
포스터 전부, 라인업별 미리듣기, 요일 바로가기는 웹 원문에 있다.
</p>
</td></tr>

</table>
</td></tr>

<!-- ── 푸터 ────────────────────────────────────────── -->
<tr><td style="padding:20px 6px 0;font-family:${FONT};">
<p style="margin:0 0 10px;font-size:11px;line-height:1.9;color:${SUB};">
출처 — 공연 정보: @cakeshopseoul · @hertz.sound · @thehenzclub · @vurt_seoul · @rosso_seoul · @luka.seoul · @c_bong_sae · 롤링홀 · @bandnokenok 공지 원문<br>
인물: Warp Records · Mixmag · Resident Advisor · DJ Mag · Delsin<br>
라인업·요금: 나이트플로우 DB
</p>
<p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:${SUB};">
나이트플로우 · 인스타그램
<a href="https://www.instagram.com/nightflow.kr/" style="color:${INK};font-weight:700;text-decoration:underline;">@nightflow.kr</a><br>
제보·광고 문의 <a href="mailto:maddawids@gmail.com" style="color:${INK};text-decoration:underline;">maddawids@gmail.com</a>
</p>
<p style="margin:0 0 8px;font-size:11px;line-height:1.7;color:${SUB};">
NightFlow 구독 폼에서 광고성 정보 수신에 동의하셔서 보내드립니다.
</p>
<p style="margin:0;font-size:11px;line-height:1.7;color:${SUB};">
더 이상 받고 싶지 않으시면 <a href="${unsubscribeUrl}" style="color:${INK};font-weight:700;text-decoration:underline;">수신거부</a>를 눌러주세요.
한 번 누르면 바로 처리되고 다시 확인하지 않습니다.
</p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/**
 * 메일로 보낼 수 있는 호 목록.
 *
 * WEEKLY_ISSUES(src/lib/weekly/issues.ts)와 따로 두는 이유: 저쪽은 "웹에 올라간 호"고
 * 이쪽은 "메일 조판이 끝난 호"다. 웹에 먼저 올리고 메일은 나중에 보내는 순서라
 * 두 목록이 항상 같을 수 없다. 발송 라우트는 이 목록만 본다 — 조판되지 않은 호를
 * 실수로 발송 대상으로 고를 수 없게 하려는 것이다.
 */
export const WEEKLY_EMAIL_ISSUES: WeeklyEmailIssue[] = [
  {
    slug: "2026-10-22",
    volume: "VOL.03",
    // 제목에 호 번호를 넣는다. 안 넣으면 지메일이 지난 호와 한 스레드로 묶는다.
    subject: "[VOL.03] 칸예 · 스캇 앨범 만든 DJ가 온다 — 금토일 아홉 곳",
    preheader: "금 이태원 2 · 홍대 1 / 토 홍대 · 이태원 · 강남 / 일 중구 · 홍대 · 을지로",
    webUrl: WEB_URL_03,
    html: vol03Html,
  },
];

export function getWeeklyEmailIssue(slug: string): WeeklyEmailIssue | undefined {
  return WEEKLY_EMAIL_ISSUES.find((i) => i.slug === slug);
}
