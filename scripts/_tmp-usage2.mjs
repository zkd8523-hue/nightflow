import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env={}; for (const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
// 8/26 대량수집: Sonnet Vision 184회 × max_tokens 8000 = 여기가 폭탄
const { data } = await sb.from("lineup_drafts").select("created_at,parsed,poster_url").gte("created_at","2026-08-26").lt("created_at","2026-08-27");
console.log(`8/26 draft ${data.length}건`);
// 캡션 길이로 입력 토큰 추정
const { data:cap } = await sb.from("lineup_drafts").select("ig_caption").gte("created_at","2026-08-26").lt("created_at","2026-08-27");
const avgLen=cap.reduce((s,r)=>s+String(r.ig_caption??"").length,0)/cap.length;
console.log(`평균 캡션 ${Math.round(avgLen)}자`);
console.log(`
=== 비용 추정 (8/26 하루) ===
Haiku 252회 × (프롬프트 ~4k + 캡션) ≈ 입력 1.3M 토큰 → $1.0 안팎
Sonnet Vision 184회:
  이미지 1장 ≈ 1,600 토큰 + 프롬프트 4k + 출력 최대 8k
  입력  184 × 5.6k = 1.03M 토큰 × $3/M  = $3.1
  출력  184 × 2k(실측 평균 가정) = 368k × $15/M = $5.5
  → Sonnet만 $8~9
8/26 하루에 $10 안팎. 이게 8/26 충전($16.58)의 대부분.`);
