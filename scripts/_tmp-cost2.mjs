import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env={}; for (const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 정상 cron 일자만 (8/27,28,29) — 8/26 초기수집·8/30 수동반복 제외
const { data } = await sb.from("lineup_drafts")
  .select("created_at,parsed,poster_url,ig_caption")
  .gte("created_at","2026-08-27").lt("created_at","2026-08-30");

const days={};
for(const r of data){ const d=r.created_at.slice(0,10); (days[d] ??= {n:0,v:0,capLen:0}); 
  days[d].n++; if(r.poster_url) days[d].v++; days[d].capLen+=String(r.ig_caption??"").length; }
console.log("정상 운영일:");
for(const [d,v] of Object.entries(days).sort()) console.log(`  ${d}: draft ${v.n} / Vision ${v.v}`);

const totN=Object.values(days).reduce((a,v)=>a+v.n,0);
const totV=Object.values(days).reduce((a,v)=>a+v.v,0);
const nDay=Object.keys(days).length;
console.log(`\n하루 평균: draft ${(totN/nDay).toFixed(1)} / Vision ${(totV/nDay).toFixed(1)}`);

// 실제 출력 크기 측정 — parsed JSON 길이로 출력 토큰 추정 (1토큰≈3.5자)
const withP=data.filter(r=>r.parsed);
const outChars=withP.map(r=>JSON.stringify(r.parsed).length);
const avgOut=outChars.reduce((a,b)=>a+b,0)/outChars.length;
console.log(`실제 출력 평균 ${Math.round(avgOut)}자 ≈ ${Math.round(avgOut/3.5)} 토큰 (max_tokens 8000 대비 ${(avgOut/3.5/8000*100).toFixed(1)}%)`);

// 프롬프트 크기
const sys=readFileSync("supabase/functions/_shared/lineup-prompt.ts","utf8");
console.log(`시스템 프롬프트 ${sys.length}자 ≈ ${Math.round(sys.length/3.5)} 토큰`);
