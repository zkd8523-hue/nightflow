#!/usr/bin/env node
// src/lib/lineups/prompt.ts 와 supabase/functions/_shared/lineup-prompt.ts 가
// 같은 LINEUP_SYSTEM_PROMPT / LINEUP_EMIT_TOOL / LINEUP_VISION_MODEL 을 갖고
// 있는지 확인한다. Deno가 npm 경로를 못 읽어 부득이 파일을 복제해 뒀는데,
// 두 파일이 갈라지면 자동/수동 파싱 결과가 미묘하게 달라지는 버그가 생긴다
// (몇 달 뒤에나 발견되는 종류). 이 스크립트를 CI 또는 pre-commit에서 돌린다.

import { readFileSync } from "fs";

const ORIGINAL = "src/lib/lineups/prompt.ts";
const REPLICA = "supabase/functions/_shared/lineup-prompt.ts";

function extractExport(source, name) {
  // `export const NAME = ...` 형태를 다음 최상위 `export`/EOF 직전까지 통째로 추출.
  const startRe = new RegExp(`export const ${name}[\\s\\S]*?=`);
  const startMatch = source.match(startRe);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = source.slice(startIdx);
  const nextExportIdx = rest.search(/\nexport (const|function)/);
  const body = nextExportIdx === -1 ? rest : rest.slice(0, nextExportIdx);
  return body.trim();
}

function normalize(s) {
  // TS 전용 문법(as const), 후행 세미콜론, 따옴표 스타일(' vs ") 차이는
  // 실질 내용이 아니므로 무시하고 비교한다.
  return s
    .replace(/\s+as\s+const/, "")
    .replace(/;\s*$/, "")
    .replace(/'/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const originalSrc = readFileSync(ORIGINAL, "utf8");
const replicaSrc = readFileSync(REPLICA, "utf8");

const NAMES = ["LINEUP_TEXT_MODEL", "LINEUP_VISION_MODEL", "LINEUP_SYSTEM_PROMPT", "LINEUP_EMIT_TOOL"];
let failed = false;

for (const name of NAMES) {
  const a = extractExport(originalSrc, name);
  const b = extractExport(replicaSrc, name);
  if (!a || !b) {
    console.error(`❌ ${name} 을 한쪽 파일에서 찾을 수 없습니다 (${ORIGINAL} 또는 ${REPLICA})`);
    failed = true;
    continue;
  }
  if (normalize(a) !== normalize(b)) {
    console.error(`❌ ${name} 이 두 파일 사이에 다릅니다.`);
    console.error(`   ${ORIGINAL}: ${normalize(a).slice(0, 120)}...`);
    console.error(`   ${REPLICA}:  ${normalize(b).slice(0, 120)}...`);
    failed = true;
  } else {
    console.log(`✅ ${name} 일치`);
  }
}

if (failed) {
  console.error("\n프롬프트 동기화 실패. src/lib/lineups/prompt.ts 를 고쳤다면 supabase/functions/_shared/lineup-prompt.ts 도 같이 고치세요.");
  process.exit(1);
}
console.log("\n프롬프트 동기화 확인 완료.");
