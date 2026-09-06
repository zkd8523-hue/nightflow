// operating_hours(자유 텍스트) → open_dows(0=일~6=토) 파서.
//
// 표기가 제각각이다: "금/토", "화~일", "목·금·토·일", "매일", "연중무휴",
// "평일", "주말", "(월 휴무)", "일~목 ... / 금·토 ...". 규칙은 단순하게 둔다 —
// 애매하면 null(미설정)을 돌려 그 클럽은 아무 날짜도 막지 않는다. 잘못 막는 것이
// 안 막는 것보다 훨씬 나쁘다(예약 자체가 불가능해진다).
const DOW = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const ALL = [0, 1, 2, 3, 4, 5, 6];

function parseOpenDows(raw) {
  if (!raw || !raw.trim()) return null;
  // "공휴일", "휴일", "평일", "주말"에 들어있는 요일 글자(일)가 요일 나열로
  // 오독되는 걸 막는다 — "금/토/공휴일"이 일요일 영업으로 잡히면 안 된다.
  // 자리표시자로 치워두고, "평일/주말"은 아래에서 따로 해석한다.
  const s = raw
    .trim()
    .replace(/공휴일|휴일/g, "\u0000")
    .replace(/평일/g, "\u0001")
    .replace(/주말/g, "\u0002");

  // "휴무"로 명시된 요일은 무엇보다 우선한다 — "화~일 22:00 (월 휴무)"처럼
  // 영업 표기와 휴무 표기가 같이 오면 휴무 쪽이 정확한 정보다.
  const closed = new Set();
  // 휴무 표기 구간은 통째로 들어낸다. 안 그러면 "화 휴무"의 '화'가 아래 요일
  // 나열에도 잡혀 open에 들어갔다가 closed로 다시 빠져, 영업일이 하나도 없는
  // 빈 배열이 된다 — "화만 쉬고 나머지는 영업"이 "매일 휴무"로 뒤집힌다.
  let body = s;
  for (const m of s.matchAll(/([월화수목금토일][^()]{0,20}?)\s*휴무/g)) {
    for (const d of expandSegment(m[1])) closed.add(d);
    body = body.replace(m[0], " ");
  }

  // 연중무휴 / 매일 — 요일 나열보다 먼저 본다. "매일 22:00-06:00 (주말 07:00)"의
  // "주말"을 영업요일 나열로 오해하면 안 된다.
  if (/연중무휴|매일/.test(s)) return subtract(ALL, closed);

  const open = new Set();

  // "(일 랜덤)"처럼 영업이 확정되지 않은 요일은 영업일로 세지 않는다.
  const uncertain = new Set();
  for (const m of body.matchAll(/([월화수목금토일][^()]{0,20}?)\s*(랜덤|비정기|문의)/g)) {
    for (const d of expandSegment(m[1])) uncertain.add(d);
  }

  // 요일 토큰이 실제로 등장하는 구간만 본다. "금/토 22:00-05:00 / 목·일 19:00~"
  // 처럼 여러 구간이 섞여도 전부 합집합으로 모은다.
  for (const seg of body.match(/[월화수목금토일][월화수목금토일\s·,\/~∼-]*/g) ?? []) {
    for (const d of expandSegment(seg)) open.add(d);
  }
  for (const d of uncertain) open.delete(d);

  // "평일"(월~금) / "주말"(금·토·일은 아님 — 토·일). 클럽 맥락에서 "주말 영업"은
  // 금요일 밤을 포함하는 경우가 많지만, 추측으로 금요일을 넣지는 않는다.
  if (/\u0001/.test(body)) [1, 2, 3, 4, 5].forEach((d) => open.add(d));
  if (/\u0002/.test(body)) [6, 0].forEach((d) => open.add(d));

  // 영업 요일 나열은 없고 휴무만 적힌 경우("화 휴무 / 22:00~ late") —
  // 나머지 요일은 영업한다는 뜻이다.
  if (open.size === 0 && closed.size > 0) return subtract(ALL, closed);

  const result = subtract([...open], closed);
  // 요일 정보를 하나도 못 찾았으면 미설정 — "금/토 22:00" 같은 표기가 아니라
  // "23:30-07:00", "애프터 클럽 (03:00~ 피크)"처럼 시간만 있는 경우다.
  return result.length ? result : null;
}

// "금/토", "화~일", "목·금·토·일", "월~목/일" → 요일 번호들
function expandSegment(seg) {
  const out = new Set();
  const chars = [...seg].filter((c) => c in DOW || "~∼-".includes(c));
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!(c in DOW)) continue;
    const next = chars[i + 1];
    // 범위 표기 "화~일"
    if (next && "~∼-".includes(next) && chars[i + 2] in DOW) {
      let a = DOW[c];
      const b = DOW[chars[i + 2]];
      // 요일은 순환한다 — "토~월"은 토,일,월.
      for (let k = 0; k < 7; k++) {
        out.add(a);
        if (a === b) break;
        a = (a + 1) % 7;
      }
      i += 2;
      continue;
    }
    out.add(DOW[c]);
  }
  return [...out];
}

function subtract(list, closedSet) {
  return [...new Set(list)].filter((d) => !closedSet.has(d)).sort((a, b) => a - b);
}

module.exports = { parseOpenDows };
