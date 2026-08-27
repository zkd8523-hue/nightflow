/**
 * 프롬프트 퇴행 방어 — 오늘 수정의 근거가 된 실제 사고 케이스를 회귀 테스트로.
 *
 * 왜(2026-08-27): 프롬프트를 하루에 네 번 고쳤다. 규칙 하나를 강화하다 다른
 * 규칙을 밀어낼 위험이 실재한다(실제로 한 번 겪음 — 핸들 환각 규칙을 넣었는데
 * 날짜 규칙이 과해져서 날짜 있는 글도 null로 버림). Apify를 안 태우고
 * (비용 0) 저장된 캡션을 재사용해 LLM만 호출한다(Haiku, 건당 수 원).
 *
 * 사용: node scripts/golden-set-lineup.mjs
 */
import { readFileSync } from "fs";

const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

function extractExport(source, name) {
  const m = source.match(new RegExp(`export const ${name}[\\s\\S]*?=`));
  if (!m) throw new Error(`${name} 을 prompt.ts에서 못 찾음`);
  const rest = source.slice(m.index + m[0].length);
  const next = rest.search(/\nexport (const|function)/);
  return (next === -1 ? rest : rest.slice(0, next)).trim().replace(/;\s*$/, "").replace(/\s+as\s+const$/, "");
}
const promptSrc = readFileSync("src/lib/lineups/prompt.ts", "utf8");
const SYS = new Function(`return (${extractExport(promptSrc, "LINEUP_SYSTEM_PROMPT")})`)();
const TOOL = new Function(`return (${extractExport(promptSrc, "LINEUP_EMIT_TOOL")})`)();
const MODEL = new Function(`return (${extractExport(promptSrc, "LINEUP_TEXT_MODEL")})`)();

async function extract(caption, sourceHint, postedAt = "2026-08-27T12:00:00Z") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYS,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "emit_lineup" },
      messages: [{ role: "user", content: [{ type: "text", text: `${sourceHint} 게시 시각: ${postedAt}\n\n${caption}` }] }],
    }),
  });
  const data = await res.json();
  if (data.stop_reason === "max_tokens") return { truncated: true };
  return data.content?.find((b) => b.type === "tool_use")?.input ?? null;
}

const CASES = [
  {
    id: "G1",
    label: "NYAPI 월간 스케줄(다수 밤)",
    hint: '이 게시물은 "NYAPI" 계정이 올렸다. 이 계정 자체가 그 클럽이다.',
    caption: `NYAPI AUGUST 2026
———————————————————————————
AUG.01 TRIP ADVISOR W/ KAITO (MOLDIVE / OSAKA)
*KAITO (MOLDIVE / OSAKA) @kaito_____
FFAN @ffanyourself
JUNCHEOL @juncheol___
———————————————————————————
AUG.06
FFAN @ffanyourself
SUNDAY LEE @sunday_lee_
———————————————————————————
AUG.07 WEIRD CIRCLE
KUGEL @kugel____
MIMIQ @mimiqeem
JAEHAN @jae_han_62
———————————————————————————
AUG.08 TAXI DRIVER
171 @onesevenone.kr
COZYHOON @cozyhoon
JINWOOK @discosurf_beach
———————————————————————————
AUG.13 MIHAK ALL NIGHT LONG
MIHAK @mihak_
———————————————————————————
AUG.14 NYAPI INVITE GIGI (MOOD HUT / USA)
*GIGI (MOOD HUT / USA) @gigi_moodhut
YOEL @yoelkoh`,
    check: (out) => {
      if (out?.truncated) return "잘림(max_tokens)";
      const n = out?.events?.length ?? 0;
      return n >= 5 ? null : `events=${n} (기대 >=5)`;
    },
  },
  {
    id: "G3",
    label: "SOUNDCLASH — artist+DJ 혼재, DJ 다수",
    hint: '이 게시물은 "LION SUPER CLUB" 계정이 올렸다.',
    caption: `서로 다른 사운드, 하나의 에너지.
SOUNDCLASH THURSDAY'S.
Another installation with a special performance by YVES, hosted by GSTV.
LINE UP
YVES (LIVE) @yvesntual
LIGRYE @ligrye
DJ POOL @pool_up__
PNG @png_305
JADA @jada23
AYLA @aylayousomuchh
DOBERMAN @doberman___kr
NICKO @cardosonicko
MOLLFIN @m.ollfin`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      const sets = out?.events?.[0]?.sets ?? [];
      const djCount = sets.filter((s) => s.role !== "artist").length;
      return djCount >= 8 ? null : `dj=${djCount} (기대 >=8) sets=${JSON.stringify(sets.map((s) => [s.dj_name, s.role]))}`;
    },
  },
  {
    id: "G4",
    label: "이름 없이 @handle만 — 환각 금지",
    hint: '이 게시물은 "LION SUPER CLUB" 계정이 올렸다.',
    caption: `SOUNDCLASH THURSDAY'S
목요일 밤, LION의 문이 열리는 순간 장르들의 충돌이 시작됩니다.
@kidcozyboy @okashii.web @ph1boyyy @ash.island @chrt_keithape`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      const sets = out?.events?.[0]?.sets ?? [];
      const names = sets.map((s) => s.dj_name);
      const bad = names.filter((n) => !["kidcozyboy", "okashii.web", "ph1boyyy", "ash.island", "chrt_keithape"].includes(n));
      return bad.length === 0 ? null : `환각 이름: ${JSON.stringify(bad)}`;
    },
  },
  {
    id: "G5",
    label: "11:30 시작 — 23:30이어야 함",
    hint: '이 게시물은 "XX2" 계정이 올렸다.',
    caption: `XX2 DJ LINE UP\n08.28 FRI\n11:30 - 12:30  HUE\n12:30 - 1:30  BOOGIE`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      const sets = out?.events?.[0]?.sets ?? [];
      const hue = sets.find((s) => s.dj_name === "HUE");
      return hue?.start_hhmm === "23:30" ? null : `HUE.start_hhmm=${hue?.start_hhmm} (기대 23:30)`;
    },
  },
  {
    id: "G6",
    label: "12:30 시작 — 00:30이어야 함",
    hint: '이 게시물은 "XX2" 계정이 올렸다.',
    caption: `XX2 DJ LINE UP\n08.28 FRI\n11:30 - 12:30  HUE\n12:30 - 1:30  BOOGIE`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      const sets = out?.events?.[0]?.sets ?? [];
      const boogie = sets.find((s) => s.dj_name === "BOOGIE");
      return boogie?.start_hhmm === "00:30" ? null : `BOOGIE.start_hhmm=${boogie?.start_hhmm} (기대 00:30)`;
    },
  },
  {
    id: "G7",
    label: "일(day) 있는 공지 — 날짜 emit",
    hint: '이 게시물은 "BADASS" 계정이 올렸다.',
    caption: `BADASS\n08.22 SAT\nDJ CHASE`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      const d = out?.events?.[0]?.event_date;
      return d === "08-22" ? null : `event_date=${d} (기대 08-22)`;
    },
  },
  {
    id: "G8",
    label: "반복 주간공지 — 날짜 null",
    hint: '이 게시물은 "LION SUPER CLUB" 계정이 올렸다.',
    caption: `SOUNDCLASH THURSDAY'S\n목요일 밤, 매주 반복됩니다.\n@kidcozyboy @okashii.web`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      const events = out?.events ?? [];
      if (events.length > 1) return `날짜 여러 개로 쪼갬: ${events.length}건`;
      const d = events[0]?.event_date;
      return d === null ? null : `event_date=${d} (기대 null)`;
    },
  },
  {
    id: "G10",
    label: "'performance' 산문 — DJ 유지",
    hint: '이 게시물은 "GROOVE N SPOT" 계정이 올렸다.',
    caption: `Special Guest DJ's (@deejaysweeny)\nExperience Sweeney's powerful performance live at Groove n Spot!`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      const s = out?.events?.[0]?.sets?.[0];
      return s?.role === "dj" ? null : `role=${s?.role} (기대 dj)`;
    },
  },
  {
    id: "G12",
    label: "Hertz 게스트 공지 — 홍보물 오탐 금지",
    hint: '이 게시물은 "Hertz" 계정이 올렸다.',
    caption: `08.29 SAT - Mr.Ho (Klasse Wrecks, HK)`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      if (out?.is_promo_only) return "is_promo_only=true (기대 false)";
      const n = out?.events?.[0]?.sets?.length ?? 0;
      return n >= 1 ? null : `sets=${n} (기대 >=1)`;
    },
  },
  {
    id: "G13",
    label: "영업시간 안내만 — 홍보물 판정",
    hint: '이 게시물은 "Club Test" 계정이 올렸다.',
    caption: `영업시간 안내\n일~목 21:00-05:00 / 금토 21:00-07:00\n예약문의 DM`,
    check: (out) => {
      if (out?.truncated) return "잘림";
      return out?.is_promo_only === true ? null : `is_promo_only=${out?.is_promo_only} (기대 true)`;
    },
  },
];

let pass = 0;
const failed = [];
for (const c of CASES) {
  const out = await extract(c.caption, c.hint);
  const problem = c.check(out);
  if (problem) {
    failed.push({ id: c.id, label: c.label, problem });
    console.log(`❌ ${c.id} ${c.label}\n   ${problem}`);
  } else {
    pass++;
    console.log(`✅ ${c.id} ${c.label}`);
  }
  await new Promise((r) => setTimeout(r, 150));
}

console.log(`\n${"=".repeat(50)}`);
console.log(`${pass}/${CASES.length} 통과`);
console.log("=".repeat(50));
if (failed.length) {
  console.log("\n실패 목록:");
  for (const f of failed) console.log(`  ${f.id}: ${f.problem}`);
}
process.exit(failed.length ? 1 : 0);
