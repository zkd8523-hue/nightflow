#!/usr/bin/env node
// 인스타 릴스 밈 포맷 합성기 (asadshotchicken 스타일).
//
// 구조: 배경은 pour.png 한 장이 위아래로 관통하고, 그 위에
// 인스타 UI 레이어(상단 계정 헤더 / 중간 인터랙션 바 / 하단 댓글)를 얹는다.
// AI가 한글·아이콘·숫자를 매번 깨뜨리므로 UI는 전부 HTML/CSS로 그린다.
//
// 실행: node build.mjs  ->  out.png (1080x1920)

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataUri = (f, mime = "image/png") =>
  `data:${mime};base64,${readFileSync(resolve(__dirname, f)).toString("base64")}`;

const POUR = dataUri("pour.png");
const STREAM = dataUri("stream.png"); // 액체만 남긴 투명 레이어
const AVATAR = dataUri("avatar.png");

const HANDLE = "nightflow.kr";
const CAPTION = "추석 맞아 데낄라 부으러 갈 친구한테 공유!";
const COMMENT = "오늘 라인업 어디서 봐요?";
const COMMENT_REPLY = "프로필 링크 ㄱ";

// 인터랙션 바가 화면 어디에 걸리는지 — 원본은 액체 줄기 중간을 딱 가른다.
// pour.png에서 줄기가 길게 내려오는 구간이 대략 세로 30~60% 이므로 45%에 둔다.
const BAR_TOP_PCT = 38;
// 병 위 여백 — 인스타가 자동으로 얹는 상단 UI에 병이 가리지 않도록 띄운다.
const PHOTO_TOP = 150;

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; background: #000;
         font-family: 'Noto Sans KR', -apple-system, sans-serif; overflow: hidden; }

  .frame { position: relative; width: 1080px; height: 1920px; overflow: hidden; }

  /* 배경 사진 — 위아래를 관통해야 하므로 프레임 전체를 덮는다 */
  .photo { position: absolute; left: 0; right: 0; top: ${PHOTO_TOP}px;
           width: 100%; height: calc(100% - ${PHOTO_TOP}px);
           object-fit: cover; object-position: center top;
           background: #EDEDED; }
  /* 사진 위 여백 — 단색으로 메우면 사진 상단(좌우 밝기가 다름)과 경계가
     드러난다. 사진 맨 윗줄을 세로로 늘려 채워 이음새를 없앤다. */
  .fill { position: absolute; inset: 0; background: #EDEDED; z-index: 0; }
  .fill-top { position: absolute; left: 0; right: 0; top: 0;
              height: ${PHOTO_TOP + 2}px; overflow: hidden; z-index: 0; }
  .fill-top img { position: absolute; left: 0; top: 0; width: 100%;
                  height: 100%; object-fit: fill;
                  object-position: center top;
                  /* 원본의 맨 윗줄 1px만 잡아 늘린다 */
                  clip-path: inset(0 0 99.9% 0); transform: scaleY(2000);
                  transform-origin: top; }

  /* 줄기 오버레이 — 바를 덮고 지나가는 액체만 잘라서 최상단에 */
  .stream { position: absolute; left: 0; right: 0; top: ${PHOTO_TOP}px;
            width: 100%; height: calc(100% - ${PHOTO_TOP}px);
            object-fit: cover; object-position: center top;
            z-index: 5; pointer-events: none;
            /* 바를 덮는 구간만 남긴다 — 정확한 값은 렌더 직전에 실측해서 넣는다 */
            clip-path: inset(0 0 100% 0); }

  /* ── 상단 계정 헤더 ── */
  .top { position: absolute; top: 0; left: 0; right: 0; padding: 34px 32px 28px;
         display: flex; align-items: center; gap: 22px; z-index: 3;
         background: linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%); }
  .top .av { width: 84px; height: 84px; border-radius: 50%; object-fit: cover;
             border: 3px solid transparent;
             background: linear-gradient(45deg,#F9CE34,#EE2A7B,#6228D7) border-box;
             padding: 3px; }
  .top .meta { flex: 1; min-width: 0; }
  .top .name { display: flex; align-items: center; gap: 10px;
               color: #fff; font-size: 40px; font-weight: 700; letter-spacing: -0.3px; }
  .verified { width: 34px; height: 34px; }
  .top .music { display: flex; align-items: center; gap: 10px; margin-top: 6px;
                color: rgba(255,255,255,0.92); font-size: 30px; font-weight: 400; }
  .follow { border: 2px solid rgba(255,255,255,0.85); border-radius: 12px;
            padding: 14px 34px; color: #fff; font-size: 32px; font-weight: 700;
            white-space: nowrap; }
  .burger { display: flex; flex-direction: column; gap: 9px; margin-left: 26px; }
  .burger i { display: block; width: 44px; height: 4px; border-radius: 2px;
              background: #fff; }
  .burger i:last-child { width: 32px; margin-left: auto; }

  /* ── 중간 인터랙션 바 (원본의 핵심 — 여기를 액체가 관통) ── */
  .bar { position: absolute; left: 0; right: 0; top: ${BAR_TOP_PCT}%;
         padding: 30px 34px 34px; z-index: 6; }
  /* 검은 배경만 액체 아래로 내린다 — 텍스트는 액체 위에 남아 안 가려짐 */
  .bar-bg { position: absolute; left: 0; right: 0; background: #0D0D0D; z-index: 2; }
  .actions { display: flex; align-items: center; gap: 56px;
             position: relative; z-index: 6; }
  .act { display: flex; align-items: center; gap: 16px;
         color: #fff; font-size: 38px; font-weight: 700; }
  .act svg { width: 52px; height: 52px; flex: none; }
  .act.save { margin-left: auto; gap: 0; }

  .cap { margin-top: 26px; color: #fff; font-size: 38px; line-height: 1.34;
         letter-spacing: -0.3px; position: relative; z-index: 6; }
  .cap b { font-weight: 700; margin-right: 18px; }
  .cap span { font-weight: 400; }

  .byline { display: flex; align-items: center; gap: 20px; margin-top: 28px;
            position: relative; z-index: 6; }
  .byline img { width: 62px; height: 62px; border-radius: 50%; object-fit: cover;
                border: 2.5px solid transparent;
                background: linear-gradient(45deg,#F9CE34,#EE2A7B,#6228D7) border-box;
                padding: 2.5px; }
  .byline .h { color: #fff; font-size: 36px; font-weight: 700; }
  .byline .dots { margin-left: auto; color: #fff; font-size: 44px;
                  letter-spacing: 4px; line-height: 0.6; }

  /* ── 하단 댓글 ── */
  .comments { position: absolute; left: 0; right: 0; bottom: 0; z-index: 3;
              padding: 40px 34px 56px;
              background: linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.82) 45%, rgba(0,0,0,0.45) 78%, rgba(0,0,0,0) 100%); }
  .c { display: flex; gap: 20px; margin-bottom: 26px; }
  .c .cav { width: 60px; height: 60px; border-radius: 50%; flex: none;
            display: flex; align-items: center; justify-content: center;
            font-size: 30px; font-weight: 700; color: #fff; }
  .c .body { flex: 1; min-width: 0; }
  .c .who { color: rgba(255,255,255,0.72); font-size: 28px; font-weight: 500; }
  .c .txt { color: #fff; font-size: 34px; font-weight: 400; margin-top: 4px;
            line-height: 1.3; }
  .c.reply { margin-left: 80px; }
  .c.reply .txt b { font-weight: 700; color: #7CC4FF; }
  .c .heart { align-self: center; color: rgba(255,255,255,0.55); font-size: 28px; }
</style></head>
<body>
<div class="frame">
  <div class="fill"></div>
  <div class="fill-top"><img src="${POUR}"></div>
  <img class="photo" src="${POUR}">
  <img class="stream" src="${STREAM}">

  <!-- 상단 계정 헤더는 넣지 않는다 — 인스타가 업로드된 릴스에 프사/계정명/
       팔로우/음악을 자동으로 얹어주므로, 이미지에도 그리면 재생 화면에서
       두 번 겹친다. 중간 인터랙션 바는 원본 밈도 합성한 가짜라 유지. -->
  <!-- 중간 인터랙션 바 -->
  <div class="bar-bg" id="barbg"></div>
  <div class="bar" id="bar">
    <div class="actions">
      <div class="act">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
          <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1.1L12 21.2l7.7-7.7 1.1-1.1a5.5 5.5 0 000-7.8z"/>
        </svg>
        18,840
      </div>
      <div class="act">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
          <path d="M21 11.5a8.4 8.4 0 01-9 8.5 9.5 9.5 0 01-4.2-1L3 20.5l1.6-4.6A8.4 8.4 0 013 11.5a8.4 8.4 0 019-8.5 8.4 8.4 0 019 8.5z"/>
        </svg>
        2,548
      </div>
      <div class="act">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 3L11 14"/><path d="M22 3l-7 19-4-8-8-4 19-7z"/>
        </svg>
        1,978
      </div>
      <div class="act save">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
        </svg>
      </div>
    </div>

    <div class="cap"><b>${HANDLE}</b><span>${CAPTION}</span></div>

    <div class="byline">
      <img src="${AVATAR}">
      <div class="h">${HANDLE}</div>
      <div class="dots">•••</div>
    </div>
  </div>

  <!-- 하단 댓글 — 지어낸 유저/발언이라 제외 (되살리려면 주석 해제)
  <div class="comments">
    <div class="c">
      <div class="cav" style="background:#4A5568">ㅈ</div>
      <div class="body">
        <div class="who">jiwon_____</div>
        <div class="txt">${COMMENT}</div>
      </div>
      <div class="heart">♡</div>
    </div>
    <div class="c reply">
      <img class="cav" src="${AVATAR}" style="object-fit:cover">
      <div class="body">
        <div class="who">${HANDLE}</div>
        <div class="txt"><b>@jiwon_____</b> ${COMMENT_REPLY}</div>
      </div>
      <div class="heart">♡</div>
    </div>
  </div>
  -->
</div>
</body></html>`;

const htmlPath = resolve(__dirname, "_reel.html");
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
});
await page.goto("file://" + htmlPath);
await page.waitForTimeout(1200); // 웹폰트 로딩
// 검은 배경은 .bar와 정확히 같은 사각형이어야 한다 (텍스트만 위로 빼낸 구조라
// 배경이 별도 엘리먼트가 됐다). 실제 레이아웃을 재서 맞춘다.
await page.evaluate(() => {
  const bar = document.getElementById("bar");
  const bg = document.getElementById("barbg");
  const r = bar.getBoundingClientRect();
  bg.style.top = r.top + "px";
  bg.style.height = r.height + "px";

  // 액체 오버레이는 "바가 덮는 구간"에만 보이면 된다. inset은 .stream 자신의
  // 높이 기준인데 .stream은 top:130px에서 시작하므로, 프레임 좌표를 그대로
  // 쓰면 경계에서 줄기가 끊긴다(실제로 끊겼음). 그래서 .stream 기준으로 환산.
  const st = document.querySelector(".stream");
  const sr = st.getBoundingClientRect();
  const top = ((r.top - sr.top) / sr.height) * 100;
  const bottom = ((sr.bottom - r.bottom) / sr.height) * 100;
  st.style.clipPath = `inset(${top}% 0 ${bottom}% 0)`;
});
await page.locator(".frame").screenshot({ path: resolve(__dirname, "out.png") });
await browser.close();
console.log("saved: out.png");
