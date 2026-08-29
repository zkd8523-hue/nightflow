# 공연·아티스트·공연장 작업 가이드

작성일: 2026-08-30
대상 커밋 범위: `3ad0d823` 이후 ~ `485851a7`

이 문서는 공연(`club_events`) 축 작업의 **현재 상태·설계 근거·함정**을 기록한다.
데이터가 유실되거나 세션이 끊겨도 이 문서만으로 이어갈 수 있게 쓴다.

---

## 0. 한눈에 보기

| 축 | 테이블 | 페이지 | 상태 |
|---|---|---|---|
| 공연 | `club_events` | `/events`, `/events/[date]/[slug]` | 운영 중 |
| 공연장 | `venues` | `/venues/[slug]` | 신설·배포 완료 |
| 아티스트 | `artists` | `/artists/[slug]` | 신설·배포 완료 |
| DJ | `djs` | `/dj/[slug]` | 기존 |
| 클럽 | `clubs` | `/clubs/[id]` | 기존 |

**공연(래퍼/가수)과 DJ는 다른 테이블·다른 페이지다.** 섞지 않는다.
`artists`(1,129명)와 `djs`(571명)는 별개이며, 겹치는 사람은 126명(11%)뿐이다.

---

## 1. 이번 범위에서 한 일 (커밋별)

### `20184989` 공연장 배포 + 아티스트 페이지 신설 + dedup 재발 방지

**(1) 공연장 페이지 배포 — 프로덕션 장애 복구였다**

커밋본 `src/app/sitemap.ts`가 이미 `/venues/{slug}`를 sitemap에 내보내고 있었는데,
정작 페이지 `src/app/(main)/venues/`는 **untracked라 배포가 안 돼 있었다.**
즉 **프로덕션 sitemap이 404 URL을 색인 요청하는 상태**였다.

- `supabase/migrations/605_venues.sql` — `venues` 테이블. DB에는 이미 적용돼 있었고 파일만 미추적이었다
- `src/app/(main)/venues/[slug]/page.tsx` — 공연장 상세
- 공연 상세(`events/[date]/[slug]`)에 공연장 링크 추가

**(2) 아티스트 페이지 신설 `/artists/[slug]`**

`"키드밀리 공연"` 같은 검색어에 대응할 페이지가 하나도 없었다.

설계 원칙 — **프로필이 아니라 일정이다.**
생년월일·디스코그래피는 넣지 않는다(나무위키 영역, 이길 수 없다).
**언제·어디서·누구와**만 담는다.

- h1: `키드밀리 (KID MILLI) 공연 일정`
- `NEXT SHOW` LED 전광판 (공연장의 `NEXT LIVE`와 같은 컴포넌트 언어)
- 예정 공연 / 지난 공연(최근 20건)
- 장소 → `/venues/{slug}` · `/clubs/{id}` 링크
- 함께 선 사람 → 다른 아티스트 링크 (`with A, B, C`)
- JSON-LD `Person` + `performerIn: MusicEvent[]`

**(3) dedup 재발 방지** — 아래 §4에서 상술

**(4) sitemap 등재 기준** — 아래 §5에서 상술

---

### `5f5aa355` 공연장·아티스트 페이지 런타임 오류 수정

배포 직후 두 페이지가 500을 냈다.

**한글 슬러그가 URL 파라미터로 들어올 때 퍼센트 인코딩된 채 `eq()`에 꽂혀서** 아무것도 안 걸렸다.
`decodeSlugParam()`으로 디코딩 + **NFC 정규화**까지 해야 한다 —
자모 분리(NFD)로 들어온 요청도 DB 값과 맞춰야 하기 때문이다.

```ts
function decodeSlugParam(raw: string): string {
  try { return decodeURIComponent(raw).normalize("NFC"); }
  catch { return raw.normalize("NFC"); }
}
```

⚠️ **한글 슬러그를 쓰는 라우트에는 반드시 이 처리가 있어야 한다.**
아티스트 1,129명 중 한글 슬러그가 다수다.

---

### `8c55fe9d` → `d1f9e603` 공연 탭 월 격자 달력

**만든 이유**: 예정 공연이 며칠치뿐인데도 다음주·다음달로 이동할 수단이 없었다.

**모바일에서 데스크톱 격자를 베끼지 않은 이유**:
390px에서 7열 격자는 셀 하나가 50px이라 제목이 한 글자도 안 들어간다.
그래서 **셀에는 점과 건수만** 넣고 날짜를 누르면 아래 목록이 좁혀지는 방식으로 갔다.

`src/components/events/EventMonthCalendar.tsx`

- **공연만 센다.** DJ 라인업 점을 섞으면 탭을 나눈 의미가 없어진다
- **공연 없는 날은 누를 수 없다** — 눌러도 빈 목록이 되는 버튼을 만들지 않는다(지역 칩과 같은 규칙)
- 범례에 `N칸 중 M칸` — 데이터가 얇다는 걸 숨기지 않는다
- **기본은 닫힘**(`d1f9e603`에서 변경). 항상 펼쳐두니 빈 격자가 목록을 화면 밖으로 밀어냈다
- 열 때 이번 달에 남은 공연이 없으면 **공연 있는 가장 이른 달로 건너뛴다**
- 검색 중에는 달력을 감춘다 — 무엇이 목록을 좁혔는지 알 수 없게 되기 때문

**공연장 카드에 "그 외 N개 공연 일정 보기"** 도 같이 넣었다.
이름·주소만 있는 카드는 눌러도 뭐가 나올지 몰라 아무도 안 누른다.

---

### `e6271a27` 아티스트 찜

`user_favorite_djs`(570)와 **같은 구조의 4번째 인스턴스**다
(070 클럽 · 083 MD · 570 DJ · 608 아티스트). 훅·Context·하트 레이어까지 1:1 대응.

| 파일 | 역할 |
|---|---|
| `supabase/migrations/608_user_favorite_artists.sql` | 조인 테이블 + RLS |
| `src/hooks/useFavoriteArtists.ts` | 훅 |
| `src/components/providers.tsx` | `useArtistFavoritesContext` |
| `src/components/artists/ArtistFavoriteButton.tsx` | 찜 버튼(클라이언트 섬) |
| `src/components/artists/ArtistNameWithHeart.tsx` | 이름+하트(클라이언트 섬) |

**동작**
- `/artists/[slug]`에서 찜
- `/events`에서 **찜한 아티스트 섹션이 날짜 그룹 위에** 뜬다(접기 가능, 상태는 localStorage 기억, 기본 열림)
- 날짜 그룹 안에서도 찜한 공연이 위로
- 출연진 이름 앞에 빨간 하트

**설계 규칙**
- **필터가 아니라 정렬이다.** 찜 안 한 공연도 계속 보인다
- **날짜 그룹 순서 자체는 안 건드린다.** 날짜를 뒤섞으면 "언제 뭐가 있나"를 못 읽는다
- 서버 컴포넌트라 **찜 여부가 필요한 부분만 클라이언트 섬으로 분리**했다(로그인 유저마다 다름)

---

### `485851a7` + 이후 수정 — 공연 탭 지역 칩

⚠️ **이 커밋의 절반은 잘못된 판단이었고 이후 되돌렸다. 기록으로 남긴다.**

**문제 인식**: 공연 탭 칩에 `강남·이태원·부산`만 떴다.

**내가 내린 오진**: 지역 분류가 구 단위(`AREA_OPTIONS`)라 "서울"·"인천"이 걸러진 탓이라고 봤다.
→ 광역 단위(`수도권`/`부산`/...)로 뭉갰다.

**실제 원인**: **예정 공연이 13건뿐이었다.** 그 13건이 서울·이태원·인천·강남·부산에 몰려 있었을 뿐이다.

**뭉갠 결과**: 지난 공연 486건 기준 **홍대 137 · 이태원 87 · 강남 37** 이라는
이 서비스의 핵심 구분이 "수도권" 하나로 사라졌다.

**되돌린 뒤 현재 구조** — `src/lib/events/area.ts`

```ts
export const EVENT_AREAS = [
  "홍대", "이태원", "강남",          // 구 단위 유지 (클럽 탭과 같은 값)
  "서울",                            // 구가 안 찍힌 서울 공연
  "인천", "수원", "고양",             // 수도권 외곽
  "대전", "대구", "부산", "광주", "제주",
  "타이페이", "도쿄", "홍콩", "오사카", // 해외
] as const;

export function eventAreaOf(raw: string | null | undefined): EventArea | null
```

**교훈 — 반드시 지킬 것**
> 칩이 적게 보이면 **분류를 의심하기 전에 데이터 건수를 먼저 세라.**
> 구 단위(홍대/이태원/강남)를 광역으로 뭉치지 마라. 이게 이 서비스의 핵심 축이다.

⚠️ 새 지역이 수집되면 `EVENT_AREAS`에 추가해야 칩에 잡힌다.
안 넣으면 그 공연은 "전체"에서만 보이고 개별 칩으로는 못 찾는다(목록에서 사라지지는 않는다).

**같은 커밋의 나머지 절반(이건 유효함)**: `/lineups` 클럽 탭 정렬 확장
- 정렬 순서: 찜한 클럽 → **찜한 DJ가 있는 클럽** → 클럽명
- 필터 버튼 없이 정렬만 바꾼다
- 클럽 카드 DJ 미리보기에서 찜한 DJ만 하트+빨간색

---

## 2. ⚠️ 자동수집이 진짜 공연을 43% 거르고 있었다 (미해결)

**2026-08-30 발견.** 예정 공연 23건 중 **10건이 `rejected`/`flagged`로 숨어 있었다.**

거절된 것들이 전부 **실제 클럽 공식 계정이 올린 진짜 공연**이었다:

| 날짜 | 클럽 | 제목 | 수집 계정 |
|---|---|---|---|
| 09-02 | 신도시 | 태양의 적: 두번째 밤 | `hotpot_dj` |
| 09-03 | 축제 | 태양의 적: 마지막 밤 | `hotpot_dj` |
| 09-03 | Cakeshop | The Nights by Dayoung Pre-Release | `dayounglie` |
| 09-04 | cakeshopseoul | Raw Hearts presents: CyberKills (BR) | `rawheartss` |
| 09-05 | Sevens | 정일훈 공연 | `sevens7_official_` |
| 09-12 | Sevens | 빅걸포 공연 | `sevens7_official_` |
| 09-13 | FF | Dancing shoes @FF | `hongdaeff` |
| 09-18 | 와이키키 | Special Guest @giriboy91 | `waikiki_daejeon` |
| 09-19 | Club Enter | 양홍원 방문 | `clubenter_official` |

**조치함**: 9건 전부 `approved`로 복구. 9월 공연이 **6일치 → 13일치**로 늘었다.
국일관 성인나이트 1건(`2026FKKM미래성인관광나이트`)만 의도적으로 `rejected` 유지.

```sql
-- 실행한 것과 동등한 쿼리
UPDATE club_events SET status = 'approved'
WHERE event_date >= '2026-08-30'
  AND status IN ('rejected','flagged')
  AND club_name_raw <> '국일관';
```

**미해결 — 다음 사람이 볼 것**
- `parse_confidence`가 전부 `null`인데 왜 거절됐는지 근거가 남아 있지 않다
- 전체로 보면 `approved 499 / flagged 33 / rejected 75`
- **수집기(`supabase/functions/collect-club-events/index.ts`)의 거절 판정 로직을 봐야 한다**
- 거절 사유를 컬럼에 남기지 않으면 이 문제는 반복된다

⚠️ `rejected`·`confirmed`는 `humanDecided`로 취급돼 **재수집 시 보존된다**
(`collect-club-events/index.ts:431`). 즉 한번 잘못 거절되면 자동으로는 절대 안 돌아온다.

---

## 3. 공연 데이터 자체가 얇다 (미해결)

```
승인 공연 총 499건
  지난 공연  486건
  예정 공연   13건 → (복구 후) 22건
```

지역 분포(지난 공연 486건 기준):
```
홍대 137 · 이태원 87 · (없음) 67 · 서울 64 · 강남 37
대전 30 · 부산 19 · 타이페이 16 · 도쿄 14
광주 4 · 대구 4 · 홍콩 3 · 인천 2 · 제주 2
```

**공급원 편중**
```
hiphopplayacalendar  487건  ← 사실상 전부
나머지 클럽 계정        12건
```

**중요**: 사용자가 스크린샷으로 준 클럽 포스터들은 전부 **`club_lineups`(DJ 라인업 탭)**
으로 들어갔다. `club_events`(공연 탭)에는 수동 입력분이 없다.
두 테이블은 들어가는 자리가 다르다.

```
club_lineups   ig_auto 135 · admin_manual 10 · admin_vision 6 · ig_review 1
club_events    hiphopplayacalendar 487 · 기타 12
```

**미완료 작업**: 경쟁사 캘린더(khhcalendar) 9월 공연 13건을 우리 DB에 넣는 것.
사용자가 지시했으나 **아직 안 넣었다.** 개별 웹검색은 결과가 없어 실패했고,
사이트를 직접 fetch하려던 시도는 중단됐다.

⚠️ **추측으로 채우지 말 것.** 날짜·장소·라인업을 지어내면 테이블 전체 신뢰도가 무너진다.
소스(사이트 URL 또는 포스터 원본)를 확보한 뒤 넣어야 한다.

---

## 4. dedup 키 결함과 그 수정 (Migration 606)

**증상**: 클럽을 새로 추가할 때마다 같은 공연이 두 행이 된다.

**원인** — `572_club_events_dedupe.sql`

```sql
club_events_venue_key(p_club_id, p_name)
  = COALESCE(p_club_id::TEXT, 정규화한_이름, '(unknown)')
```

`club_id`가 있으면 UUID, 없으면 이름이 키다.
**같은 공연이라도 한쪽만 클럽에 연결돼 있으면 키가 달라져** UNIQUE 인덱스를 통과한다.

**실제 사례**: 세븐즈(대전) 클럽을 추가한 순간
- 8/27 수집: `raw="세븐즈"` (club_id NULL) → 키 = `"세븐즈"`
- 8/28 수집: `raw="Sevens"` (club_id 있음) → 키 = UUID

같은 인스타 게시물인데 두 행으로 남았다.

**수정** — `606_club_events_reconnect_on_club_change.sql`

인덱스 함수만 바꿔서는 못 고친다(원문 이름 표기가 소스마다 달라 이름 키도 갈린다).
그래서 **클럽 추가·별칭 변경 시 기존 이벤트를 재연결하고 그 자리에서 병합**한다.

- `normalize_club_name_text()` — 572의 정규화 규칙을 함수로 분리해 재사용
- `reconnect_events_for_club(club_id, keys[])` — 재연결 + 병합 핵심 로직
- `clubs` INSERT/UPDATE(name, aliases) 트리거
- 일회성 백필 포함

⚠️ **순서 주의**: `club_id`를 먼저 채우고 나중에 병합하면 안 된다.
같은 날짜에 이미 그 club_id로 연결된 행이 있을 때 UPDATE 순간
`uniq_club_events_date_venue`를 즉시 위반한다(plain UNIQUE INDEX는 DEFERRABLE 불가).
그래서 행 단위로 "이미 연결된 행이 있으면 병합, 없으면 연결"을 골라 처리한다.

---

## 5. 아티스트 슬러그 (Migration 607)

**문제**: `ensure_artist()`(568)가 slug를 `[^a-z0-9]+`로만 걸러
한글 이름은 전부 `artist-<md5 8자리>`가 됐다.

**실측**: 1,129명 중 **309명(27%)이 해시 슬러그**. 하필 출연 빈도 높은 한글 이름이 몰려 있었다
(키드밀리, 다이나믹 듀오, 팔로알토, 마브, 언텔).

**수정** — `607_artist_slug_korean.sql`

```sql
generate_artist_slug(display_name, english_alias)
-- 허용 문자에 가-힣 포함. 영문 별칭이 있으면 그걸 우선한다.
```

**결과 (적용 완료, 검증됨)**
```
키드밀리      → kid-milli      (영문 별칭 "KID MILLI" 있음)
팔로알토      → paloalto       (영문 별칭 "Paloalto" 있음)
다이나믹 듀오  → 다이나믹-듀오    (영문 별칭 없음 → 한글 그대로)
남은 해시 슬러그: 0건
```

⚠️ **한글↔영문 자동 매칭은 하지 않는다.** 키드밀리의 인스타는 `kidcozyboy`라
기계적 로마자 변환으로는 `kid-milli`가 안 나온다. 이미 `artist_aliases`에
두 표기가 함께 걸려 있는 경우에만 영문을 쓴다.

**별칭 현황**: 한글·영문을 **둘 다** 가진 아티스트는 68명(6%)뿐이다.
메타데이터에는 보유한 표기를 전부 병기한다(`키드밀리 (KID MILLI) 공연 일정`).

---

## 6. sitemap 등재 기준

**아티스트는 공연 2건 이상만 등재한다.**

```
출연 기록 있는 아티스트   1,129명
  공연 1건뿐              823명 (73%)  ← thin content, 제외
  공연 2건 이상            306명       ← 등재
```

공연장이 이미 쓰는 규칙(`sitemap.ts` — "공연 0건인 곳은 thin content 라 제외")과 같은 방식.

라우트 자체는 1,129명 전부 살아 있다. sitemap에만 안 넣는 것이다.

⚠️ `club_event_performers`를 다 받아 JS에서 집계한다(PostgREST가 count>=2 필터를 직접 못 함).
`limit(5000)` — 현재 2,003행이라 여유 있지만 늘어나면 확인 필요.

---

## 7. 반드시 지킬 규칙

### 커밋
- **`git add -A` 절대 금지.** Gemini가 같은 레포에서 병렬 작업 중이라 WIP가 섞인다
- 항상 pathspec 명시: `git commit -m "..." -- <파일1> <파일2>`
- 커밋 전 `git diff --cached --stat`로 스테이징 내용 확인
- 파일을 스테이징한 뒤 더 수정했으면 **다시 `git add`** (인덱스가 낡은 채로 커밋되는 사고가 실제로 있었다)

### 마이그레이션
- **`supabase db push` 금지.** 파괴적 재실행 위험
- Supabase 대시보드 SQL Editor에 **한 파일씩 수동 적용**
- 새 번호는 tracked + untracked **둘 다** 확인하고 잡는다
- **컬럼/함수를 추가하는 마이그레이션은 그걸 select하는 코드보다 먼저 적용한다.**
  안 그러면 프로덕션 404/500

### 빌드 검증
- 미커밋 파일이 섞이면 이번 공연장 사고를 또 놓친다
- `git stash push -u` → `npm run build` → `stash pop`으로 **커밋본만으로** 빌드가 통과하는지 확인

### 테이블 존재 확인
- `select("id", { count:"exact", head:true })`는 **테이블이 없어도 에러를 삼킨다.**
  실제로 이걸로 "이미 존재"라고 오판한 사고가 있었다
- 확인은 `select("*").limit(1)`로 하고 `error.message`를 본다

### 로컬 dev 서버
- 사용자가 쓰고 있을 수 있다. **명시 요청 없이 `pkill` 금지**

---

## 8. 남은 일

| 우선순위 | 항목 | 비고 |
|---|---|---|
| 높음 | 수집기 거절 판정 로직 조사 | 진짜 공연 43%를 거르고 있었다. 거절 사유 컬럼이 없어 재발 감지 불가 |
| 높음 | 공연 데이터 확충 | 경쟁사 캘린더 9월 13건 미입력. 소스 확보 필요 |
| 중간 | djs·artists 중복 126명 정리 | 이름만 같은 40명은 동명이인(Ash, Ken, SIM, GUNO…) — 기계적 병합 금지 |
| 중간 | 찜한 아티스트 모아보기 화면 | 찜은 되는데 목록 볼 데가 없다. DJ 찜도 같은 상태 |
| 낮음 | `/lineups`에 달력 붙이기 | 같은 컴포넌트 재사용. 8월 하순 일 10~34건이라 격자가 꽉 찬다 |
| 낮음 | 검색 결과에 사람 카드 | 검색 로그 157건이 압도적으로 지역명. 수요 미확인 |

### 검색 로그 참고 (`search_misses` 157건)
```
대전 22 · 신사 10 · 인천 7 · 전주 4 · 양양 3 · 제주 2 · 천안 2
사람 이름: 거의 0
화면별: clubs 151 · events 4 · lineups 2
```
⚠️ 이 로그는 **결과 0건만** 기록한다. "키드밀리"를 쳐서 공연이 하나라도 나왔으면 기록이 없다.
수요가 없다는 증거가 아니라 아직 못 재고 있다는 뜻이다.

---

## 9. 검증 방법

**공연장**
- `/venues/rollinghall`, `/venues/space-brick` → 200
- 없는 slug → 404 (Soft 404 아님: 응답 헤더 확인)
- `/sitemap.xml`의 `/venues/*`가 전부 200인지

**아티스트**
- `/artists/kid-milli` → 예정+지난 공연 표시
- `/artists/다이나믹-듀오` → 한글 슬러그가 브라우저에서 동작하는지
- 장소 링크가 `/venues/bunkr02`로 실제 이동하는지
- `/sitemap.xml`의 아티스트가 306개 내외인지 (1,129개 전부가 아니라)

**달력**
- `/events` 검색 아이콘 왼쪽 달력 버튼 → 격자 펼침
- 이번 달에 남은 공연 없으면 다음 달로 열리는지
- 공연 없는 날은 안 눌리는지

**찜**
- `/artists/kid-milli` 찜 → `/events` 최상단 "찜한 아티스트" 섹션 등장
- 접기 상태가 새로고침 후 유지되는지 (localStorage `events.favSectionOpen`)
- 출연진 이름 앞 하트

**dedup**
- 미연결 이벤트가 있는 클럽의 `aliases`에 별칭 추가 → `club_id` 채워지고 중복 없는지
- `club_event_performers`가 유실 없이 keeper로 이관됐는지

---

## 11. DJ 타임테이블(클럽 라인업) — 별개 축의 핵심 정보

⚠️ **공연(`club_events`)과 완전히 다른 파이프라인이다.** 테이블·페이지·수집기가 전부 따로다.
사용자가 포스터 스크린샷으로 준 클럽 타임테이블은 전부 이쪽(`club_lineups`)으로 들어간다.

### 11.1 테이블 구조

```
djs (557)              DJ 마스터 — 571명, slug NULL 0건
 └ dj_aliases          표기 변형 → 동일인 통합. normalized UNIQUE가 분열을 물리적으로 차단
club_lineups (558)     클럽 × 영업일 = 라인업 1건
 └ lineup_sets         셋 슬롯(시간대별 DJ)
lineup_drafts (561)    수동/자동 파이프라인이 수렴하는 중간 테이블
user_favorite_djs(570) DJ 찜
dj_claims (583)        DJ 본인 인증 신청
lineup_reports (576)   오류 제보
lineup_likes (596)     셋 좋아요
```

### 11.2 ⚠️ 시간 표현 — 이 프로젝트에서 가장 사고가 잦은 부분

**자정 넘김을 TIME으로 저장하지 않는다.** `ORDER BY`가 07:00을 맨 앞으로 올려
재생 순서가 통째로 깨지기 때문이다.

**영업일 06:00을 원점으로 한 경과 분(정수)으로 저장한다.**
```
22:00 → 960    00:00 → 1080    07:00 → 1500    08:00 → 1560
```
`ORDER BY start_min`이 곧 재생 순서. `end_min > start_min` 하나로 유효성 검증 끝.

**컷오프가 두 개다. 절대 헷갈리면 안 된다.**

| 용도 | 상수 | 값 | 위치 |
|---|---|---|---|
| 게스트 간판 요일 판정 | `BUSINESS_DAY_CUTOFF_HOUR` | 6시 | `lib/utils/hotdeal.ts` |
| **라인업 시간 변환** | `LINEUP_NIGHT_END_HOUR` | **9시** | `lib/lineups/time.ts` |

라인업이 9시인 이유: 포스터가 "DOOR OPEN 22:00 ~ 08:00"처럼 06~08시까지 같은 밤의
연장으로 다룬다. hotdeal.ts 컷오프(6시)를 그대로 쓰면 06:00 셋의 `start_min`이 0이 되어
**라인업 맨 앞으로 튀어오르는 정렬 버그**가 실제로 재현됐다(CLUB BERMUDA 포스터).

⚠️ `hotdeal.ts`의 `toBusinessMinutes`를 라인업에 재사용하지 말 것. 별도 함수다.

**경계값 제약 (Migration 604에서 수정됨)**
```
start_min  0 ~ 1619   (= 08:59까지 시작 가능)
end_min    0 ~ 1620   (= 09:00까지 종료 가능)
```
558이 start_min 상한을 1560(08:00)으로 잡았는데 코드는 9시 컷오프라 08:30이 1590이 되어
`23514 lineup_sets_start_min_check` 위반이 났다. **DB 제약을 넓혀서** 맞췄다.

### 11.3 ⚠️ 날짜 파싱 함정

포스터에 **일자만 있고 월이 없는 경우가 흔하다**(예: `[28. FRI]`).
그러면 Vision이 "28일이 금요일인 달"을 추측해 월을 지어낸다.

실제 사고: 8월에 올라온 ROOTS 포스터가 `11-28`로 파싱돼 목록에 3개월 뒤 항목으로 끼어들었다.

→ `resolveLineupDate()`가 기준 시각과 대조해 말이 안 되면 `null`을 반환한다.

⚠️ **이 함수는 두 곳에 복제돼 있다.** Deno가 npm 경로를 못 읽어 부득이한 복제다.
```
src/lib/lineups/time.ts
supabase/functions/_shared/lineup-logic.ts
```
**한쪽만 고치면 자동 수집과 수동 업로드의 날짜 판정이 갈라진다.**

### 11.4 DJ 이름 정규화

`normalizeDjName` 규약 — `src/lib/lineups/djName.ts`
```
소문자화 → 영숫자/한글만 남김 → 선행·후행 "dj" 제거

"DJ BERMUDA" → "bermuda"
"BERMUDA DJ" → "bermuda"
"버뮤다"      → "버뮤다"   ← 영문과 자동 매칭 불가
```

⚠️ **한글↔영문은 자동 매칭되지 않는다.** 운영자가 Admin에서 수동 연결해야 한다.
(아티스트 쪽 `artist_aliases`도 동일 규약 — §5 참조)

`dj_aliases.normalized`에 UNIQUE가 걸려 있어 **DB가 동일인 분열을 물리적으로 막는다.**
문자열로 저장했다면 6개월 뒤 한 DJ가 12개 엔티티로 쪼개졌을 것이다.

### 11.5 수집 파이프라인

```
[자동] IG business_discovery 폴링 ─┐
                                  ├─→ lineup_drafts (파싱 + 신뢰도)
[수동] Admin 포스터 업로드 ────────┘        │
                                          ├─ score≥85 & 미매칭DJ 0 → 자동 게시
                                          └─ 미달 → 검토 큐 → 운영자 확정
                                                    ↓
                                          upsert_club_lineup() RPC (559)
```

**`club_lineups.source` 4종**
| 값 | 의미 |
|---|---|
| `admin_manual` | 운영자가 포스터 없이 직접 입력 |
| `admin_vision` | 포스터 업로드 → Vision 파싱 → 확인 후 저장 |
| `ig_auto` | 자동 수집 + 신뢰도 통과로 사람 손 없이 게시 |
| `ig_review` | 자동 수집했지만 운영자가 검토 큐에서 확정 |

`ig_auto`/`ig_review`를 분리하는 이유: 자동 게시 정확도를 사후 감사하기 위함.
**`IG_AUTO_PUBLISH_ENABLED` 임계값 튜닝의 유일한 근거**가 된다.

**현재 분포** (2026-08-30)
```
ig_auto 135 · admin_manual 10 · admin_vision 6 · ig_review 1
```

### 11.6 ⚠️ 중복 방지의 정본은 `ig_permalink`

`lineup_drafts.ig_permalink`에 UNIQUE(부분 인덱스).

media ID는 **재조회가 불가능**하다(business_discovery 조사 결과).
permalink가 유일하게 안정적인 키다.

수집기는 INSERT를 시도하고 충돌하면 스킵한다 —
**재실행 안전성이 코드가 아니라 제약조건에서 나온다.**

`status='not_timetable'`이 중요하다: 타임테이블이 아닌 홍보물도 행은 남긴다.
안 그러면 다음 폴링에서 같은 게시물에 또 Vision 비용을 쓴다.

⚠️ 과거에 `pending` 초안이 영구 유실되는 사고가 있었다
(`pending` + `ig_permalink` UNIQUE + early return 조합). 6시간 reclaim으로 해결됨.

### 11.7 DJ 페이지 배선 (이미 완료돼 있음)

조사 중 "배선이 안 돼 있다"고 오판했다가 정정한 내용이다.

`DjNameButton`이 slug가 있으면 `<button>`이 아니라 `<a href="/dj/{slug}">`로 렌더한다.
동작은 시트 그대로(preventDefault)지만 **크롤러는 href를 보고 DJ 페이지를 탄다.**

이게 없으면 `/dj/*`가 sitemap에만 있고 내부 링크가 0인 고아 페이지가 된다
(시트는 닫혀 있을 때 DOM에 렌더되지도 않아 링크로 세어지지 않는다).

호출부 3곳 전부 `djs(id, slug, display_name, instagram)`을 받는다:
`LineupSetTable` · `ClubLineupSection` · `UpcomingLineupSheet`

⚠️ `DjProfileSheet.tsx`에 *"DJ 전용 페이지는 아직 없다"*는 **낡은 주석**이 남아 있다.
사실과 다르니 믿지 말 것.

### 11.8 찜 정렬 규칙 (`/lineups`)

**필터가 아니라 정렬이다.** 하트 안 한 것도 계속 보인다.

| 탭 | 정렬 순서 |
|---|---|
| 클럽 탭 | 찜한 클럽 → **찜한 DJ가 있는 클럽** → 클럽명 |
| DJ 탭 | 찜한 DJ → 시간순(`start_min`) → 캡션 순서 |

동순위는 클럽명으로 고정해 **로그인 전후로 순서가 요동치지 않게** 한다.

클럽 카드 DJ 미리보기에서 찜한 DJ만 하트 + 빨간색으로 구분한다.

### 11.9 관련 마이그레이션 전체

| 번호 | 내용 |
|---|---|
| 557 | `djs` 마스터 + `dj_aliases` |
| 558 | `club_lineups` + `lineup_sets` (영업일 분 단위 설계) |
| 559 | RLS + `upsert_club_lineup()` RPC |
| 561 | `lineup_drafts` (수동·자동 수렴점) |
| 567/569 | service_role 수집·쓰기 권한 |
| 570 | `user_favorite_djs` |
| 573 | `lineup_sets` 시간 선택적 허용 |
| 576/578/579 | 오류 제보 + 스토리지 + 검토 플로우 |
| 583/584 | DJ 인증 신청 / 프로필 편집 |
| 596 | 셋 좋아요 |
| 604 | `start_min` 상한 1560 → 1619 |

---

## 12. 적용 완료된 마이그레이션 (이번 범위)

| 번호 | 내용 | 적용 |
|---|---|---|
| 605 | `venues` 테이블 | ✅ (파일만 나중에 커밋) |
| 606 | 클럽 변경 시 이벤트 재연결·병합 | ✅ |
| 607 | 아티스트 한글 슬러그 | ✅ (해시 309 → 0) |
| 608 | `user_favorite_artists` | ✅ |
