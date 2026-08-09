/**
 * 클럽 영문명(clubs.name_en) 채우기
 *
 * 사용:
 *   node scripts/fill-club-name-en.mjs            # 미리보기 (DB 안 건드림)
 *   node scripts/fill-club-name-en.mjs --apply    # 실제 반영
 *   node scripts/fill-club-name-en.mjs --apply --include-manual   # 수동 매핑도 함께 반영
 *
 * 배경: 외국인 트랙(/en)에서 클럽 개별 페이지·메타데이터를 만들려면 영문명이 필요한데
 *       98개 승인 클럽 중 name_en이 채워진 게 1개뿐이었다(2026-08-09 감사).
 *       "Hongdae B1 club opening hours" 같은 클럽명+속성 검색을 잡으려면 이게 선행돼야 함.
 *
 * 분류:
 *   [자동] 등록명이 이미 라틴 문자 위주 → 표기만 정리해서 그대로 사용 (BADASS, Modeci, vurt. 등)
 *   [수동] 한글 등록명 → 아래 MANUAL_MAP 에 적어야 함. 없으면 건너뛰고 목록으로 출력.
 *          음차(도깨비→Dokkaebi)는 기계가 정하면 틀리기 쉬워서 사람이 확정한다.
 *
 * 멱등: 이미 name_en 이 있는 클럽은 절대 덮어쓰지 않는다. 재실행 안전.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// --- .env.local 파싱 (다른 스크립트와 동일 패턴) ---
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const INCLUDE_MANUAL = process.argv.includes("--include-manual");

/**
 * 한글 등록명 → 확정 영문명. 사람이 채운다.
 * 구글 지도·인스타 간판 표기를 그대로 따르는 게 원칙(검색어와 일치해야 함).
 * 여기에 없는 한글 클럽은 스킵되고 실행 끝에 "손봐야 할 목록"으로 출력된다.
 */
const MANUAL_MAP = {
  "도깨비": "Dokkebi",              // 홍대 — Dokkaebi(표준 로마자)가 아닌 Dokkebi로 확정(2026-08-09)
  "K-bat 빠따": "K-Bat",            // 홍대 — ForeignClubDetailPanel 의 기존 fallback과 동일
  "인클 서울": "incl",               // 홍대 — 소문자 표기가 브랜드(vurt. 와 같은 케이스)
  "브리드(BREED)": "BREED",         // 대구 — 등록명 괄호 안이 곧 영문명
  "그루브&스팟": "Groove & Spot",    // 부산
  "반얀트리 풀파티": "Banyan Tree Pool Party", // 이태원
  "코어라운지": "Core Lounge",       // 강남 — 같은 지역의 "Core Seoul" 과 다른 업장이니 주의
};

const HANGUL = /[가-힣ㄱ-ㆎ]/;

/**
 * 라틴 문자 등록명 표기 정리.
 * 전각 문자를 반각으로 바꾸고 공백만 정돈한다.
 * ⚠️ 대소문자는 건드리지 않는다 — "vurt.", "XX", "BADASS" 처럼 표기 자체가 브랜드라
 *    Title Case 로 바꾸면 오히려 실제 간판·검색어와 멀어진다.
 */
function normalizeLatin(name) {
  return name
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, " ")
    .trim();
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const { data: clubs, error } = await supabase
  .from("clubs")
  .select("id, name, name_en, area")
  .eq("status", "approved")
  .is("deleted_at", null)
  .eq("is_test", false)
  .order("area");

if (error) {
  console.error("❌ 클럽 조회 실패:", error.message);
  process.exit(1);
}

const already = clubs.filter((c) => c.name_en?.trim());
const todo = clubs.filter((c) => !c.name_en?.trim());

const auto = [];
const manual = [];
const missing = [];

for (const c of todo) {
  if (HANGUL.test(c.name)) {
    const mapped = MANUAL_MAP[c.name.trim()];
    if (mapped) manual.push({ ...c, next: mapped });
    else missing.push(c);
  } else {
    auto.push({ ...c, next: normalizeLatin(c.name) });
  }
}

console.log(`승인 클럽 ${clubs.length}개 — 이미 채워짐 ${already.length} / 대상 ${todo.length}\n`);

console.log(`■ [자동] 라틴 표기 그대로 사용: ${auto.length}개`);
for (const c of auto) {
  const changed = c.next !== c.name ? `  (정리: "${c.name}")` : "";
  console.log(`   ${c.area.padEnd(5)} ${c.next}${changed}`);
}

if (manual.length) {
  console.log(`\n■ [수동매핑] MANUAL_MAP 적용: ${manual.length}개`);
  for (const c of manual) console.log(`   ${c.area.padEnd(5)} ${c.name} → ${c.next}`);
}

if (missing.length) {
  console.log(`\n■ [손봐야 함] 한글 등록명 + 매핑 없음: ${missing.length}개`);
  console.log("   아래를 MANUAL_MAP 에 채우고 다시 실행하세요 (구글 지도·인스타 간판 표기 기준):");
  for (const c of missing) console.log(`     "${c.name}": "",   // ${c.area}`);
}

const targets = INCLUDE_MANUAL ? [...auto, ...manual] : auto;

if (!APPLY) {
  console.log(`\n미리보기입니다. 반영하려면 --apply 를 붙이세요 (반영 대상 ${targets.length}개).`);
  if (!INCLUDE_MANUAL && manual.length) console.log("수동 매핑까지 반영하려면 --include-manual 도 함께.");
  process.exit(0);
}

console.log(`\n반영 중… (${targets.length}개)`);
let ok = 0;
let fail = 0;
for (const c of targets) {
  // 멱등 방어: 그 사이 누가 채웠으면 덮지 않는다.
  const { error: upErr } = await supabase
    .from("clubs")
    .update({ name_en: c.next })
    .eq("id", c.id)
    .or("name_en.is.null,name_en.eq.");
  if (upErr) {
    fail++;
    console.error(`   ✗ ${c.name}: ${upErr.message}`);
  } else {
    ok++;
  }
}
console.log(`완료 — 성공 ${ok} / 실패 ${fail}`);
if (missing.length) console.log(`남은 수동 작업 ${missing.length}개 (위 목록 참고).`);
