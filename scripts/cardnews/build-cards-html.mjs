#!/usr/bin/env node
// fetch-today-lineup.mjs가 뽑은 JSON을 받아 인스타 피드용(1080x1350, 4:5) 카드
// 세트 HTML을 만든다. 카드 1장 = 클럽 1곳(미리듣기 가능한 셋만).
//
// 실행: node scripts/cardnews/build-cards-html.mjs < today-lineup.json > cards.html
//
// 카드 장수 = 표지 1장 + 클럽 수만큼(최대 8클럽, 넘으면 조회수 순 아니라 그냥 앞에서 자름 —
// 선별 기준은 fetch 단계의 "미리듣기 유무"뿐, 인기순 큐레이션은 하지 않는다).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf-8"));
const { date, clubs, area } = input; // area는 선택 — 있으면 지역편(예: "홍대")으로 표지 문구가 바뀐다

// 발행 회차 카운터 — 카드 세트를 한 번 만들 때마다 1씩 올린다.
//
// 처음엔 훅 문구를 날짜(dayOfYear)로 골랐는데, 그러면 같은 날 여러 지역편
// (강남·이태원…)을 만들 때 셋 다 똑같은 문구가 나온다(사용자 지적,
// 2026-09-03: "근데 지금 왜 벌써 같은 텍스트가 반복되냐고" → "회차별로
// 돌려라"). 그래서 날짜가 아니라 "몇 번째로 만든 카드뉴스인지"를 세서
// 그 값으로 훅을 고른다 — 같은 날 3개 지역을 뽑아도 각각 다른 문구가 된다.
const __dirname = dirname(fileURLToPath(import.meta.url));
const COUNTER_PATH = resolve(__dirname, "../../.cardnews-edition-counter");

function nextEditionNo() {
  let n = 0;
  try {
    if (existsSync(COUNTER_PATH)) n = parseInt(readFileSync(COUNTER_PATH, "utf-8").trim(), 10) || 0;
  } catch {
    n = 0;
  }
  n += 1;
  try {
    writeFileSync(COUNTER_PATH, String(n));
  } catch {
    // 카운터 파일을 못 써도 카드 생성 자체는 계속돼야 한다(권한 문제 등).
  }
  return n;
}
const editionNo = nextEditionNo();

const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(date + "T12:00:00+09:00").getDay()];
const dateLabel = `${date.slice(5, 7)}.${date.slice(8, 10)} (${weekday})`;
// "오늘밤"은 카드를 만든 날(발행일)과 실제 라인업 날짜가 같을 때만 맞는 말이다.
// 이 스킬은 주말치를 며칠 전에 미리 만들어두는 용도로도 쓰이므로("금요일 걸
// 수요일에 미리 만든다"), 발행 시점과 무관하게 항상 맞는 "{요일}요일 밤"으로
// 고정한다 — "오늘밤"을 하드코딩하면 발행일과 게시일이 다를 때 거짓말이 된다.
const nightLabel = `${weekday}요일 밤`;

const BG = "#0A0A0A";
const CARD = "#1C1C1E";
const AMBER = "#FBBF24";

function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 표지 헤드라인은 매일 하나로 고정하지 않고 3가지 후킹 타입을 돌아가며 쓴다
// (사용자 요청: "돌아가면서"). 결론형 문장("오늘 밤 어디서 놀까")은 스크롤을
// 멈추게 하는 힘이 약하다 — 손실회피/궁금증/타겟명시 세 갈래로 로테이션한다.
// 로테이션 기준은 연중 일수(day of year) % 3 — 실행 시각과 무관하게
// 같은 날엔 항상 같은 헤드라인이 나오게 날짜에서 결정론적으로 뽑는다.
function dayOfYear(dateStr) {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}

// 핵심 단어를 앰버로 강조 — 헤드라인 안에서 스크롤을 멈추게 하는 진짜 훅은
// 문장 전체가 아니라 단어 하나("후회함", "필독" 등)다. 그 단어만 색과
// 굵기를 살려서 눈이 먼저 거기로 가게 한다.
function hi(word) {
  return `<span class="cover-highlight-word">${word}</span>`;
}

// 타이틀에 시각 위계를 준다(사용자 확정, 2026-09-03 — 3줄이 전부 같은 크기라
// 어디가 핵심인지 눈이 헤맨다는 지적). 강조 단어(hi())가 들어간 줄만 크게
// 키우고 나머지는 작게 둔다.
//
// ⚠️ "마지막 줄을 크게" 같은 고정 규칙은 못 쓴다 — COVER_TITLES 40종은
// 강조 단어 위치가 제각각(첫 줄·중간·마지막)이라서다. 그래서 줄을 <br/>로
// 쪼갠 뒤 cover-highlight-word가 실제로 들어있는 줄을 찾아 표시한다.
function layoutTitle(titleHtml) {
  return titleHtml
    .split("<br/>")
    .map((line) => {
      const isAccent = line.includes("cover-highlight-word");
      return `<span class="t-line${isAccent ? " t-accent" : ""}">${line}</span>`;
    })
    .join("");
}

// 서브텍스트 = 날짜/요일 재반복(상단 날짜·하이라이트 배지와 겹침, 사용자
// 지적으로 제거) 대신 클럽명을 보여줘 "이 안에 이런 곳들이 있다"는 기대감을
// 준다. 클럽이 많으면 다 나열하지 않고 앞 2곳 + "외 N곳"으로 자른다.
//
// ⚠️ 클럽명만 나열하고 끝내면 정보이지 훅이 아니다(사용자 지적, 2026-09-03:
// "아 진짜 개구리네... 훅을 넣어야 할 거 아니야" — "3곳 총 15명" 같은
// 데이터 사실 나열도 마찬가지로 반려됨: "그딴거 말고 판매문구를 쓰라고,
// 사람 홀리는 호기심 쓰는 훅 문구"). 데이터로 뒷받침되는 사실(좋아요 수·
// 팔로워 수는 발행 시점에 항상 0이라 애초에 후보에서 제외, 동시출연
// 겹침도 5편 중 2편에만 있어 매번 못 씀)이 아니라, 마케팅 카피의 4대
// 심리 법칙(FOMO·사회적증거·손실회피·소수특권 — 희소성은 "한정 수량/시간"
// 전제라 항상 판매 중인 클럽 라인업 성격과 안 맞아 사용자가 제외시킴)에서
// 실제로 통용되는 표현을 웹 리서치해 각 25개씩 100개로 변형해뒀다
// (CLUB_TEASER_HOOKS, 2026-09-03). 숫자·%·"○명이 좋아요"류는 전부 배제 —
// 발행 시점엔 항상 근거가 없어 거짓말이 되기 때문. 표지 타이틀 3종
// (손실회피/궁금증/타겟명시) 로테이션과는 독립적으로, 날짜 기준으로
// 100개를 따로 순환한다 — 매번 다른 훅이 나오게 하려는 것이지, 타이틀
// 타입과 1:1로 엄밀히 짝지을 필요는 없다고 판단함(사용자 확정).
const CLUB_TEASER_HOOKS = [
  // FOMO — 나만 안 가면 뒤처진다
  "다들 골라놨는데 나만 아직", "친구들 단톡방에 이미 도는 곳들", "다들 어디 갈지 정한 눈치던데",
  "나만 모르고 있었던 그 라인업", "언제까지 고민만 하실 건가요", "다른 사람들은 이미 정했음",
  "혼자만 아직 못 정한 사람 여기", "이 얘기, 이미 다들 들었을 텐데", "나만 뒤처지는 이번 주 트렌드",
  "벌써 정한 사람 많던데", "다들 아는데 왜 나만 몰랐지", "지금 놓치면 이번 주는 그냥 넘어감",
  "오늘 얘기 못 들은 사람 여기", "알 사람은 이미 다 아는 곳", "남들 다 가는데 왜 고민만",
  "이거 모르면 대화에 낄 수가 없음", "다음날 후기 보면 부러워질 각", "소문난 곳들, 안 궁금하면 다행",
  "아직도 고민 중이면 늦음", "벌써 계획 세운 사람 수두룩", "검색하면 이미 다 나오는 곳들",
  "나만 빼고 다 아는 분위기", "오늘 밤 얘기, 안 궁금하세요", "다들 저장부터 하고 시작함",
  "이 리스트, 안 보면 손해 보는 대화",
  // 사회적 증거 — 숫자 없이 "많이들 찾는다"는 톤만
  "다녀본 사람들이 알아서 찾아가는 곳", "물어보면 다들 여기부터 말함", "후기 남기는 사람 많은 곳들",
  "검색해보면 알 만한 곳들", "입소문 난 곳들만 모아봤음", "재방문하는 사람들이 많은 곳",
  "클럽 좀 다녀본 사람은 아는 곳", "물어물어 찾아가는 그 곳들", "인스타 태그 많이 달리는 곳",
  "단골 많은 곳들로만 골랐음", "후기가 곧 광고인 곳들", "아는 사람 통해 알게 되는 곳",
  "리뷰 찾아보면 나오는 이유 있음", "소문이 소문을 만드는 곳들", "이미 검증된 밤을 보내는 방법",
  "갔다 온 사람 말이 다 비슷함", "커뮤니티에서 계속 언급되는 곳", "매번 이름이 오르내리는 곳들",
  "후기 좋은 데만 골라봤음", "한 번 가면 또 찾게 되는 곳", "오늘도 어김없이 붐빌 예정",
  "물어보면 다 여기 얘기함", "클럽 좀 안다는 사람들 픽", "다녀온 사람들 표정이 다 좋았음",
  "리스트에 오를 만한 이유 있음",
  // 손실 회피 — 안 가면 손해
  "안 가면 다음주 후회할 라인업", "놓치면 그냥 평범한 하루", "이거 모르고 가면 후회함",
  "지나가면 그걸로 끝인 밤", "오늘 안 보면 다음은 기약 없음", "이 조합, 다시 안 올 수도 있음",
  "안 가본 사람만 손해 보는 밤", "놓치면 남 얘기만 듣게 됨", "확인 안 하면 오늘 밤 날림",
  "몰랐다는 말이 제일 아까운 밤", "안 보고 넘기면 아쉬울 라인업", "이 밤을 그냥 흘려보낼 건가요",
  "나중에 알면 더 아쉬운 정보", "지금 안 보면 그대로 지나감", "이거 놓치면 딱히 할 얘기 없음",
  "확인 안 하고 넘어가면 손해", "이 순간 지나면 못 돌아옴", "몰랐다고 하기엔 아쉬운 밤",
  "안 가본 사람만 아는 아쉬움", "이 라인업, 오늘이 마지막 기회", "넘기면 남는 건 후회뿐",
  "봤는데 안 가면 그게 더 아쉬움", "지금 안 넘기면 다음이 없음", "이 밤, 그냥 보내긴 아까움",
  "오늘 놓치면 다음주까지 기다림",
  // 소수 특권 — 아는 사람만 아는
  "아는 사람만 가는 오늘의 리스트", "아무나 못 보는 오늘의 라인업", "골라서 가는 사람만 아는 곳들",
  "아무한테나 안 알려주는 곳", "진짜 아는 사람들만 가는 밤", "초보는 모르는 오늘의 선택지",
  "물어봐야 알려주는 곳들", "클럽 좀 안다는 사람들의 선택", "여기 아는 사람, 몇 없음",
  "조용히 도는 인사이더 정보", "아무나 오는 곳은 아님", "알아야 갈 수 있는 곳들",
  "검색만으론 안 나오는 정보", "이 리스트 아는 사람 드묾", "오늘 이 조합 아는 사람만",
  "인싸들만 아는 오늘의 동선", "진짜들만 아는 오늘의 라인업", "아무 데나 안 가는 사람들의 픽",
  "이 밤을 아는 소수의 리스트", "알음알음 퍼지는 오늘의 정보", "몰라서 못 가는 사람이 더 많음",
  "취향 확실한 사람들만의 선택", "여기까지 온 사람만 보는 리스트", "아는 사람 사이에서만 도는 얘기",
  "클럽 좀 아는 티가 나는 선택",
];
// 문구 배열은 4대 법칙(FOMO→사회적증거→손실회피→소수특권)이 블록으로 뭉쳐
// 있어서, 회차를 1씩 더하며 순서대로 뽑으면 연속 발행분이 전부 같은 법칙에
// 몰린다(실측: 회차 1~4가 죄다 FOMO). 배열 길이와 서로소인 수를 곱해
// 건너뛰면 매 회차 다른 법칙 블록으로 넘어가면서도 결국 전체를 한 번씩
// 다 훑는다(모듈러 산술). 100과 서로소인 37, 40과 서로소인 17을 쓴다.
const TEASER_STEP = 37;
const TITLE_STEP = 17;

function clubTeaser(clubList) {
  const names = clubList.map((c) => c.club_name);
  const list = names.length <= 2 ? names.join(" · ") : `${names.slice(0, 2).join(" · ")} 외 ${names.length - 2}곳`;
  const hook = CLUB_TEASER_HOOKS[(editionNo * TEASER_STEP) % CLUB_TEASER_HOOKS.length];
  return `${list} — ${hook}`;
}

// ⚠️ 표지 하단의 "넘겨서 보기" 안내 문구는 제거했다(사용자 확정, 2026-09-03).
// 인스타 캐러셀은 점 인디케이터와 화살표가 이미 넘김을 알려주므로 안내가
// 군더더기였고, 하단을 비워야 히어로 사진이 바닥까지 시원하게 깔린다.
// 다시 넣고 싶으면 coverCard()에 .cover-footer 블록을 되살리면 된다.

// 표지 타이틀 — 처음엔 3종(손실회피/궁금증/타겟명시)뿐이라 금방 반복됐다.
// 서브텍스트 훅(100개)과 같은 4대 심리법칙(FOMO·사회적증거·손실회피·
// 소수특권)으로 40개까지 늘리고, 회차 기준으로 돌린다(사용자 요청,
// 2026-09-03: "아까 배운거 기반으로 이것도 더 강화가능한가").
//
// 각 항목은 함수다 — 지역명(areaPrefix)·요일(nightLabel)을 문장 안 자연스러운
// 자리에 끼워 넣어야 하고, 강조 단어(hi())의 위치도 문구마다 다르기 때문.
// ⚠️ 3줄(<br/> 2개) 이내로 끊어야 카드 밖으로 안 넘친다. 요일을 쓸 땐 반드시
// nightLabel을 참조할 것 — "금요일"처럼 하드코딩하면 다른 요일에 거짓말이 된다.
const COVER_TITLES = [
  // FOMO — 나만 뒤처진다
  (a, n) => `${a}다들 정했는데<br/>${hi("나만")} 아직이면<br/>여기 보세요`,
  (a, n) => `${a}이미 다 아는데<br/>${hi("혼자만")} 모르는<br/>오늘 라인업`,
  (a, n) => `${a}단톡방에<br/>이미 도는<br/>${hi("그 리스트")}`,
  (a, n) => `${n}<br/>${a}다들 어디 가는지<br/>${hi("아세요")}`,
  (a, n) => `${a}남들 다 정할 때<br/>${hi("고민만")} 하는<br/>사람들에게`,
  (a, n) => `${a}이거 모르면<br/>내일 대화에<br/>${hi("못 낀다")}`,
  (a, n) => `${a}알 사람은<br/>${hi("이미 다")} 아는<br/>오늘의 리스트`,
  (a, n) => `${n}<br/>${a}${hi("나만 빼고")}<br/>다 아는 분위기`,
  (a, n) => `${a}벌써 계획<br/>세운 사람만<br/>${hi("수두룩")}`,
  (a, n) => `${a}지금 안 보면<br/>이번 주는<br/>${hi("그냥 넘어감")}`,
  // 사회적 증거 — 다들 찾는다
  (a, n) => `${a}물어보면<br/>${hi("다 여기")}<br/>얘기하는 이유`,
  (a, n) => `${a}${hi("입소문")} 난 곳만<br/>모아봤습니다`,
  (a, n) => `${a}다녀본 사람들이<br/>${hi("알아서")} 찾아가는<br/>곳들`,
  (a, n) => `${a}한 번 가면<br/>${hi("또 찾게")} 되는<br/>곳들만`,
  (a, n) => `${a}${hi("후기")} 좋은 데만<br/>골라봤어요`,
  (a, n) => `${n}<br/>${a}${hi("붐빌 예정")}인<br/>곳들 정리`,
  (a, n) => `${a}커뮤니티에서<br/>${hi("계속")} 언급되는<br/>그 곳들`,
  (a, n) => `${a}단골 많은 곳만<br/>${hi("추렸습니다")}`,
  (a, n) => `${a}클럽 좀 다녀본<br/>사람들의 ${hi("픽")}`,
  (a, n) => `${a}이름이 계속<br/>${hi("오르내리는")}<br/>곳들`,
  // 손실 회피 — 안 보면 손해
  (a, n) => `${a}이거 모르고 가면<br/>${n} ${hi("후회함")}`,
  (a, n) => `${a}안 보고 넘기면<br/>${hi("아쉬울")} 라인업`,
  (a, n) => `${n}<br/>${a}그냥 보내기엔<br/>${hi("아까움")}`,
  (a, n) => `${a}놓치면<br/>남 얘기만<br/>${hi("듣게 됨")}`,
  (a, n) => `${a}몰랐다는 말이<br/>제일 ${hi("아까운")} 밤`,
  (a, n) => `${a}확인 안 하면<br/>${n} ${hi("날림")}`,
  (a, n) => `${a}지금 안 보면<br/>${hi("그대로")} 지나감`,
  (a, n) => `${a}이 조합<br/>${hi("다시")} 안 올 수도<br/>있습니다`,
  (a, n) => `${a}안 가본 사람만<br/>${hi("손해")} 보는 밤`,
  (a, n) => `${a}넘기면<br/>남는 건<br/>${hi("후회")}뿐`,
  // 소수 특권 — 아는 사람만
  (a, n) => `${a}어디 갈지<br/>아직 못 정한<br/>사람 ${hi("필독")}`,
  (a, n) => `${n}<br/>${a}${hi("진짜")} 노는 곳은<br/>따로 있다`,
  (a, n) => `${a}${hi("아는 사람만")}<br/>가는<br/>오늘의 리스트`,
  (a, n) => `${a}아무한테나<br/>${hi("안 알려주는")}<br/>곳들`,
  (a, n) => `${a}검색만으론<br/>${hi("안 나오는")}<br/>정보`,
  (a, n) => `${a}취향 확실한<br/>사람들만의<br/>${hi("선택")}`,
  (a, n) => `${a}클럽 좀 아는<br/>${hi("티가 나는")}<br/>선택`,
  (a, n) => `${a}아무 데나<br/>안 가는<br/>사람들의 ${hi("픽")}`,
  (a, n) => `${a}몰라서 못 가는<br/>사람이 ${hi("더 많음")}`,
  (a, n) => `${a}여기까지 온<br/>사람만 보는<br/>${hi("리스트")}`,
];

function coverHeadline(clubList) {
  const areaPrefix = area ? `${area} ` : "";
  // 타이틀·서브텍스트 둘 다 회차(editionNo) 기준으로 돌린다. 길이가 서로 다른
  // 배열(40 / 100)이라 나머지 연산 주기가 어긋나므로, 같은 조합이 다시
  // 나오려면 수백 회차가 걸린다 — 사실상 반복이 체감되지 않는다.
  return {
    title: COVER_TITLES[(editionNo * TITLE_STEP) % COVER_TITLES.length](areaPrefix, nightLabel),
    sub: clubTeaser(clubList),
  };
}

function coverCard() {
  const h = coverHeadline(clubs);
  // 날짜 줄에 지역+"DJ라인업"까지 합쳐 한 줄로 쓴다(사용자 확정, 2026-09-03).
  // 예전엔 상단바 왼쪽에 지역 배지("강남"), 타이틀 아래 노란 띠에 "강남 LINEUP"이
  // 따로 있었는데 지역명이 카드에 세 번씩 나와 중복이었다. 이제 상단바는
  // 로고만 두고, 지역·성격은 이 한 줄이 전담한다.
  const dateLine = area
    ? `${dateLabel} ${escapeHtml(area)} DJ라인업`
    : `${dateLabel} DJ라인업`;
  // 표지 히어로 = 첫 번째 클럽 대표사진 1장. 작은 썸네일 3장을 나열하던
  // 방식에서 바꿨다(사용자 확정, 2026-09-03 — "클럽 하나만", "크게").
  // 좌우 여백 없이 전폭으로 깔고 위쪽만 배경색으로 페이드시켜 텍스트와 잇는다.
  const hero = clubs[0] || null;
  const heroImg = hero && hero.club_thumbnail ? escapeHtml(hero.club_thumbnail) : null;
  return `
  <section class="card cover">
    <div class="cover-topbar">
      <div class="cover-date">${dateLine}</div>
      <div class="cover-logo">NIGHTFLOW</div>
    </div>
    <div class="cover-inner">
      <div class="cover-title">${layoutTitle(h.title)}</div>
      <div class="cover-sub">${h.sub}</div>
    </div>
    ${heroImg ? `
    <div class="cover-fullbleed">
      <img class="cover-fullbleed-img" src="${heroImg}" />
      <div class="cover-fullbleed-scrim"></div>
    </div>` : ""}
  </section>`;
}

function clubCard(club, index) {
  const shown = club.sets.slice(0, 6);
  // 셋이 적을수록 행 하나가 커 보이게 — 카드 안이 항상 꽉 차 보여야 한다.
  const density = shown.length <= 2 ? "sparse" : shown.length <= 4 ? "normal" : "dense";

  const setsHtml = shown
    .map((s, i) => {
      // 미리듣기 없는 DJ는 이름/시간은 그대로 두되 배지는 아예 안 그린다
      // (사용자 확정: "준비중" 배지는 없애고 그냥 없는 걸로).
      const badge = s.has_preview
        ? `<div class="preview-badge">미리듣기</div>`
        : "";
      // 캡션에서 수집한 라인업은 시간이 없다(순서만 있음) — Migration 573.
      // 실측(2026-09-02): 실제 라인업 118셋 중 시간 있는 건 0개 — 예외가 아니라
      // 기본값이다. 그래서 순번 숫자("1번째")를 따로 보여주지 않는다 — 카드
      // 전체가 번호투성이가 되어 오히려 정보처럼 안 읽힌다. 위에서 아래로
      // 나열된 순서 자체가 라인업 순서이므로, 시간 없을 땐 그 칸을 비운다.
      const timeCell = s.time ? `<div class="set-time">${escapeHtml(s.time)}</div>` : "";
      // 장르(House/Techno/EDM/HipHop/RnB/Global)는 사운드클라우드 프로필에서
      // 자동 수집된 값이라 없을 수 있다(genre: null) — 있을 때만 표시.
      // 박스 배지가 아니라 "#house" 텍스트 해시태그 스타일로(사용자 요청,
      // 2026-09-03), 색은 초록.
      const genreTag = s.genre ? `<span class="dj-genre">#${escapeHtml(s.genre.toLowerCase())}</span>` : "";
      return `
      <div class="set-row${s.has_preview ? "" : " no-preview-row"}${s.time ? "" : " no-time-row"}">
        ${timeCell}
        <div class="set-dj">
          <div class="dj-name">${escapeHtml(s.dj_name)}${genreTag}</div>
          ${s.instagram ? `<div class="dj-ig">@${escapeHtml(s.instagram)}</div>` : ""}
        </div>
        ${badge}
      </div>`;
    })
    .join("");

  // 클럽 대표사진 — 실제로는 모든 클럽에 thumbnail_url이 채워져 있어(사용자 확인,
  // 2026-09-02) 배너 경로가 사실상 기본값이다. club_thumbnail이 비는 경우는
  // 데이터 결손(마이그레이션 중 값 누락 등)일 때뿐이므로, 그런 예외 상황에서도
  // 카드가 안 깨지도록 텍스트 헤더만의 폴백을 안전망으로 남겨둔다.
  const infoChips = [
    club.club_address ? `<div class="info-chip"><span class="info-icon">📍</span>${escapeHtml(club.club_address)}</div>` : "",
    club.club_operating_hours ? `<div class="info-chip"><span class="info-icon">🕐</span>${escapeHtml(club.club_operating_hours)}</div>` : "",
    club.club_entry_fee ? `<div class="info-chip"><span class="info-icon">🎫</span>${escapeHtml(club.club_entry_fee)}</div>` : "",
  ].filter(Boolean).join("");
  const infoBlock = infoChips ? `<div class="info-chips">${infoChips}</div>` : "";

  const header = club.club_thumbnail
    ? `
    <div class="club-banner">
      <img class="club-banner-img" src="${escapeHtml(club.club_thumbnail)}" />
      <div class="club-banner-scrim"></div>
      ${club.club_area ? `<div class="club-area club-area-on-banner">${escapeHtml(club.club_area)}</div>` : ""}
      <div class="club-banner-text">
        <div class="club-index">${String(index).padStart(2, "0")}</div>
        <div class="club-name">${escapeHtml(club.club_name)}</div>
      </div>
    </div>`
    : `
    <div class="club-header">
      <div class="club-index">${String(index).padStart(2, "0")}</div>
      <div class="club-name">${escapeHtml(club.club_name)}</div>
      <div class="club-area">${escapeHtml(club.club_area || "")}</div>
    </div>`;

  return `
  <section class="card club density-${density}${club.club_thumbnail ? " has-banner" : ""}">
    ${header}
    ${club.event_title ? `<div class="event-title">${escapeHtml(club.event_title)}</div>` : ""}
    ${infoBlock}
    <div class="sets">${setsHtml}</div>
    <div class="club-footer">NIGHTFLOW</div>
  </section>`;
}

function summaryCard() {
  // 클럽 카드와 동일한 밀도 패턴 — 클럽 수가 적을수록 행 하나를 키워
  // 카드가 항상 꽉 차 보이게 한다(클럽 카드의 density-sparse/dense와 같은 원리).
  //
  // 다만 사진+위치+영업시간+입장료+DJ를 전부 넣는 "풀" 레이아웃은 클럽이
  // 5곳을 넘으면 1350px 안에 물리적으로 안 들어간다(실측: 이태원 6클럽에서
  // 카드 밖으로 넘침). 그래서 5곳 이상이면 컴팩트 모드로 전환 — 사진·위치·
  // 영업시간·입장료를 빼고 클럽명(+지역)과 DJ만 한 줄씩 압축한다. 그 정보들은
  // 이미 해당 클럽의 개별 카드(2~N번 슬라이드)에 다 나와 있으므로 요약
  // 카드에서 빠져도 손실이 아니다.
  const compact = clubs.length > 4;
  const summaryDensity = clubs.length <= 2 ? "sparse" : clubs.length <= 4 ? "normal" : "dense";

  const rows = clubs
    .map((c) => {
      if (compact) {
        return `
      <div class="summary-row summary-row-compact">
        <div class="summary-club-line">
          <span class="summary-club">${escapeHtml(c.club_name)}</span>
          ${c.club_area ? `<span class="summary-area">${escapeHtml(c.club_area)}</span>` : ""}
        </div>
        <div class="summary-djs">${escapeHtml(c.sets.map((s) => s.dj_name).join(" · "))}</div>
      </div>`;
      }
      const thumb = c.club_thumbnail
        ? `<img class="summary-thumb" src="${escapeHtml(c.club_thumbnail)}" />`
        : `<div class="summary-thumb summary-thumb-empty">${escapeHtml(c.club_name.slice(0, 1))}</div>`;
      const meta = [c.club_operating_hours, c.club_entry_fee].filter(Boolean).join(" · ");
      return `
      <div class="summary-row">
        ${thumb}
        <div class="summary-body">
          <div class="summary-club-line">
            <span class="summary-club">${escapeHtml(c.club_name)}</span>
            ${c.club_area ? `<span class="summary-area">${escapeHtml(c.club_area)}</span>` : ""}
          </div>
          ${c.club_address ? `<div class="summary-address">📍 ${escapeHtml(c.club_address)}</div>` : ""}
          ${meta ? `<div class="summary-meta">${escapeHtml(meta)}</div>` : ""}
          <div class="summary-djs">${escapeHtml(c.sets.map((s) => s.dj_name).join(" · "))}</div>
        </div>
      </div>`;
    })
    .join("");

  return `
  <section class="card summary density-${summaryDensity}${compact ? " summary-compact" : ""}">
    <div class="summary-title">${nightLabel} 라인업 한눈에</div>
    <div class="summary-body-wrap">
      <div class="summary-list">${rows}</div>
      <div class="summary-cta-block">
        <div class="cta-main">"여기 어때?"</div>
        <div class="cta-sub">같이 갈 친구에게 공유! 📤</div>
      </div>
    </div>
    <div class="summary-footer">NIGHTFLOW</div>
  </section>`;
}

const cardsHtml = [coverCard(), ...clubs.map((c, i) => clubCard(c, i + 1)), summaryCard()].join(
  "\n"
);

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #000;
    font-family: "Pretendard", "Apple SD Gothic Neo", -apple-system, sans-serif;
  }
  .card {
    width: 1080px;
    height: 1350px;
    background: ${BG};
    color: #fff;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px 64px;
  }

  /* 표지 — Layout 3 참조: 상단 에피소드 바, 형광 하이라이트 배지, 리본, 별 장식 */
  .cover-topbar {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 3px solid ${AMBER}; padding-bottom: 20px; margin-bottom: 56px;
  }
  .cover-episode { font-size: 30px; font-weight: 800; color: ${AMBER}; letter-spacing: 1px; }
  .cover-logo { font-size: 30px; font-weight: 900; letter-spacing: 2px; }
  .cover-inner { flex: 1; }
  /* 날짜 줄은 상단바(노란 밑줄 위)에서 로고와 같은 라인에 앉는다
     (사용자 확정, 2026-09-03). 로고와 균형 맞춰 같은 크기로. */
  .cover-date { font-size: 30px; font-weight: 800; color: #ccc; }
  /* 타이틀은 줄마다 <span class="t-line">으로 감싸 위계를 준다(layoutTitle).
     강조 단어가 있는 줄(.t-accent)만 크게 — 시선이 거기 먼저 꽂힌다. */
  .cover-title { font-weight: 900; margin-bottom: 28px; }
  .t-line { display: block; font-size: 72px; line-height: 1.2; }
  .t-line.t-accent { font-size: 92px; }
  .cover-highlight-word { color: ${AMBER}; }
  .cover-sub { font-size: 32px; color: #ccc; font-weight: 500; }
  /* 표지 히어로 — 첫 클럽 대표사진 1장을 좌우 꽉 채워 바닥까지 깐다.
     위쪽만 배경색으로 페이드시켜 텍스트 영역과 자연스럽게 잇는다. */
  .cover-fullbleed {
    position: absolute; left: 0; right: 0; bottom: 0; height: 640px; overflow: hidden;
  }
  .cover-fullbleed-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* 클럽 로고 이미지는 배경이 흰색·원형인 경우가 흔해(예: Cakeshop) 그대로
     깔면 좌우에 밝은 띠가 남는다. 위아래뿐 아니라 좌우도 배경색으로
     페이드시켜 어떤 이미지가 와도 카드에 녹아들게 한다. */
  .cover-fullbleed-scrim {
    position: absolute; inset: 0;
    background:
      linear-gradient(180deg, ${BG} 0%, rgba(10,10,10,0.25) 28%, rgba(10,10,10,0.08) 70%, rgba(10,10,10,0.45) 100%),
      linear-gradient(90deg, ${BG} 0%, rgba(10,10,10,0) 12%, rgba(10,10,10,0) 88%, ${BG} 100%);
  }
  .cover-footer {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 28px; color: #999; font-weight: 700; letter-spacing: 1px;
    border-top: 1px solid #333; padding-top: 24px;
  }
  .cover-arrow { color: ${AMBER}; font-size: 34px; font-weight: 900; }

  /* 클럽 카드 */
  .club-header { display: flex; align-items: baseline; gap: 20px; margin-bottom: 8px; }
  .club-index { font-size: 32px; font-weight: 800; color: ${AMBER}; }
  .club-name { font-size: 56px; font-weight: 900; }
  .club-area {
    font-size: 26px; font-weight: 700; color: #999;
    background: ${CARD}; border-radius: 999px; padding: 6px 20px; margin-left: auto;
  }

  /* 대표사진 배너 — 카드 패딩(72px 64px)을 상쇄해 전폭으로 걸치고, 사진 위에
     이름/지역을 스크림으로 얹는다. 사진 없는 클럽은 기존 텍스트 헤더 그대로. */
  .club-banner {
    position: relative; margin: -72px -64px 28px; height: 320px; overflow: hidden;
  }
  .club-banner-img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
  .club-banner-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.92) 100%);
  }
  .club-banner-text { position: absolute; left: 40px; right: 40px; bottom: 28px; }
  .club-banner-text .club-index { font-size: 28px; }
  .club-banner-text .club-name { font-size: 48px; text-shadow: 0 2px 12px rgba(0,0,0,0.5); }
  .club-area-on-banner {
    position: absolute; top: 20px; right: 40px; margin-left: 0;
    background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  }

  .event-title { font-size: 30px; color: ${AMBER}; font-weight: 700; margin-top: 16px; margin-bottom: 8px; }

  /* 위치·영업시간·입장료 정보 칩 */
  .info-chips { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
  .info-chip {
    font-size: 23px; color: #ccc; font-weight: 600;
    display: flex; align-items: center; gap: 10px;
  }
  .info-icon { font-size: 22px; }

  .sets { display: flex; flex-direction: column; gap: 20px; margin-top: 32px; flex: 1; justify-content: center; }
  .has-banner .sets { margin-top: 24px; }
  .set-row {
    display: flex; align-items: center; gap: 24px;
    background: ${CARD}; border-radius: 24px; padding: 28px 32px;
  }
  .set-time { font-size: 32px; font-weight: 800; color: ${AMBER}; min-width: 110px; }
  .set-dj { flex: 1; }
  .dj-name { font-size: 38px; font-weight: 800; }
  .dj-genre {
    font-size: 20px; font-weight: 700; color: #4ADE80;
    margin-left: 10px; vertical-align: middle;
  }
  .dj-ig { font-size: 24px; color: #999; margin-top: 4px; }
  .preview-badge {
    font-size: 22px; font-weight: 800; color: #000; background: ${AMBER};
    border-radius: 999px; padding: 10px 20px; white-space: nowrap;
  }
  .preview-badge.no-preview { color: #999; background: #333; }
  .no-preview-row .dj-name { color: #ccc; }
  .club-footer { font-size: 26px; color: #666; font-weight: 600; letter-spacing: 1px; }

  /* 셋이 적을수록 행을 키워서 카드가 항상 꽉 차 보이게 */
  .density-sparse .set-row { padding: 44px 40px; }
  .density-sparse .set-time { font-size: 40px; }
  .density-sparse .dj-name { font-size: 48px; }
  .density-sparse .dj-ig { font-size: 28px; }
  .density-dense .set-row { padding: 20px 28px; }
  .density-dense .set-time { font-size: 28px; }
  .density-dense .dj-name { font-size: 32px; }

  /* 요약 카드 — 클럽당 사진+위치+영업시간+입장료+DJ까지 다 보여줘 카드가
     휑하지 않게 한다. 클럽 카드에서 이미 보여준 정보를 한 장에 압축 재진열. */
  .summary-title { font-size: 48px; font-weight: 900; margin-top: 40px; margin-bottom: 40px; }
  /* 리스트 + CTA를 한 덩어리(.summary-body-wrap)로 묶어 세로 가운데 정렬한다.
     예전엔 .summary-list에 flex:1을 줘서 리스트가 남는 공간을 다 먹었는데,
     그러면 .card의 space-between 때문에 CTA가 카드 맨 아래까지 밀려서
     클럽 목록과 한참 떨어져 보였다(사용자 지적, 2026-09-03: "저장문구가
     카드 바로 아래쪽으로"). 이제 CTA는 항상 마지막 클럽 카드 바로 밑에 붙는다. */
  .summary-body-wrap { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
  .summary-list { display: flex; flex-direction: column; gap: 24px; overflow: hidden; }
  .summary-row {
    display: flex; gap: 24px; align-items: flex-start;
    background: ${CARD}; border-radius: 20px; padding: 24px;
  }
  .summary-thumb {
    width: 96px; height: 96px; border-radius: 14px; object-fit: cover;
    flex-shrink: 0; border: 2px solid ${AMBER};
  }
  .summary-thumb-empty {
    display: flex; align-items: center; justify-content: center;
    background: #2a2a2a; color: ${AMBER}; font-size: 40px; font-weight: 900;
  }
  .summary-body { flex: 1; min-width: 0; }
  .summary-club-line { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .summary-club { font-size: 34px; font-weight: 800; }
  .summary-area {
    font-size: 20px; font-weight: 700; color: #999;
    background: #2a2a2a; border-radius: 999px; padding: 3px 14px;
  }
  .summary-address { font-size: 21px; color: #aaa; margin-bottom: 4px; }
  .summary-meta { font-size: 21px; color: ${AMBER}; font-weight: 600; margin-bottom: 10px; }
  .summary-djs { font-size: 24px; color: #ddd; font-weight: 600; }

  /* 클럽 수가 적을수록(sparse) 요약 행을 키우고, 많을수록(dense) 줄인다 */
  .density-sparse .summary-row { padding: 40px; gap: 32px; }
  .density-sparse .summary-thumb { width: 130px; height: 130px; }
  .density-sparse .summary-club { font-size: 42px; }
  .density-sparse .summary-address,
  .density-sparse .summary-meta { font-size: 25px; }
  .density-sparse .summary-djs { font-size: 28px; }
  .density-dense .summary-row { padding: 18px; gap: 18px; }
  .density-dense .summary-thumb { width: 72px; height: 72px; }
  .density-dense .summary-club { font-size: 28px; }
  .density-dense .summary-address,
  .density-dense .summary-meta { font-size: 18px; }
  .density-dense .summary-djs { font-size: 20px; }

  /* 컴팩트 요약 — 클럽 5곳 이상일 때. 사진·위치·영업시간·입장료 없이
     클럽명+DJ만 한 줄씩(그 정보는 개별 클럽 카드에 이미 있다). */
  /* 클럽이 많은 컴팩트 모드에선 위쪽부터 채운다(가운데 정렬하면 행이 많아
     넘칠 위험). 정렬 주체는 리스트가 아니라 래퍼다. */
  .summary-compact .summary-body-wrap { justify-content: flex-start; }
  .summary-compact .summary-list { gap: 16px; }
  .summary-row-compact {
    padding: 18px 22px; display: block;
  }
  .summary-row-compact .summary-club-line { margin-bottom: 6px; }
  .summary-row-compact .summary-club { font-size: 26px; }
  .summary-row-compact .summary-area { font-size: 16px; padding: 2px 10px; }
  .summary-row-compact .summary-djs { font-size: 19px; }

  /* 마지막 슬라이드 CTA — 저장/공유 유도, 문구 고정(사용자 확정, 2026-09-03:
     "저장해두고 친구에게 공유하기!"). 다른 문구로 바꾸지 않는다. 박스·
     구분선 없이 순수 텍스트로(사용자 요청, 2026-09-03: "공유 유도 디자인
     그냥 텍스트로"), footer도 "NIGHTFLOW"만 남긴다("· nightflow.kr" 제거). */
  /* 마지막 카드의 주인공 — 서비스 메인 문구를 그대로 쓴다(사용자 확정,
     2026-09-03: "이게 이 페이지의 메인"). 앰버→오렌지 그라데이션 박스로
     카드에서 가장 눈에 띄는 덩어리를 만들고, "여기 어때?"를 첫 줄에 크게. */
  .summary-cta-block {
    margin-top: 32px; border-radius: 24px; padding: 34px 24px; text-align: center;
    background: linear-gradient(135deg, #FBBF24 0%, #F97316 100%);
  }
  .cta-main { font-size: 54px; font-weight: 900; color: #0A0A0A; line-height: 1.15; }
  .cta-sub { font-size: 30px; font-weight: 800; color: rgba(10,10,10,0.78); margin-top: 10px; }
  .summary-footer {
    text-align: center; font-size: 24px; color: #666; font-weight: 700;
    letter-spacing: 1px; margin-top: 16px;
  }
</style>
</head>
<body>
${cardsHtml}
</body>
</html>`;

console.log(html);
