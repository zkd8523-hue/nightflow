/**
 * 구글 리뷰 번역 누락 점검 (읽기 전용 — DB에 쓰지 않음, 유료 API 호출 없음)
 *
 * 언제: ingest-google-ratings.mjs로 리뷰를 다시 받은 뒤. 새로 들어온 리뷰는 번역 파일
 *       (src/data/review-translations/{ja,zh,zh-tw}.json)에 키가 없어서 /ja·/zh·/zh-tw에서 숨겨진다.
 * 사용: node scripts/check-review-translations.mjs [출력경로.json]
 *       → 언어별 누락 개수를 찍고, 번역할 원문을 {hash: {club, text}} JSON으로 저장(기본 /tmp/review-missing.json).
 * 번역: 그 JSON을 Claude에게 주고 "ja·zh·zh-tw로 번역해서 번역 파일에 합쳐줘"라고 하면 된다.
 *       규칙(욕설 순화, 클럽·DJ명 라틴 표기 유지, 번체는 대만 어휘)은 lib/clubs/reviewI18n.ts 머리 주석 참고.
 * 키: 원문(trim) sha1 앞 12자리 — lib/clubs/reviewI18n.ts의 reviewKey와 반드시 같아야 한다.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// reviewI18n.ts의 isHiddenReview와 같은 규칙 — 숨길 리뷰는 번역 대상에서 뺀다.
const CONTACT_RE = /\b(line|wechat|we\s*chat|whats\s*app|kakao(?:\s*talk)?|telegram|tg)\s*(id)?\s*[:：]\s*\S+/i;
const NO_CONTENT_RE = /^[\d\s/.\-:]+$/;
const key = (t) => createHash("sha1").update(t.trim()).digest("hex").slice(0, 12);

const { data, error } = await sb
  .from("clubs")
  .select("name, name_en, is_test, google_reviews")
  .not("google_reviews", "is", null);
if (error) { console.error(error); process.exit(1); }

const dicts = Object.fromEntries(
  ["ja", "zh", "zh-tw"].map((l) => [l, JSON.parse(readFileSync(`src/data/review-translations/${l}.json`, "utf8"))]),
);
const missing = {};
let total = 0;
for (const c of data) {
  if (c.is_test) continue;
  for (const r of c.google_reviews ?? []) {
    const t = r?.text?.trim();
    if (!t || CONTACT_RE.test(t) || NO_CONTENT_RE.test(t)) continue;
    total++;
    const k = key(t);
    if (Object.values(dicts).some((d) => !d[k])) missing[k] = { club: c.name_en || c.name, text: t };
  }
}
for (const [l, d] of Object.entries(dicts)) {
  const n = Object.keys(missing).filter((k) => !d[k]).length;
  console.log(`${l}: 누락 ${n} / 전체 ${total}`);
}
const out = process.argv[2] || "/tmp/review-missing.json";
writeFileSync(out, JSON.stringify(missing, null, 1));
console.log(`번역할 원문 ${Object.keys(missing).length}개 → ${out}`);
