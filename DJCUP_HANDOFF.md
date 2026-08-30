# DJ 이상형 월드컵 — 인수인계 문서

**작성 시점**: 2026-08-31
**상태**: 기능 대부분 완성, **재생 위젯이 "회색으로 뜨는" 미해결 버그 1건**
**미해결 버그 때문에 배포 불가.** 아래 §5를 먼저 읽을 것.

---

## 1. 무엇을 만들었나

`/dj-cup` — DJ 이상형 월드컵. 사운드클라우드 미리듣기가 되는 DJ들을 1:1 토너먼트로
붙여 우승자를 뽑고, 그 DJ의 예정 라인업을 보여준 뒤 공유를 유도한다.

**목적**: (1) "나플에 DJ DB가 있구나" 각인 (2) 카톡 공유로 바이럴
**핵심 가치**: 취향에 맞는 DJ를 찾고 → 그 DJ 일정까지 안다

### 화면 구성
| 라우트 | 내용 |
|---|---|
| `/dj-cup` | 시작(라운드 선택) → 대결(1:1) → 우승(일정+공유) 단일 상태머신 |
| `/dj-cup/ranking` | 전체 집계 랭킹(우승비율/승률) |

---

## 2. 파일 목록

### 신규 (전부 untracked)
```
supabase/migrations/614_dj_cup.sql          ⚠️ 아직 미적용
src/app/(main)/dj-cup/page.tsx              후보 fetch + metadata
src/app/(main)/dj-cup/ranking/page.tsx      랭킹 페이지
src/components/djcup/DjCupClient.tsx        상태머신 루트
src/components/djcup/DjCupStart.tsx         시작 화면
src/components/djcup/DjCupMatch.tsx         1:1 대결
src/components/djcup/DjCupCard.tsx          후보 카드 1장
src/components/djcup/DjCupResult.tsx        우승 화면
src/components/djcup/DjCupRankingTable.tsx  랭킹 표
src/components/djcup/DjCupPreloadedPlayer.tsx  ⚠️ 문제의 재생 시스템
src/lib/djCup/types.ts                      타입 + usableDjArtwork()
src/lib/djCup/candidates.ts                 셔플·대진 로직
src/lib/djCup/session.ts                    익명 세션 UUID
src/lib/djCup/fetchDjShows.ts               우승자 일정 조회
src/lib/lineups/youtubeUrl.ts               youtubeVideoId (서버/클라 공용)
```

### 수정
```
src/types/database.ts              Dj 타입에 soundcloud_artwork_url, youtube_url 추가
src/lib/utils/share.ts             shareDjCup() 추가 + copyToClipboard 폴백 보강
src/components/djs/DjPreviewButton.tsx   playerSrc/loadScApi export, youtubeVideoId 분리
src/components/home/HomeContent.tsx      홈 최하단 배너
src/components/layout/Header.tsx         메뉴에 "DJ 이상형 월드컵" 2곳
src/components/lineups/NationwideLineupList.tsx  /lineups 배너
src/app/(main)/dj/[slug]/page.tsx        DJ 프로필 하단 배너
src/app/sitemap.ts                       /dj-cup, /dj-cup/ranking 추가
scripts/backfill-dj-artwork.mjs          호스트 화이트리스트로 강화
```

---

## 3. 배포 전 필수 작업

1. **Migration 614 적용** — Supabase 대시보드에서 수동 적용
   (프로젝트 규약: `db push` 금지, 한 파일씩 수동)
   - `dj_cup_stats`, `dj_cup_plays` 테이블
   - `submit_dj_cup_result()`, `get_dj_cup_ranking()` RPC
   - **미적용 상태로 배포하면 결과 제출 시 500**

2. **아트워크 백필** (이미 1회 실행됨, 148건 확보)
   ```
   DRY_RUN=1 node scripts/backfill-dj-artwork.mjs
   node scripts/backfill-dj-artwork.mjs
   ```

3. **실기기 검증** — iOS/안드로이드 앱/모바일 브라우저

---

## 4. 확정된 설계 결정 (되돌리지 말 것)

- **후보 풀**: `soundcloud_url` 또는 재생 가능한 `youtube_url` 보유 DJ (~153명)
  - 유튜브 **채널** URL은 임베드 차단이라 제외 (`youtubeVideoId()`로 판별)
- **라운드**: 4/8/16/32/64/128. 256강은 후보 부족으로 미노출
  - `pool.length >= size`로 판정, 하드코딩 없음
- **공유**: 결과 OG 이미지 안 만듦. 항상 시작 링크(`/dj-cup`) 공유
  - 카카오 SDK `sendDefault` 쓰지 말 것 (4019 에러로 프로젝트가 이미 폐기)
- **카드 탭 = 재생, "선택하기" 버튼 = 선택**
  - 처음엔 카드 탭=선택이었는데 "들어보려고 눌렀는데 선택돼버린다"는 피드백으로 분리
- **랭킹 저장**: 전용 테이블 (`user_events`는 90일 purge라 부적합)
- **홈 배너**: 최하단 고정 (사용자가 명시적으로 지정)

---

## 5. ⚠️ 미해결 버그 — 재생 위젯이 "회색으로 뜸"

### 증상
사용자 브라우저에서 대결 화면의 재생 위젯 자리가 회색으로만 보임.
"2매치부터", "로딩 후에도 안 뜸", "하얗게 사운드클라우드 로고만" 등으로 보고됨.

### 확인된 사실
- **헤드리스 Playwright에서는 8매치 연속 정상** (iframe 16개 유지, 곡 목록·재생수 정상 로드)
- 브라우저 콘솔에 **DJ컵 관련 에러 없음** (Mixpanel 로그와 무관한 406만 존재)
  → **페이지 크래시(에러 바운더리)는 아님**
- 사클 위젯 URL을 직접 열면 트랙 목록 정상 로드됨

### 아직 확인 못 한 것
- **회색의 정체** — 위젯 자리인지, 카드인지, 화면 전체인지 미확인
  (담당자가 스크린샷을 읽지 못하는 상태로 작업해 계속 추측에 의존함)
- 사용자 브라우저 환경 (확장 프로그램, 쿠키 차단 설정 등)
- 시크릿 창에서의 동작

### 다음 담당자에게 권하는 접근
1. **실제 화면을 먼저 볼 것.** 스크린샷이든 화면공유든, 회색이 무엇인지 확정하기 전엔
   코드를 만지지 말 것 — 이 버그로 8번 넘게 헛수고했고 전부 다른 곳을 고쳤다.
2. 시크릿 창(확장 비활성)에서 재현되는지 확인
   - 시크릿에서 정상 → 광고차단기/쿠키차단이 원인. 사클 위젯은 서드파티 쿠키 의존
   - 시크릿에서도 회색 → 코드 문제. 아래 §6 이력 참고
3. 개발 서버 완전 재시작 (Turbopack HMR이 20회+ 수정으로 꼬였을 가능성)

### 되돌리기 옵션
`DjCupPreloadedPlayer.tsx`(예열 시스템)를 통째로 버리고 기존 `DjPreviewButton`을
매치마다 `key={djId}`로 마운트하는 단순 구조로 복귀하면 **로딩은 매치마다 생기지만
확실히 동작한다.** 예열 최적화는 나중에 다시 시도.

---

## 6. 재생 예열 시스템 — 실패 이력 (같은 실수 반복 방지)

목표: "재생 누르면 로딩 없이 바로 나오게"

| 시도 | 방식 | 실패 원인 |
|---|---|---|
| 1 | `fetch(no-cors)`로 CloudFront 예열 | 위젯 스크립트가 파싱·실행 안 됨 → 무의미 |
| 2 | 화면 밖 숨김 iframe 예열 후 슬롯으로 `appendChild` | **iframe은 DOM 부모가 바뀌면 브라우저가 강제 리로드** |
| 3 | iframe 고정 + 좌표만 `position:absolute`로 이동 | `getBoundingClientRect` 타이밍·`querySelector` 불안정 → 아예 안 보임 |
| 4 | 전원 렌더 + `src`도 전원 즉시 설정 | 순차 로딩 로직을 빠뜨려 네트워크 큐 밀림 → "더 느려짐" |
| 5 | 전원 렌더 + `src`만 순차로 채움 (현재) | 회색 문제 미해결 |

### 현재 구조 (`DjCupPreloadedPlayer.tsx`)
- 라운드 참가자 전원의 `<iframe>`을 **한 번만 마운트, 절대 언마운트 안 함**
- 안 보이는 것은 `position:absolute; left:-9999px` (`display:none`은 위젯 렌더를 멈춤)
- `src`는 처음엔 비워두고 첫 곡만 즉시, 나머지는 `requestIdleCallback`으로 순차
- 클릭 시 순번 안 기다리고 새치기(`startLoading`)
- `auto_play=false` 고정 + Widget API `play()` 명시 호출
  (전부 `auto_play=true`면 안 보이는 곡들이 백그라운드에서 소리 남)

### 그 과정에서 실제로 고친 진짜 버그들 (유지할 것)
- `<button>` 안에 `<button>` 중첩 → 이벤트 버블링 오작동 (카드 구조를 div+button으로)
- `urls`를 `useMemo` 없이 매 렌더 새 배열 → effect가 계속 재실행되어 예열 큐 리셋
- `registerIframe` 시점에 이미 활성이면 즉시 로드 (effect 순서 경쟁)
- 큐 판별을 `LOAD_PROGRESS` 한 곳에서만 → `READY`/`PLAY`에서도 체크 (이전곡/다음곡 버튼)
- `next/image` 호스트 미등록 크래시 → `usableDjArtwork()` 가드
  (사클 기본 이미지 `fb_placeholder.png`가 6명에게 저장돼 있었음, DB에서 NULL 처리 완료)

---

## 7. 플랫폼 제약 (코드로 못 넘음)

- **모바일 자동재생 차단**: iOS 사파리·모바일 브라우저는 user gesture 없이 재생 불가.
  안드로이드 앱만 `MainActivity.java`에서 `setMediaPlaybackRequiresUserGesture(false)`로 예외.
  → A는 매치 진입 시 자동재생(웹만), B는 탭이 gesture라 모바일에서도 재생됨
- **사클 위젯 자체 지연**: "따뜻해도 첫 바이트 930ms" (기존 코드 주석의 실측값).
  위젯 본체 1.25MB는 1년 immutable 캐시라 두 번째 곡부터 빨라짐
  → 시작 시 "초반엔 로딩이 느릴 수 있어요! 점점 빨라집니다" 토스트로 기대치 관리
- **선곡**: DB에 프로필 URL만 있어 사클이 정하는 순서(대체로 최신순)로 재생됨.
  "대표곡(조회수 1위)으로 재생" 요구가 있었으나 **미구현** — 트랙별 URL 수집 스크립트 필요

---

## 8. 미완료 항목

- [ ] **회색 버그 해결** (§5)
- [ ] Migration 614 적용
- [ ] 실기기 검증 (iOS/안드로이드/모바일웹)
- [ ] 대표곡 재생 (§7 마지막)
- [ ] 커밋 안 됨 — 전부 working tree 상태

---

## 9. 참고

- 상세 설계 플랜: `/Users/gimmingi/.claude/plans/dj-hidden-reddy.md`
- 목업(3안 비교): 대결 화면은 B안(좌우 분할) 확정
- 홈 배너 카피: "이번 주말, 내 취향 DJ 찾아서 보러가기" / "DJ 이상형 월드컵"
- 시작 화면 헤드라인: "나랑 취향 찰떡인 DJ는 누구?"
