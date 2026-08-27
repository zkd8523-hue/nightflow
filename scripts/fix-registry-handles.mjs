/**
 * club_name_registry 의 instagram_handle 을 clubs.instagram(사람이 확인한 값)으로 정정.
 *
 * 왜: 캡션에서 주운 핸들이 원문 자체로 잘려 있는 경우가 있다(BREED:
 * "contact Dm @breed_officia" — 정답은 breed_official). 그게 registry 에 들어가면
 * 감시 목록에 없는 핸들이 하나 생겨 매일 not_found 로 뜬다.
 * 사용: DRY_RUN=1 node scripts/fix-registry-handles.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const DRY = process.env.DRY_RUN === "1";
const env = {};
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clubs } = await sb.from("clubs").select("id,instagram").not("instagram","is",null);
const byId = new Map(clubs.map(c => [c.id, c.instagram.trim().replace(/^@/,"")]));

const { data: reg } = await sb.from("club_name_registry")
  .select("name_raw,instagram_handle,matched_club_id").not("matched_club_id","is",null);

let fixed = 0;
for (const r of reg ?? []) {
  const correct = byId.get(r.matched_club_id);
  if (!correct || correct === r.instagram_handle) continue;
  console.log(`${DRY?"[예상]":"[수정]"} ${r.name_raw}: "${r.instagram_handle ?? "(없음)"}" → "${correct}"`);
  if (!DRY) {
    const { error } = await sb.from("club_name_registry")
      .update({ instagram_handle: correct }).eq("name_raw", r.name_raw);
    if (error) { console.log("   ⚠️ " + error.message); continue; }
  }
  fixed++;
}
console.log(`\n${DRY?"예상":"완료"}: ${fixed}건`);
