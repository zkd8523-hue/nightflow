#!/usr/bin/env node
// fetch-today-lineup.mjs가 뽑은 JSON을 받아 인스타 피드용(1080x1350, 4:5) 카드
// 세트 HTML을 만든다. 카드 1장 = 클럽 1곳(미리듣기 가능한 셋만).
//
// 실행: node scripts/cardnews/build-cards-html.mjs < today-lineup.json > cards.html
//
// 카드 장수 = 표지 1장 + 클럽 수만큼(최대 8클럽, 넘으면 조회수 순 아니라 그냥 앞에서 자름 —
// 선별 기준은 fetch 단계의 "미리듣기 유무"뿐, 인기순 큐레이션은 하지 않는다).

import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf-8"));
const { date, clubs } = input;

const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(date + "T12:00:00+09:00").getDay()];
const dateLabel = `${date.slice(5, 7)}.${date.slice(8, 10)} (${weekday})`;

const BG = "#0A0A0A";
const CARD = "#1C1C1E";
const AMBER = "#FBBF24";

function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function coverCard() {
  return `
  <section class="card cover">
    <div class="cover-inner">
      <div class="eyebrow">TONIGHT'S LINEUP</div>
      <div class="cover-date">${dateLabel}</div>
      <div class="cover-title">오늘 밤,<br/>어디서 놀까</div>
      <div class="cover-sub">미리듣고 고르는 오늘의 라인업</div>
    </div>
    <div class="cover-footer">NIGHTFLOW · nightflow.kr</div>
  </section>`;
}

function clubCard(club, index) {
  const shown = club.sets.slice(0, 6);
  // 셋이 적을수록 행 하나가 커 보이게 — 카드 안이 항상 꽉 차 보여야 한다.
  const density = shown.length <= 2 ? "sparse" : shown.length <= 4 ? "normal" : "dense";

  const setsHtml = shown
    .map((s) => {
      const badge = s.has_preview
        ? `<div class="preview-badge">${s.soundcloud_url ? "SC" : "YT"} 미리듣기</div>`
        : `<div class="preview-badge no-preview">미리듣기 준비중</div>`;
      return `
      <div class="set-row${s.has_preview ? "" : " no-preview-row"}">
        <div class="set-time">${s.time ? escapeHtml(s.time) : ""}</div>
        <div class="set-dj">
          <div class="dj-name">${escapeHtml(s.dj_name)}</div>
          ${s.instagram ? `<div class="dj-ig">@${escapeHtml(s.instagram)}</div>` : ""}
        </div>
        ${badge}
      </div>`;
    })
    .join("");

  return `
  <section class="card club density-${density}">
    <div class="club-header">
      <div class="club-index">${String(index).padStart(2, "0")}</div>
      <div class="club-name">${escapeHtml(club.club_name)}</div>
      <div class="club-area">${escapeHtml(club.club_area || "")}</div>
    </div>
    ${club.event_title ? `<div class="event-title">${escapeHtml(club.event_title)}</div>` : ""}
    <div class="sets">${setsHtml}</div>
    <div class="club-footer">NIGHTFLOW · nightflow.kr</div>
  </section>`;
}

function summaryCard() {
  const rows = clubs
    .map(
      (c) => `
      <div class="summary-row">
        <div class="summary-club">${escapeHtml(c.club_name)}</div>
        <div class="summary-djs">${escapeHtml(c.sets.map((s) => s.dj_name).join(" · "))}</div>
      </div>`
    )
    .join("");

  return `
  <section class="card summary">
    <div class="summary-title">오늘 밤 라인업 한눈에</div>
    <div class="summary-list">${rows}</div>
    <div class="cover-footer">NIGHTFLOW · nightflow.kr</div>
  </section>`;
}

const cardsHtml = [coverCard(), ...clubs.map((c, i) => clubCard(c, i + 1)), summaryCard()].join(
  "\n"
);

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #000;
    font-family: "Pretendard", "Apple SD Gothic Neo", -apple-system, sans-serif;
  }
  .card {
    width: 1080px;
    height: 1350px;
    background: ${BG};
    color: #fff;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 72px 64px;
  }

  /* 표지 */
  .cover-inner { margin-top: 120px; }
  .eyebrow {
    color: ${AMBER};
    font-size: 28px;
    font-weight: 800;
    letter-spacing: 4px;
    margin-bottom: 24px;
  }
  .cover-date { font-size: 40px; font-weight: 700; color: #999; margin-bottom: 40px; }
  .cover-title { font-size: 88px; font-weight: 900; line-height: 1.25; margin-bottom: 32px; }
  .cover-sub { font-size: 34px; color: #ccc; font-weight: 500; }
  .cover-footer { font-size: 26px; color: #666; font-weight: 600; letter-spacing: 1px; }

  /* 클럽 카드 */
  .club-header { display: flex; align-items: baseline; gap: 20px; margin-bottom: 8px; }
  .club-index { font-size: 32px; font-weight: 800; color: ${AMBER}; }
  .club-name { font-size: 56px; font-weight: 900; }
  .club-area {
    font-size: 26px; font-weight: 700; color: #999;
    background: ${CARD}; border-radius: 999px; padding: 6px 20px; margin-left: auto;
  }
  .event-title { font-size: 30px; color: ${AMBER}; font-weight: 700; margin-top: 16px; margin-bottom: 8px; }
  .sets { display: flex; flex-direction: column; gap: 20px; margin-top: 40px; flex: 1; justify-content: center; }
  .set-row {
    display: flex; align-items: center; gap: 24px;
    background: ${CARD}; border-radius: 24px; padding: 28px 32px;
  }
  .set-time { font-size: 32px; font-weight: 800; color: ${AMBER}; min-width: 110px; }
  .set-dj { flex: 1; }
  .dj-name { font-size: 38px; font-weight: 800; }
  .dj-ig { font-size: 24px; color: #999; margin-top: 4px; }
  .preview-badge {
    font-size: 22px; font-weight: 800; color: #000; background: ${AMBER};
    border-radius: 999px; padding: 10px 20px; white-space: nowrap;
  }
  .preview-badge.no-preview { color: #999; background: #333; }
  .no-preview-row .dj-name { color: #ccc; }
  .club-footer { font-size: 26px; color: #666; font-weight: 600; letter-spacing: 1px; }

  /* 셋이 적을수록 행을 키워서 카드가 항상 꽉 차 보이게 */
  .density-sparse .set-row { padding: 44px 40px; }
  .density-sparse .set-time { font-size: 40px; }
  .density-sparse .dj-name { font-size: 48px; }
  .density-sparse .dj-ig { font-size: 28px; }
  .density-dense .set-row { padding: 20px 28px; }
  .density-dense .set-time { font-size: 28px; }
  .density-dense .dj-name { font-size: 32px; }

  /* 요약 카드 */
  .summary-title { font-size: 48px; font-weight: 900; margin-top: 40px; margin-bottom: 48px; }
  .summary-list { display: flex; flex-direction: column; gap: 28px; flex: 1; }
  .summary-row {
    border-left: 6px solid ${AMBER}; padding-left: 28px;
  }
  .summary-club { font-size: 36px; font-weight: 800; margin-bottom: 6px; }
  .summary-djs { font-size: 26px; color: #aaa; font-weight: 500; }
</style>
</head>
<body>
${cardsHtml}
</body>
</html>`;

console.log(html);
