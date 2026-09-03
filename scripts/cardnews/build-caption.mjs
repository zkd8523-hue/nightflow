#!/usr/bin/env node
// fetch-today-lineup.mjs가 뽑은 JSON을 받아 인스타 캡션 텍스트를 만든다.
//
// 인스타 피드 캐러셀은 슬라이드별 캡션/링크/오디오를 지원하지 않는다 —
// 캡션도 댓글도 URL이 텍스트로만 보이고 클릭이 안 된다(사용자 확인,
// 2026-09-02). 그래서 캡션에 URL을 나열하지 않는다.
//
// 캡션 본문은 한 줄로 고정한다(사용자 확정, 2026-09-03: "항상 자동으로
// 만들어내야 하니까 짧은 게 리스크 낮다"). 클럽명·DJ명 목록은 이미 카드
// 자체에 다 있으니 캡션에서 다시 나열할 필요가 없고, 자동 생성 텍스트가
// 길어질수록 어색한 문장이나 깨진 나열이 나올 여지도 커진다 — 한 줄이면
// 그 표면적이 최소화된다.
//
// 실행: node scripts/cardnews/build-caption.mjs < today-lineup.json > caption.txt

import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf-8"));
const { date, clubs, area } = input;

const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(date + "T12:00:00+09:00").getDay()];
// "오늘밤"은 캡션을 작성/게시하는 날과 실제 라인업 날짜가 같을 때만 맞는
// 말이다. 이 스킬은 주말치를 며칠 전에 미리 만들어 큐에 걸어두는 용도로도
// 쓰이므로, 발행 시점과 무관하게 항상 맞는 "{요일}요일 밤"으로 고정한다.
const nightLabel = `${weekday}요일 밤`;

const lines = [];
lines.push(`${nightLabel}, 어디 갈지 아직 못 정했다면 프로필 링크에서 확인하세요.`);
lines.push("");

// DJ 인스타 태그 — 클럽 계정들이 라인업을 올릴 때 쓰는 방식(@계정 나열)을
// 따른다. 노출과 관계 양쪽에 도움이 되고, 태그된 DJ가 스토리로 재공유하는
// 경로도 생긴다(사용자 요청, 2026-09-03).
//
// ⚠️ 감성 서사("한 달 동안 우리의 밤을…" 같은)는 쓰지 않는다. 그런 문장은
// 실제로 겪은 일을 적는 것이라 자동 생성으로 지어내면 거짓말이 된다.
// 여기서는 데이터로 100% 확인되는 것(누가 서는지)만 사실대로 적는다.
//
// 인스타 계정 데이터 품질 실측(2026-09-03): DJ 916명 중 655명(72%) 보유,
// 형식 오류 0건. 중복 12건은 전부 "같은 DJ가 표기만 다르게 두 번 등록된"
// 경우라 남의 계정이 잘못 붙는 위험은 확인되지 않았다.
const igHandles = [
  ...new Set(
    clubs.flatMap((c) => c.sets.map((s) => s.instagram).filter(Boolean))
  ),
];
// 한글 받침 유무로 을/를을 고른다 — "이태원을", "강남을", "홍대를".
// "이태원을(를)"처럼 괄호 표기가 캡션에 나가면 자동 생성 티가 확 난다.
function withObjectParticle(word) {
  const last = word.charCodeAt(word.length - 1);
  const hasJongseong = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${word}${hasJongseong ? "을" : "를"}`;
}

if (igHandles.length > 0) {
  lines.push(`오늘 ${area ? `${withObjectParticle(area)} ` : ""}빛낼 DJ들`);
  lines.push(igHandles.map((h) => `@${h}`).join(" "));
  lines.push("");
}

// 해시태그는 공백이 있으면 인스타에서 첫 단어까지만 태그로 인식하고
// 나머지가 그냥 텍스트로 떨어져 나간다 — "Lion Super Club"처럼 클럽명에
// 공백이 흔하므로 반드시 제거한다(괄호도 태그에 못 쓰는 문자라 같이 제거).
function toHashtag(name) {
  return `#${name.replace(/[()]/g, "").replace(/\s+/g, "")}`;
}

// 장르(House/Techno/EDM/HipHop/RnB/Global, Migration 616)는 사운드클라우드
// 프로필에서 자동 수집되므로 없는 DJ도 많다 — 있는 것만 세서, 이 편에서
// 가장 많이 등장한 장르 상위 2개만 해시태그로 올린다(전부 올리면 장르
// 자체가 희석된다).
const GENRE_HASHTAG = {
  House: "#하우스",
  Techno: "#테크노",
  EDM: "#EDM",
  HipHop: "#힙합",
  RnB: "#RnB",
  Global: "#글로벌",
};
const genreCounts = new Map();
for (const c of clubs) {
  for (const s of c.sets) {
    if (!s.genre) continue;
    genreCounts.set(s.genre, (genreCounts.get(s.genre) ?? 0) + 1);
  }
}
const topGenreTags = [...genreCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 2)
  .map(([g]) => GENRE_HASHTAG[g])
  .filter(Boolean);

const hashtags = [
  "#나이트플로우",
  "#오늘의라인업",
  "#DJ라인업",
  "#클럽라인업",
  ...topGenreTags,
  ...new Set(
    clubs.flatMap((c) => [toHashtag(c.club_name), c.club_area ? `#${c.club_area}클럽` : null].filter(Boolean))
  ),
  "#미리듣기",
  "#클럽스타그램",
].slice(0, 20);

lines.push(hashtags.join(" "));

console.log(lines.join("\n"));
