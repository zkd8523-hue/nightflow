/**
 * 이미 저장된 캡션에서 "이름 @핸들" 쌍을 뽑아 djs / artists 의 instagram 을 채운다.
 *
 * 배경: 클럽 캡션은 라인업을 "YVES (LIVE) @yvesntual" 처럼 이름과 핸들을 나란히 적는
 * 경우가 매우 많다. 사람이 구글로 찾고 있는 핸들이 이미 우리 DB(raw_caption) 안에
 * 텍스트로 들어와 있는 셈이다. 이걸 안 쓰는 건 낭비다.
 *
 * 안전장치 (오연결이 미입력보다 나쁘다):
 *   - 같은 줄에서 이름과 핸들이 **인접**할 때만 인정한다. 캡션 아무 데나 있는 @는 무시.
 *   - 티켓·장소·주최 계정은 제외한다(@dumbs_app, @resident_advisor, @lionseoul 등).
 *   - 이미 instagram 이 있으면 덮어쓰지 않는다.
 *   - 한 이름이 서로 다른 핸들로 두 번 이상 나오면 둘 다 버린다(어느 쪽이 맞는지 모름).
 *
 * 사용: DRY_RUN=1 node scripts/extract-performer-handles.mjs
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

/** 출연자가 아닌 계정 — 티켓 플랫폼·미디어·장소 */
const NON_PERFORMER = new Set([
  "dumbs_app", "resident_advisor", "nol.ticket", "interpark", "yes24",
  "melon", "ticketlink", "instagram", "spotify", "soundcloud", "youtube",
]);
/** 역할 레이블 — 이름 앞에 붙는 접두사라 이름에서 떼어낸다 */
const ROLE_PREFIX = /^(dj|live|guest|host|opening|support|b2b|vj|mc)\s*[-:]?\s*/i;

const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s._-]/g, "");

// ── 클럽 핸들(장소) 목록 — 출연자로 오인하면 안 된다 ──────────────
const { data: clubs } = await sb.from("clubs").select("instagram").not("instagram", "is", null);
const clubHandles = new Set((clubs ?? []).map((c) => String(c.instagram).toLowerCase().replace(/^@/, "")));

// ── 캡션 전수 ─────────────────────────────────────────────────────
const { data: events, error } = await sb
  .from("club_events")
  .select("raw_caption")
  .not("raw_caption", "is", null);
if (error) { console.error(error.message); process.exit(1); }

/**
 * 한 줄에서 "이름 ... @핸들" 을 뽑는다.
 * 핸들 바로 앞의 텍스트를 이름으로 본다 — 괄호 주석 (LIVE) 등은 제거.
 */
const pairs = new Map(); // 정규화이름 -> Set(핸들)
const LINE_RE = /^(.{1,60}?)\s*[@](\w[\w._]{1,29})\s*$/;
/** 핸들만 있는 줄 — 바로 윗줄이 이름이다 (월간 스케줄 캡션에서 흔한 형태) */
const HANDLE_ONLY_RE = /^@(\w[\w._]{1,29})(?:\s+@\w[\w._]{1,29})*$/;

for (const e of events) {
  const lines = String(e.raw_caption).split("\n");
  for (let li = 0; li < lines.length; li++) {
    const rawLine = lines[li];
    const line = rawLine.trim();

    // 케이스 B: 핸들만 있는 줄 → 윗줄에서 이름을 찾는다.
    //   08.28 TERMINAL L presents HYPATON
    //   @hypaton                      ← 이 줄
    // 윗줄에 핸들이 여럿이면(협업 계정) 누가 누군지 모르므로 버린다.
    if (HANDLE_ONLY_RE.test(line)) {
      const handles = line.match(/@\w[\w._]{1,29}/g) ?? [];
      if (handles.length !== 1) continue;
      const prev = (lines[li - 1] ?? "").trim();
      if (!prev || prev.includes("@")) continue;
      // 날짜 접두사("08.28 SAT - ")와 흔한 수식어를 떼어 이름만 남긴다
      let nm = prev
        .replace(/^\d{1,2}[./]\d{1,2}\s*(MON|TUE|WED|THU|FRI|SAT|SUN|월|화|수|목|금|토|일)?\s*[-–—:]?\s*/i, "")
        .replace(/^.*?\bpresents\b\s*/i, "")
        .replace(/\([^)]*\)/g, "")
        .replace(ROLE_PREFIX, "")
        .replace(/[-–—:•·,]+$/, "")
        .trim();
      const h = handles[0].slice(1).toLowerCase();
      if (!nm || nm.length < 2 || nm.length > 40) continue;
      if (NON_PERFORMER.has(h) || clubHandles.has(h)) continue;
      if (/티켓|ticket|venue|장소|문의|예약|주소|info|schedule|tba/i.test(nm)) continue;
      const k2 = norm(nm);
      if (!k2) continue;
      if (!pairs.has(k2)) pairs.set(k2, { display: nm, handles: new Set() });
      pairs.get(k2).handles.add(h);
      continue;
    }

    // 케이스 A: 같은 줄에 "이름 @핸들"
    const m = line.match(LINE_RE);
    if (!m) continue;

    let name = m[1]
      .replace(/\([^)]*\)/g, "")   // (LIVE), (DJ SET) 제거
      .replace(/\[[^\]]*\]/g, "")
      .replace(ROLE_PREFIX, "")
      .replace(/[-–—:•·,]+$/, "")
      .trim();
    const handle = m[2].toLowerCase();

    if (!name || name.length < 2) continue;
    if (NON_PERFORMER.has(handle) || clubHandles.has(handle)) continue;
    // 이름이 순전히 안내 문구면 제외
    if (/티켓|ticket|venue|장소|문의|예약|주소|info/i.test(name)) continue;

    const k = norm(name);
    if (!k) continue;
    if (!pairs.has(k)) pairs.set(k, { display: name, handles: new Set() });
    pairs.get(k).handles.add(handle);
  }
}

// 한 이름 = 한 핸들인 것만 신뢰한다
const confident = new Map(); // 정규화이름 -> 핸들
for (const [k, v] of pairs) {
  if (v.handles.size === 1) confident.set(k, [...v.handles][0]);
}
console.log(`캡션에서 추출한 "이름 @핸들" 쌍: ${pairs.size}종 (그중 단일핸들 확정 ${confident.size}종)\n`);

// ── djs / artists 에 반영 ─────────────────────────────────────────
let total = 0;
for (const table of ["djs", "artists"]) {
  const { data: people, error: pe } = await sb
    .from(table)
    .select("id, display_name, instagram")
    .is("instagram", null)
    .is("deleted_at", null);
  if (pe) { console.log(`${table} 조회 실패: ${pe.message}`); continue; }

  const hits = [];
  for (const p of people ?? []) {
    const h = confident.get(norm(p.display_name));
    if (h) hits.push({ ...p, handle: h });
  }
  console.log(`▸ ${table}: 미확보 ${people?.length ?? 0}명 중 ${hits.length}명 매칭`);
  for (const h of hits) console.log(`    ${h.display_name} → @${h.handle}`);

  if (!DRY_RUN) {
    for (const h of hits) await sb.from(table).update({ instagram: h.handle }).eq("id", h.id);
  }
  total += hits.length;
}

console.log(`\n📊 ${DRY_RUN ? "예상" : "완료"} — ${total}명 핸들 채움`);
