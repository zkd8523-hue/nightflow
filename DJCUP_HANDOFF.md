# DJ 이상형 월드컵 — 인수인계

**최종 업데이트**: 2026-08-31
**상태**: 프로덕션 라이브 (https://nightflow.kr/dj-cup)

---

## 1. 무엇인가

사운드클라우드 미리듣기로 두 DJ를 1:1로 붙여 우승자를 뽑는 토너먼트.
우승 후 **취향 분석 → 추천 클럽(찜) → 공유 → 댓글** 순으로 이어진다.

**목적**: (1) "나플에 DJ DB가 있구나" 각인 (2) 카톡 공유 바이럴 (3) **클럽 발견으로 연결**

마지막이 핵심이다. DJ만 발견하고 끝나면 "그래서 어디 가지?"가 남는데,
추천 클럽 + 찜이 그 답이 되고 서비스 본체(클럽·라인업)로 유저를 넘긴다.

| 라우트 | 내용 |
|---|---|
| `/dj-cup` | 시작(라운드 선택) → 대결 → 우승 단일 상태머신 |
| `/dj-cup/ranking` | 전체 집계 랭킹 + 공용 댓글 |

---

## 2. 파일 지도

### 컴포넌트 `src/components/djcup/`
| 파일 | 역할 |
|---|---|
| `DjCupClient.tsx` | 상태머신 루트 (start/match/result) |
| `DjCupStart.tsx` | 시작 화면 (히어로 이미지 + 라운드 선택) |
| `DjCupMatch.tsx` | 1:1 대결 |
| `DjCupCard.tsx` | 후보 카드 1장 |
| `DjCupPreloadedPlayer.tsx` | ⚠️ 재생 예열 시스템 — §5 필독 |
| `DjCupResult.tsx` | 우승 화면 (조립 지점) |
| `DjCupTasteReport.tsx` | 장르 분포 + 추천 클럽 + 찜 |
| `DjCupComments.tsx` | 공용 댓글 |
| `DjCupRankingTable.tsx` | 랭킹 표 |

### 로직 `src/lib/djCup/`
| 파일 | 역할 |
|---|---|
| `candidates.ts` | 셔플·대진. `crypto.getRandomValues` 기반 |
| `types.ts` | 타입 + `usableDjArtwork()` 가드 |
| `session.ts` | 익명 세션 UUID (레이트리밋 단위) |
| `fetchDjShows.ts` | 우승자 예정 라인업 |
| `fetchTasteReport.ts` | 장르 분포 + 추천 클럽 계산, `GENRE_LABEL` |

### 마이그레이션 (전부 적용 완료)
| 번호 | 내용 |
|---|---|
| 613 | `djs.youtube_url` |
| 614 | `dj_cup_stats`, `dj_cup_plays`, `submit_dj_cup_result()`, `get_dj_cup_ranking()` |
| 616 | `djs.genre` / `genre_confidence` / `genre_source` |
| 617 | `dj_cup_comments`, `post_dj_cup_comment()`, `get_dj_cup_comments()` |
| 619 | 테스트 계정도 자기 댓글은 보이게 |
| 622 | ⚠️ 우승비율 100% 버그 수정 시도 — `dj_cup_stats` 실사용 전용화 + DELETE (623에서 되돌림, §7) |
| 623 | ⚠️ 622 되돌림 — 테스트 판도 다시 포함해 집계. 622 DELETE로 승률 데이터 9판분 손실 (§7) |

### 스크립트
- `scripts/backfill-dj-genre.mjs` — 장르 수집 (§4)
- `scripts/backfill-dj-artwork.mjs` — 사클 아트워크

---

## 3. 확정된 설계 결정 (되돌리지 말 것)

**후보 풀** — `soundcloud_url` 또는 재생 가능한 `youtube_url` 보유 DJ (~160명).
유튜브 **채널** URL은 임베드가 막혀 제외한다(`youtubeVideoId()`로 판별).

**라운드** — 4/8/16/32/64/128. `pool.length >= size`로 판정, 하드코딩 없음.

**카드 탭 = 재생, "선택하기" 버튼 = 선택.**
처음엔 카드 탭이 곧 선택이었는데 "들어보려고 눌렀는데 선택돼버린다"는 피드백으로 분리했다.
저위험 동작(재생)에 큰 탭 영역을, 되돌릴 수 없는 커밋(선택)은 별도 버튼으로.

**카드 탭은 토글이 아니다** — 항상 "켜기"만 한다. 껐다 켜는 동작이 §5의 회색 버그 원인이었다.

**유형 이름을 짓지 않는다** — "하우스 탐닉형" 같은 MBTI식 라벨 금지.
근거가 장르 분포뿐인데 성격 라벨을 얹으면 데이터가 말하지 않은 것을 지어내게 된다.
계산으로 나온 사실만 보여준다: 분포, "N명 중 M명이 X", "고른 DJ N명이 여기서 플레이".

**가짜 데이터를 심지 않는다** — 랭킹 판수를 부풀리자는 안이 있었으나 기각.
이 화면의 유일한 무기가 "진짜 내 선택에서 나온 숫자"인데, 옆에 지어낸 숫자를 놓으면
진짜 숫자까지 의심받는다. 실사용 판이 쌓이면 분리도 불가능해진다.

**공유** — 결과 OG 이미지를 만들지 않고 항상 시작 링크(`/dj-cup`)를 공유한다.
카카오 SDK `sendDefault`는 쓰지 말 것 (4019 에러로 프로젝트가 이미 폐기).

**색은 한 곳에만** — 강조 박스(주황) 하나. 칩·타일에까지 색을 넣었더니
한 화면에 강조가 셋(주황+노랑+초록)이 되어 난잡했다. 1위 칩은 흰 글씨+굵기로만 구분.

**댓글은 전역 공용 스레드 하나** — 피쿠 구조. 월드컵이 하나뿐이라 댓글창도 하나.
각 댓글에 그 사람의 우승자가 괄호로 붙어서, 댓글 자체가 "남들은 누굴 뽑았나" 콘텐츠가 된다.
**로그인을 요구하지 않는다** — 비로그인 유입이 주 타겟인데 댓글 한 줄에 카카오 로그인을
시키면 그 자리에서 이탈한다.

---

## 4. DJ 장르 (Migration 616)

### 출처와 정확도
1순위는 **사클 프로필의 `<meta itemprop="genre">`** — DJ 본인이 업로드 트랙에 단 태그다.
API 키 없이 공개 HTML로 읽는다. 못 채운 DJ는 **플레이한 클럽의 `genre:` 태그로 폴백**한다.

⚠️ **폴백이 압도적으로 많다**: 사클 109 vs 클럽 452.
즉 대부분의 장르는 "본인이 하는 음악"이 아니라 **"어느 클럽에 불려가는가"**다.
하우스 DJ가 힙합 클럽에 한 번 게스트로 가면 힙합으로 분류된다.
`genre_source`로 구분되니 정확도가 중요한 화면에서는 `'soundcloud'`만 쓸 것.

### 실측 (637명 대상)
- **561명(88%)** 확보 — 사클 109 · 클럽 452 · 실패 76
- DJ컵 후보(사클 보유 148명)는 **145명(98%)**
- 사클 출처 신뢰도 중앙값 **90%**
- 실패 76명은 사클도 라인업도 없어 근거 자체가 없다 — 추측해서 채우지 않았다

### 값
`House` `Techno` `EDM` `HipHop` `RnB` `Global` — DB CHECK 제약과 스크립트 매핑이 같은 집합.
원본 태그는 자유 입력이라 노이즈가 심하다(실측: `News & Politics`, `summer`, 활동명,
`케이팝,소년만화,K-pop,...`). 매핑에 없는 값은 버린다.

### 재실행
```bash
DRY_RUN=1 node scripts/backfill-dj-genre.mjs   # 저장 안 함
node scripts/backfill-dj-genre.mjs             # 빈 것만
FORCE=1 node scripts/backfill-dj-genre.mjs     # 전부 다시
```
사클 fetch 148명 × 0.9초 ≈ 2분. 나머지는 DB 조회만.

### 노출 위치
- DJ 프로필 `/dj/[slug]` · DJ 프로필 시트 — `#힙합` 해시태그
- 우승 화면 — 장르 칩 (`힙합 62%`)

---

## 5. ⚠️ 재생 예열 시스템 — 건드리기 전 필독

`DjCupPreloadedPlayer.tsx`. 라운드 참가자 전원의 `<iframe>`을 **한 번만 마운트하고
절대 언마운트하지 않는다.** 안 보이는 것은 `position:absolute; left:-9999px`로 치운다
(`display:none`은 위젯 렌더를 멈춘다).

### 왜 이렇게까지 하나
`<iframe>`은 **언마운트되거나 DOM 부모가 바뀌면 브라우저가 강제로 다시 로드**한다.
그래서 예열해둔 상태가 재생 시점까지 이어지지 않는다.

### 과거 "회색 빈 박스" 버그 (해결됨)
증상: 위젯 자리가 회색으로만 보임. 헤드리스에서는 재현 안 되고 콘솔 에러도 없었다.
**8번 넘게 엉뚱한 곳을 고쳤다.**

진짜 원인은 **언마운트 후 재마운트 시 상태 리셋 누락**이었다:
- 카드 탭이 토글이라 재생 중 카드를 다시 누르면 `setActiveDjId(null)`
- `DjCupPlayerSlot`이 `if (!activeDjId) return null`로 iframe 전체를 언마운트
- 다시 켜면 iframe은 새 DOM 노드인데 `handlesRef`에 `loadStarted: true`가 남아
  `startLoading`이 조용히 리턴 → **src가 영원히 빈 iframe**

수정: (1) 토글 제거 (2) `registerIframe`에서 DOM 노드가 바뀌면 상태 리셋
(3) `activeDjId`가 null이어도 언마운트하지 않음 (4) 유튜브 폴백도 early return 제거
— (4)는 같은 버그의 **두 번째 경로**였다(유튜브 DJ가 활성이면 사클 iframe이 전부 언마운트).

### 다시 문제가 생기면
1. **실제 화면을 먼저 볼 것.** 무엇이 회색인지 확정 전엔 코드를 만지지 말 것.
2. 시크릿 창에서 재현되는지 — 정상이면 광고차단기/서드파티 쿠키 문제다.
3. 되돌리기 옵션: 예열을 버리고 `DjPreviewButton`을 매치마다 `key={djId}`로
   마운트하면 **로딩은 매번 생기지만 확실히 동작한다.**

### 실패한 접근 (반복 금지)
| 시도 | 실패 원인 |
|---|---|
| `fetch(no-cors)` 예열 | 위젯 스크립트가 파싱·실행 안 됨 |
| 숨김 iframe → 슬롯으로 `appendChild` | reparenting 시 강제 리로드 |
| 좌표만 `position:absolute`로 이동 | `getBoundingClientRect` 타이밍 불안정 |
| 전원 `src` 즉시 설정 | 네트워크 큐 밀림 → 더 느려짐 |

---

## 6. 플랫폼 제약 (코드로 못 넘음)

- **모바일 자동재생 차단** — iOS 사파리·모바일 브라우저는 user gesture 없이 재생 불가.
  안드로이드 앱만 `MainActivity.java`의 `setMediaPlaybackRequiresUserGesture(false)`로 예외.
- **사클 위젯 지연** — "따뜻해도 첫 바이트 930ms"(실측). 위젯 본체 1.25MB는 1년 immutable
  캐시라 두 번째 곡부터 빨라진다. 시작 시 "초반엔 로딩이 느릴 수 있어요" 토스트로 기대치 관리.
- **선곡** — DB에 프로필 URL만 있어 사클이 정하는 순서(대체로 최신순)로 재생된다.
  "대표곡으로 재생"은 **미구현** — 트랙별 URL 수집 스크립트가 필요하다.

---

## 7. 집계

### 이벤트 (`trackEvent` → GA4 + Mixpanel + `user_events` 동시)
| 이벤트 | 시점 |
|---|---|
| `dj_cup_started` | 라운드 선택 후 시작 |
| `dj_cup_completed` | 우승자 확정 |
| `dj_cup_shared` | 공유 (method: native/web_share_api/clipboard) |
| `dj_cup_comment_posted` | 댓글 작성 |

`started → completed → shared` 퍼널로 완주율·공유 전환율을 낸다.

### 랭킹이 비어 보이는 이유 (버그 아님)
`get_dj_cup_ranking()`은 `dj_cup_plays`에서 **`is_test = FALSE`인 판만** 분모로 센다.
`submit_dj_cup_result()`가 `users.is_test`를 그대로 가져오므로, 테스트 계정으로 돌린 판은
집계에서 빠진다. 실사용 판이 0이면 "아직 집계된 게임이 없어요"가 정상이다.

### 우승비율 100% 버그 (Migration 622에서 수정)
증상: "총 1판 집계"인데 서로 다른 DJ 8명이 동시에 우승비율 100%.

원인은 **분자와 분모의 모집단이 달랐던 것**이다. `dj_cup_stats`(분자)는 `is_test`를
가리지 않고 누적했는데 `total_plays`(분모)는 `is_test = FALSE`만 셌다.
실측 당시 9판 중 7판이 테스트라 stats에는 우승 9회가 쌓였는데 분모는 2였다.

**우승비율이 승률보다 크면 분모가 깨진 것이다.** 우승비율의 분모는 전체 게임수라
정상이라면 승률보다 한참 작다(레퍼런스 실측: 19% vs 82%). 다음에 비슷한 게 보이면
숫자 자체보다 이 대소관계를 먼저 볼 것.

수정: 622가 카운터 누적을 `IF NOT v_is_test`로 감싸 `dj_cup_stats`를 **실사용 전용**으로
좁혔다. 이미 오염된 카운터는 같은 마이그레이션에서 `DELETE`로 비웠다 —
매치 단위 로그를 일부러 안 만들었기 때문에(614) 테스트 기여분만 역산할 수 없다.
⚠️ **실사용 판이 쌓인 뒤 622의 DELETE를 재실행하지 말 것.**

### 표본이 적을 때 비율을 가린다
`DjCupRankingTable`은 승률을 `appear_count < 5`에서 `—`로 가려왔는데, 우승비율에는
같은 가드가 없었다. 전체 5판 미만이면 우승비율도 `—`로 가린다(`MIN_PLAYS_FOR_RATE`).
2판 집계에서 "우승비율 50%"는 숫자가 맞아도 고장난 화면으로 읽히고, 이 표의 유일한
무기인 "진짜 내 선택에서 나온 숫자"의 신뢰를 깎는다. 판을 지어내는 대신(§3) 근거가
설 때까지 안 보여준다. 랭킹 페이지가 "판이 더 쌓이면 우승비율이 공개돼요"로 이유를 밝힌다.

### 도배 방어 (`post_dj_cup_comment`)
서버 RPC에서 강제한다(클라 검증은 우회된다).
분당 3건 · 1시간 내 같은 내용 차단 · 본문 300자 · 닉네임 20자.
와글은 분당 5건이지만 여기는 로그인도 없는 익명이라 더 좁혔다.

---

## 8. 남은 일

- [ ] **테스트 댓글 정리** — `probe`, `Zz`, `Zzx` 등 (`is_test=true`라 노출은 안 됨)
- [ ] **장르 칩으로 DJ 탐색** — 칩을 눌러 같은 장르 DJ 보기. 데이터는 있는데
      지금은 표시만 하고 아무 데도 못 간다. ⚠️ 필터로 쓰면 클럽 폴백(452건)의
      부정확성이 드러나므로 `genre_source='soundcloud'` 우선 정렬 권장
- [ ] **대표곡 재생** (§6)
- [ ] **실기기 검증** (iOS/안드로이드)

---

## 9. 협업 주의사항

**Gemini와 파일이 자주 겹친다.** 실제로 `6eaa062e` 커밋에서 Gemini가 `git add -A`로
작업 중이던 DJ컵 파일들을 함께 쓸어담아 커밋했다(결과적으론 완성 상태여서 무사).

- 커밋은 **pathspec 명시**: `git commit -- <파일>`
- 커밋 전 `git diff --cached --stat`으로 남의 WIP가 섞였는지 확인
- 파일 수정 전 `git status -sb` + 파일 mtime 확인

**OG 이미지는 절대 같은 이름으로 덮어쓰지 말 것.** 카카오는 페이지가 아니라 이미지
파일 URL 자체를 캐싱한다. `og-image.png`를 덮어썼더니 무효화 수단이 없어
`og-image-v2.png`로 파일명을 바꿔야 했다(참조 76곳 수정).

---

## 10. 참고

- 결과 화면 목업 3안: https://claude.ai/code/artifact/9289c722-633b-44d8-ab1d-4a3459c56f7d
- 상세 설계 플랜: `/Users/gimmingi/.claude/plans/dj-hidden-reddy.md`
- Supabase SQL 에디터: https://supabase.com/dashboard/project/ihqztsakxczzsxfvdkpq/sql/new
