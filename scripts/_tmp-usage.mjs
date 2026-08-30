import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env={}; for (const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// draft = LLM 호출 흔적. parsed 있으면 최소 1회(Haiku), Vision까지 갔으면 +1회(Sonnet)
const { data:dr } = await sb.from("lineup_drafts").select("created_at,parsed,poster_url,status");
const byDay={};
for(const r of dr){
  const d=r.created_at.slice(0,10);
  (byDay[d] ??= {haiku:0, vision:0, total:0});
  byDay[d].total++;
  if(r.parsed) byDay[d].haiku++;
  if(r.poster_url) byDay[d].vision++;   // 포스터 저장 = Vision 경로를 탄 것
}
console.log("날짜별 LLM 호출 추정 (draft 기준)");
console.log("일자         draft  Haiku  Vision(Sonnet)");
for(const [d,v] of Object.entries(byDay).sort()) 
  console.log(`  ${d}   ${String(v.total).padStart(3)}   ${String(v.haiku).padStart(3)}    ${String(v.vision).padStart(3)}`);

const tot=Object.values(byDay).reduce((a,v)=>({h:a.h+v.haiku,s:a.s+v.vision}),{h:0,s:0});
console.log(`\n누적: Haiku ${tot.h}회 / Sonnet(Vision) ${tot.s}회`);
