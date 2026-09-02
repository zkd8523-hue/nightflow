#!/usr/bin/env node
// fetch-today-lineup.mjs가 뽑은 JSON을 받아 인스타 캡션 텍스트를 만든다.
//
// 인스타 피드 캐러셀은 슬라이드별 캡션/링크/오디오를 지원하지 않는다 —
// 캡션은 게시물 전체에 1개뿐이고 클릭도 안 된다(텍스트로만 보임).
// 그래서 "카드 순서대로 이 DJ의 미리듣기는 여기" 흐름을 캡션 안에
// 텍스트로 재현한다: 카드 번호 -> 클럽명 -> DJ별 미리듣기 링크.
//
// 실행: node scripts/cardnews/build-caption.mjs < today-lineup.json > caption.txt

import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf-8"));
const { date, clubs } = input;

const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(date + "T12:00:00+09:00").getDay()];
const dateLabel = `${date.slice(5, 7)}.${date.slice(8, 10)} (${weekday})`;

const lines = [];
lines.push(`${dateLabel}, 오늘 밤 라인업이에요.`);
lines.push("");
lines.push("사진 넘기면서 클럽 확인하고, 아래 링크로 DJ 믹셋 미리 들어보세요.");
lines.push("");

clubs.forEach((club, i) => {
  const cardNo = i + 2; // 카드 1장 = 표지이므로 클럽은 2번째 슬라이드부터
  lines.push(`${cardNo}️⃣ ${club.club_name}${club.club_area ? ` (${club.club_area})` : ""}`);
  for (const s of club.sets) {
    const link = s.soundcloud_url || s.youtube_url;
    lines.push(link ? `　🎧 ${s.dj_name} — ${link}` : `　${s.dj_name}`);
  }
  lines.push("");
});

lines.push("오늘 밤 어디로 갈지, 듣고 골라보세요.");
lines.push("");

const hashtags = [
  "#나이트플로우",
  "#오늘의라인업",
  "#DJ라인업",
  "#클럽라인업",
  ...new Set(clubs.flatMap((c) => [`#${c.club_name.replace(/[()]/g, "")}`, c.club_area ? `#${c.club_area}클럽` : null].filter(Boolean))),
  "#미리듣기",
  "#클럽스타그램",
].slice(0, 20);

lines.push(hashtags.join(" "));

console.log(lines.join("\n"));
