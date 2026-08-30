/**
 * 사클 계정이 있는 DJ의 아트워크(oEmbed thumbnail_url)를 djs.soundcloud_artwork_url 에 채운다.
 *
 * 선행: Migration 612 (soundcloud_artwork_url 컬럼)
 *
 * oEmbed 는 키·등록 없이 열려 있고 프로필 URL 을 그대로 받는다. 다만 카드가
 * 보일 때마다 부르면 첫 페인트가 외부 응답을 기다리므로, 주소를 한 번 받아 저장한다.
 *
 * 사용:
 *   DRY_RUN=1 node scripts/backfill-dj-artwork.mjs
 *   node scripts/backfill-dj-artwork.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: djs, error } = await sb
  .from("djs")
  .select("id, display_name, soundcloud_url, soundcloud_artwork_url")
  .not("soundcloud_url", "is", null)
  .is("deleted_at", null)
  .eq("is_test", false);

if (error) {
  // 컬럼이 없으면 마이그레이션 미적용 — 조용히 0건이 아니라 이유를 알려준다
  throw new Error(
    `djs 조회 실패: ${error.message}\n(soundcloud_artwork_url 컬럼이 없다면 Migration 612 를 먼저 적용하세요)`
  );
}

const targets = (djs ?? []).filter((d) => !d.soundcloud_artwork_url);
console.log(`🎯 대상 ${targets.length}명 (사클 보유 ${djs?.length ?? 0}명 중 아트워크 없음)\n`);

let ok = 0;
let miss = 0;
for (const d of targets) {
  try {
    const res = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(d.soundcloud_url)}`
    );
    if (!res.ok) {
      miss++;
      console.log(`  ⏭  ${d.display_name} — oEmbed ${res.status}`);
    } else {
      const j = await res.json();
      const url = j.thumbnail_url ?? null;
      // 저장 가능한 건 i1.sndcdn.com 실제 아트워크뿐이다.
      //  - avatars-default: 계정 사진 없음 → 회색 원이라 이니셜만 못하다
      //  - soundcloud.com/images/fb_placeholder.png: 사클 기본 OG 이미지.
      //    next.config.ts remotePatterns에 i1.sndcdn.com만 등록돼 있어서
      //    이걸 저장하면 next/image가 "hostname not configured"로 예외를
      //    던지고 에러 바운더리가 페이지를 통째로 덮는다(실측: DJ컵에서
      //    해당 DJ가 매치에 나오는 순간 화면 전체가 회색 박스로 바뀜).
      // 그래서 정규식 블랙리스트가 아니라 호스트 화이트리스트로 판정한다.
      if (!url || !/^https:\/\/i1\.sndcdn\.com\//i.test(url) || /avatars-default/i.test(url)) {
        miss++;
        console.log(`  ⏭  ${d.display_name} — 아트워크 없음`);
      } else {
        if (!DRY_RUN) {
          const { error: upErr } = await sb
            .from("djs")
            .update({ soundcloud_artwork_url: url })
            .eq("id", d.id);
          if (upErr) {
            console.log(`  ❌ ${d.display_name}: ${upErr.message}`);
            continue;
          }
        }
        ok++;
        console.log(`  ✅ ${d.display_name.padEnd(18)} ${url}`);
      }
    }
  } catch (e) {
    miss++;
    console.log(`  ⏭  ${d.display_name} — ${String(e?.message ?? e).slice(0, 60)}`);
  }
  await sleep(250);
}

console.log(`\n확보 ${ok}건 / 없음 ${miss}건`);
if (DRY_RUN) console.log("(DRY RUN — 저장하지 않음)");
