#!/usr/bin/env node
// 오늘(영업일 기준) 라인업 중 "미리듣기 가능한 DJ가 1명 이상 있는" 클럽만 뽑아
// 카드뉴스 제작에 바로 쓸 수 있는 JSON으로 출력한다.
//
// 실행 (반드시 nightflow 디렉토리에서, node_modules의 @supabase/supabase-js를 쓰므로):
//   cd nightflow && node scripts/cardnews/fetch-today-lineup.mjs > /tmp/today-lineup.json
//
// 핵심 가치(카드뉴스의 존재 이유): 미리듣기 -> 라인업 확인 -> 선택 도움.
// 그래서 soundcloud_url도 youtube_url도 없는 DJ는 통째로 버린다 —
// 그 DJ만 있는 셋은 세트에서 빠지고, 셋이 0개가 되는 클럽은 클럽째로 빠진다.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NIGHTFLOW_DIR = resolve(__dirname, "../..");

// nightflow/.env.local을 직접 파싱 (dotenv 의존성 없이)
function loadEnvLocal() {
  const path = resolve(NIGHTFLOW_DIR, ".env.local");
  const text = readFileSync(path, "utf-8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

// src/lib/lineups/time.ts의 getBusinessDateISO / formatBusinessMin과 반드시 동일 로직 유지.
// 라인업 컷오프는 09시(00~08시는 전날 밤의 연장), 영업일 기준 자체는 06시.
const BUSINESS_DAY_CUTOFF_HOUR = 6;
const LINEUP_NIGHT_END_HOUR = 9;

function getBusinessDateISO() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  if (kst.getUTCHours() < BUSINESS_DAY_CUTOFF_HOUR) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  return kst.toISOString().slice(0, 10);
}

function formatBusinessMin(min) {
  if (min === null || min === undefined) return null;
  const shifted = Math.floor(min / 60) + BUSINESS_DAY_CUTOFF_HOUR;
  const h = shifted % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// youtubeUrl.ts와 동일 — 채널 링크(@handle, /channel/)는 임베드가 막혀 재생 불가하므로 미리듣기로 안 침.
function youtubeVideoId(raw) {
  if (!raw) return null;
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/i.exec(raw);
  return m ? m[1] : null;
}

function hasPreview(dj) {
  if (!dj) return false;
  if (dj.soundcloud_url) return true;
  if (dj.youtube_url && youtubeVideoId(dj.youtube_url)) return true;
  return false;
}

function firstOf(v) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("nightflow/.env.local에서 SUPABASE URL/ANON KEY를 못 찾았습니다.");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const today = getBusinessDateISO();

  const { data, error } = await supabase
    .from("club_lineups")
    .select(
      `id, event_date, club_id, door_open_min, event_title,
       clubs(id, name, area, thumbnail_url, is_test, status, deleted_at),
       lineup_sets(start_min, end_min, sort_order, djs(id, slug, display_name, instagram, soundcloud_url, youtube_url))`
    )
    .eq("event_date", today)
    .limit(200);

  if (error) {
    console.error("조회 실패:", error.message);
    process.exit(1);
  }

  const clubs = [];
  for (const r of data ?? []) {
    const club = firstOf(r.clubs);
    if (!club) continue;
    if (club.is_test) continue;
    if (club.deleted_at) continue;
    if (club.status !== "approved") continue;

    const allSets = (r.lineup_sets ?? [])
      .map((s) => ({ ...s, dj: firstOf(s.djs) }))
      .filter((s) => s.dj) // DJ 매칭 자체가 안 된 셋만 버린다
      .sort((a, b) => {
        if (a.start_min !== null && b.start_min !== null) return a.start_min - b.start_min;
        return a.sort_order - b.sort_order;
      })
      .map((s) => ({
        time: formatBusinessMin(s.start_min),
        dj_name: s.dj.display_name,
        dj_slug: s.dj.slug,
        instagram: s.dj.instagram,
        soundcloud_url: s.dj.soundcloud_url,
        youtube_url: s.dj.youtube_url,
        youtube_video_id: youtubeVideoId(s.dj.youtube_url),
        has_preview: hasPreview(s.dj),
      }));

    // 클럽 포함 기준은 그대로: 미리듣기 있는 DJ가 1명도 없으면 클럽째 제외.
    // 다만 포함된 클럽 안에서는 미리듣기 없는 DJ도 리스트업한다(배지만 다르게).
    if (!allSets.some((s) => s.has_preview)) continue;
    const sets = allSets;

    clubs.push({
      lineup_id: r.id,
      club_name: club.name,
      club_area: club.area,
      club_thumbnail: club.thumbnail_url,
      door_open: formatBusinessMin(r.door_open_min),
      event_title: r.event_title,
      sets,
    });
  }

  console.log(JSON.stringify({ date: today, clubs }, null, 2));
}

main();
