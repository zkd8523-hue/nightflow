#!/usr/bin/env node
// 오늘(영업일 기준) 라인업 중 "미리듣기 가능한 DJ가 1명 이상 있는" 클럽만 뽑아
// 카드뉴스 제작에 바로 쓸 수 있는 JSON으로 출력한다.
//
// 실행 (반드시 nightflow 디렉토리에서, node_modules의 @supabase/supabase-js를 쓰므로):
//   cd nightflow && node scripts/cardnews/fetch-today-lineup.mjs > /tmp/today-lineup.json
//   node scripts/cardnews/fetch-today-lineup.mjs --date=2026-09-04 --area=홍대 > /tmp/hongdae-fri.json
//
// --date: 조회할 영업일(YYYY-MM-DD). 생략하면 오늘.
// --area: club_area가 이 값과 정확히 일치하는 클럽만 남긴다(지역편 발행용). 생략하면 전체.
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

function parseArgs() {
  const args = { date: null, area: null, first: null };
  for (const arg of process.argv.slice(2)) {
    const m = /^--(date|area|first)=(.+)$/.exec(arg);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("nightflow/.env.local에서 SUPABASE URL/ANON KEY를 못 찾았습니다.");
    process.exit(1);
  }

  const { date: dateArg, area: areaArg, first: firstArg } = parseArgs();
  const supabase = createClient(url, key);
  const today = dateArg || getBusinessDateISO();

  const { data, error } = await supabase
    .from("club_lineups")
    .select(
      `id, event_date, club_id, door_open_min, event_title,
       clubs(id, name, area, address, operating_hours, entry_fee_detail, thumbnail_url, is_test, status, deleted_at),
       lineup_sets(start_min, end_min, sort_order, djs(id, slug, display_name, instagram, soundcloud_url, youtube_url, genre))`
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
    if (areaArg && club.area !== areaArg) continue;

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
        // Migration 616: House/Techno/EDM/HipHop/RnB/Global 6종 중 하나 또는
        // null(아직 수집 안 됨). 사운드클라우드 프로필에서 자동 수집한 값이라
        // 신뢰도가 100%는 아니지만(genre_confidence 컬럼 별도 존재), 카드뉴스
        // 해시태그(#하우스 등) 정도의 용도로는 충분하다.
        genre: s.dj.genre,
      }));

    // 클럽 포함 기준: 라인업(DJ)이 있으면 포함한다. 미리듣기 유무는 안 본다.
    //
    // 예전엔 "미리듣기 가능한 DJ가 1명도 없으면 클럽째 제외"였는데, 실제로
    // 그 때문에 서비스 화면과 카드뉴스의 클럽 수가 어긋났다(2026-09-03:
    // 강남 9/3이 사이트엔 3곳인데 카드뉴스는 2곳 — Orgasm Valley가 DJ 3명
    // 전원 링크 없어 빠짐). 사용자 확정으로 이 필터를 걷어냈다.
    // 미리듣기 배지는 있는 DJ에만 붙으므로, 링크 없는 클럽은 배지 없이 나온다.
    const sets = allSets;

    clubs.push({
      lineup_id: r.id,
      club_id: club.id,
      club_name: club.name,
      club_area: club.area,
      club_address: club.address,
      club_operating_hours: club.operating_hours,
      club_entry_fee: club.entry_fee_detail,
      club_thumbnail: club.thumbnail_url,
      door_open: formatBusinessMin(r.door_open_min),
      event_title: r.event_title,
      sets,
    });
  }

  // --first=클럽명 이 오면 그 클럽을 맨 앞으로 보낸다. 표지 히어로 사진이
  // 첫 클럽 대표사진이라, "이 클럽을 표지에 세우고 싶다"는 요구를 이걸로
  // 해결한다. 아래 6곳 상한보다 먼저 적용해야 잘려나가지 않는다.
  // 부분 일치(대소문자 무시) — "딥스"로 등록된 Dibs처럼 표기가 갈릴 수 있다.
  if (firstArg) {
    const idx = clubs.findIndex((c) =>
      c.club_name.toLowerCase().includes(firstArg.toLowerCase())
    );
    if (idx > 0) {
      const [picked] = clubs.splice(idx, 1);
      clubs.unshift(picked);
    } else if (idx === -1) {
      console.error(`[경고] --first="${firstArg}"와 일치하는 클럽이 없습니다. 원래 순서를 유지합니다.`);
    }
  }

  // 지역편은 클럽 3곳 이상일 때만 만든다(사용자 확정, 2026-09-03 —
  // 처음엔 "이태원/홍대/강남은 무조건 지역편"이었다가, 실제로 홍대가
  // 1클럽뿐인 날에도 지역편이 나오는 걸 보고 "모든 지역 공통 3곳 이상"
  // 규칙으로 정정함). 미달이면 빈 결과를 그냥 안 내고 에러로 명확히
  // 알린다 — 그래야 실수로 1~2클럽짜리 지역편을 만드는 걸 스크립트가
  // 막아준다. 전체 발행(--area 없음)에는 이 기준을 적용하지 않는다.
  if (areaArg && clubs.length < 3) {
    console.error(
      `[${areaArg}] ${today} 라인업이 있는 클럽이 ${clubs.length}곳뿐입니다 ` +
        `(지역편 최소 기준: 3곳). 이 지역은 오늘 지역편 대상이 아닙니다.`
    );
    process.exit(1);
  }

  // 클럽 수 상한 — 인스타 캐러셀은 최대 20장이고, 그 전에 사람이 끝까지
  // 넘겨보지도 않는다. 미리듣기 필터를 걷어내면서 클럽이 확 늘어(이태원
  // 9/5가 11곳 = 카드 21장으로 인스타 한도 초과) 상한이 필요해졌다.
  // 6곳이면 표지 + 6장 + 요약 = 8장으로 끝까지 볼 만한 분량이다
  // (사용자 확정, 2026-09-03).
  //
  // 자를 때는 미리듣기 가능한 DJ가 있는 클럽을 우선 남긴다 — 이 카드뉴스의
  // 존재 이유가 "미리듣고 고르기"라서, 잘려나갈 클럽을 고를 땐 그 가치를
  // 살리는 쪽이 맞다. 같은 조건이면 원래 순서를 유지한다(안정 정렬).
  // ⚠️ --first로 지정한 클럽(index 0)은 미리듣기 유무와 무관하게 항상 남긴다 —
  // "이 클럽을 표지에 세워달라"는 명시적 지시가 자동 우선순위보다 위다.
  const MAX_CLUBS = 6;
  let picked = clubs;
  if (clubs.length > MAX_CLUBS) {
    picked = clubs
      .map((c, i) => ({ c, i, hasPreview: c.sets.some((s) => s.has_preview) }))
      .sort((a, b) => {
        if (firstArg && (a.i === 0 || b.i === 0)) return a.i === 0 ? -1 : 1;
        return (b.hasPreview - a.hasPreview) || (a.i - b.i);
      })
      .slice(0, MAX_CLUBS)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.c);
    console.error(
      `[${areaArg || "전체"}] 클럽 ${clubs.length}곳 중 ${MAX_CLUBS}곳만 사용합니다 ` +
        `(인스타 캐러셀 분량 상한). 제외: ${clubs.filter((c) => !picked.includes(c)).map((c) => c.club_name).join(", ")}`
    );
  }

  // --area로 필터링했으면 그 지역명을 출력에도 담는다 — build-cards-html.mjs가
  // 이 최상위 area 필드를 읽어 표지 문구(지역 배지·타이틀)를 바꾼다.
  // 예전엔 필터링에만 쓰고 출력에 안 넣어서, 실제 파이프라인으로 만든
  // 지역편 표지가 지역명 없이 나오는 버그가 있었다(2026-09-03 발견).
  console.log(JSON.stringify({ date: today, area: areaArg || null, clubs: picked }, null, 2));
}

main();
