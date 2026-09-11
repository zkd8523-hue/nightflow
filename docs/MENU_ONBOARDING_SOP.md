# 클럽 온보딩 SOP: DM → 메뉴판 입력 → 예약 가능 전환

콜드 DM으로 클럽 담당자와 연결된 뒤, 실제로 그 클럽을 외국인 예약 폼(`/en`,
`/ja`, `/zh`, `/zh-tw`)에서 예약 가능하게 만드는 전 과정. DM 발송 전략 자체는
이 문서의 대상이 아니다 — `.claude/plans/curried-churning-sunrise.md` 참고.

## 전체 흐름

```
① DM 발송 → 담당자 응답 (승인 O / 거절 X)
② 주대표(메뉴판) 사진 수령        ← 기존에 메뉴판 없던 클럽만
③ 사진을 club_menu_items/variants로 옮기는 마이그레이션 작성
④ 대시보드에 마이그레이션 적용
⑤ 승인 플래그 켜기 (SQL 한 줄)   ← 이게 bookable 스위치
⑥ 자동 반영 확인
⑦ 실제 주문이 들어오면 → 그때 클럽 담당자에게 MD 파트너 가입 요청
```

**예약 가능 판정식** (`src/lib/clubs/bookable.ts`):

```
bookable = has_menu AND (has_md OR agreed)
```

메뉴판만으로는 부족하다 — 사진을 읽어 구조화한 가격 정보일 뿐, 그 클럽이
"우리 이름으로 손님 예약을 받아도 된다"고 승낙했는지와는 별개다. 실제로
메뉴판만 보게 완화했다가 상의한 적 없는 B1(메뉴 15개·MD 0)이 예약 가능으로
노출된 적이 있다(2026-09-10).

"상의됐다"는 두 갈래로 성립한다:

| 축 | 소스 | 언제 |
|---|---|---|
| `has_md` | `club_partners`에 MD 연결 | 파트너 가입까지 끝난 클럽 |
| `agreed` | `clubs.foreign_booking_agreed` (Migration 666) | 콜드 DM으로 구두 승인만 받은 클럽 |

**파트너 가입을 기다리지 않는 이유**: 파트너 가입은 클럽 담당자가 직접 해야
하는 일이라 승인 직후에 요구하면 마찰이 크다. 실제 주문이 들어온 뒤에 요청하는
순서로 가는데, 그때까지 bookable이 아니면 주문 자체가 들어올 수 없다. 그래서
승인 사실만 플래그로 먼저 기록한다.

---

## ① DM 응답 이후: 사진 받기

담당자가 "정보 틀린 거 알려달라"에 답하며 관계가 열리면, 자연스러운 다음
요청은 **"혹시 주대표(가격표) 사진 있으면 보내주실 수 있나요? 손님이 직접
보고 고를 수 있게 정리해두려고요."** 두 가지를 받는다:

1. **주대표 사진** — 여러 장이어도 된다. 평일/주말판이 따로면 각각.
2. **테이블 차지(부대비용)** — 메뉴판 하단에 안 적혀 있으면 따로 물어본다.
   "테이블 차지 있나요? 평일/주말 다른가요?"

받은 사진은 `clubs.drink_menu_urls`(기존 이미지 배열 컬럼)에 우선 업로드해도
된다 — 구조화 전에도 클럽 상세 페이지 "Price list · Table map" 아코디언에서
바로 보여줄 수 있다. 다만 이것만으로는 `has_menu`가 켜지지 않는다(구조화는 아래 ③).

---

## ② 사진 읽기

Claude Code에서 이미지를 직접 읽으려면 로컬로 받아야 한다. Supabase Storage
URL을 그대로 Read 툴에 줄 수 없다 — 반드시 먼저 다운로드한다.

```bash
curl -sL "<drink_menu_urls의 실제 URL>" -o /tmp/menu-<club>-1.png
```

그 다음 Read 툴로 로컬 파일을 읽는다. 여러 장이면 전부 받아서 순서대로 읽고,
가격 표기 규칙(예: "350,0" = 350,000원처럼 천 단위 생략)이 장마다 다를 수
있으니 첫 장에서 규칙을 확정한 뒤 나머지에 일관 적용한다.

**읽으면서 반드시 확인할 것** (Migration 665 작업에서 실제로 부딪힌 함정들):

- **할인 표기**: 취소선으로 원가가 지워져 있으면 할인가를 채택. 다른 장에도
  같은 항목이 있으면 두 장이 일치하는지 대조.
- **B/G(Bottle/Glass) 구분**: 잔술(G) 가격은 테이블 예약 총액과 무관하므로
  넣지 않는다. 병(B) 가격만 옮긴다.
- **같은 품목이 다른 사진에 중복 등장**: 세트 메뉴판과 단품 메뉴판에 같은
  샴페인이 둘 다 나오면, 한쪽 기준으로 한 번만 INSERT한다(중복 INSERT 금지).
- **용량이 다른 변형**: "모엣 샹동"과 "모엣 샹동 매그넘 1.5L"는 합치지 말고
  독립 항목으로 분리한다.
- **택1 세트인데 가격이 선택과 무관**: choices 테이블(아래)로 풀지 않고,
  이름에 "택1"을 명시한 뒤 단일 variant로 넣어도 된다 — 가격이 갈릴 때만
  choices 구조의 값어치가 있다(MenuPicker UI 기준).
- **평일/주말 가격 차이**: `price`(평일) / `price_weekend`(주말, NULL이면
  평일과 동일)로 분리.
- **층/구역별 가격 차이**(EDM존 vs 힙합존 등): `zone` 컬럼을 반드시 채운다.
  비워두면 같은 이름의 항목이 값만 다르게 두 벌 들어가 손님이 구분 못 한다.
- **VVIP 섹션**: 장르(category)와 별개 축이라 `is_vvip = TRUE` 플래그만
  세우고 카테고리는 원래 장르 그대로(돔페리뇽 매그넘은 champagne + VVIP).
- **주문 자격 조건**("00:30 이전 입장 VIP 테이블만" 등): `condition_note`에
  문구 그대로 넣는다. 시스템이 판정하지 않고 화면에 문구만 노출.
- **다른 클럽 메뉴판이 섞여 들어온 경우**: 사진 하단 로고·주소가 요청한
  클럽과 다르면(Migration 646의 INTRO 오염 사례) 그 장은 통째로 제외하고
  마이그레이션 주석에 이유를 남긴다.

---

## ③ 마이그레이션 작성

### 스키마 (Migration 642에서 이미 완성됨, 재사용만 하면 됨)

| 테이블 | 용도 |
|---|---|
| `club_menu_items` | 품목 1행 = 샴페인/위스키/세트 등 하나. `category`, `name_en`(필수), `name_ko`, `condition_note`, `zone`, `is_vvip`, `sort_order` |
| `club_menu_variants` | 품목의 가격 옵션. 단품=1행, 병수 세트=N행. `label_en`, `price`(평일), `price_weekend`(주말, NULL=평일과 동일) |
| `club_menu_choices` | 선택형 세트의 후보 품목("하드 1병 택1: 테킬라/보드카/..."). `slot_no`로 택1 슬롯 구분, `extra_price`로 업차지 |
| `club_menu_combos` | "샴페인 N + 하드 M = 가격" 조합표(Club Ace형, 흔치 않음) |
| `clubs.table_charge_weekday` / `_weekend` | 클럽 단위 테이블 차지. NULL=미확인, 0=확인했고 안 받음 |

`category` CHECK 제약: `champagne, liqueur, whisky, tequila, vodka, cognac,
gin, rum, set` — 이 9개 밖의 값을 넣으면 INSERT가 거부된다.

### 파일 작성 패턴

`supabase/migrations/665_menu_arzu_cheongdam.sql`을 템플릿으로 삼는다:

```sql
-- 재실행 안전장치 — 이 클럽 데이터만 걷어내고 다시 넣는다.
DELETE FROM club_menu_items WHERE club_id = '<해당 클럽 UUID>';

-- 테이블 차지를 알아냈으면 여기서 같이 반영
UPDATE clubs SET table_charge_weekday = ..., table_charge_weekend = ...
WHERE id = '<club_id>';

WITH src(name_en, name_ko, price, ord) AS (VALUES
  ('Moët & Chandon', '모엣 상동', 300000, 1),
  ...
),
ins AS (
  INSERT INTO club_menu_items (club_id, category, name_en, name_ko, sort_order)
  SELECT '<club_id>', 'champagne', name_en, name_ko, ord FROM src
  RETURNING id, name_en
)
INSERT INTO club_menu_variants (item_id, label_en, label_ko, price, sort_order)
SELECT ins.id, '1 bottle', '1병', src.price, 1
FROM ins JOIN src ON src.name_en = ins.name_en;
```

- **파일 상단 주석에 반드시 남길 것**: 사진 출처(누구에게 받았는지, 언제),
  장 수와 각 장의 내용, 읽으며 내린 판단(할인가 채택 여부, 제외한 항목과
  이유, 중복 처리 방식). Migration 665의 헤더 주석이 표준 형태.
- **클럽 UUID 조회**: `SELECT id, name FROM clubs WHERE name ILIKE '%<클럽명>%'`
- **다음 마이그레이션 번호**: tracked+untracked 모두 확인 후 번호 중복 없게
  ([[feedback_migration_number_check]] 참고)

### 세트/선택형 예시 (choices 사용)

```sql
INSERT INTO club_menu_choices (item_id, slot_no, name_en, name_ko, extra_price, sort_order)
SELECT i.id, 1, c.name_en, c.name_ko, c.extra, c.ord
FROM club_menu_items i
CROSS JOIN (VALUES
  ('Jose Cuervo', '호세 쿠엘보', 0, 1),
  ('Jägermeister', '예거마이스터', 50000, 2)  -- 업차지 있는 후보
) AS c(name_en, name_ko, extra, ord)
WHERE i.club_id = '<club_id>' AND i.name_en = 'Hard Bottle Set 2';
```

---

## ④ 대시보드에 적용

**`supabase db push` 금지** — 파괴적 재실행 위험
([[feedback_supabase_manual_migrations]]). Supabase 대시보드 SQL Editor에
파일 내용을 그대로 붙여넣어 1건씩 수동 실행한다.

적용 순서 원칙: **마이그레이션이 코드보다 먼저.** 이 SOP의 마이그레이션은
기존 테이블에 행을 추가하는 것뿐이라 코드 배포 순서 걱정은 없다(스키마
변경이 섞인 경우만 순서 주의, [[feedback_migration_before_deploy]]).

---

## ⑤ 승인 플래그 켜기 — 이게 bookable 스위치

메뉴판을 넣었다고 예약 가능이 되지 않는다. DM에서 승인(O)을 받았다면 플래그를
켠다. SQL 한 줄이고, 별도 관리자 UI는 만들지 않았다(지금은 DM 단계라 빈도가
낮고 클럽마다 판단이 필요해 수동이 적합).

```sql
UPDATE clubs SET foreign_booking_agreed = TRUE WHERE name = '<클럽명>';
```

여러 곳을 한 번에:
```sql
UPDATE clubs SET foreign_booking_agreed = TRUE
WHERE name IN ('Lion Super Club', 'Fountain') AND deleted_at IS NULL;
```

승인을 못 받았거나 나중에 철회되면 `FALSE`로 되돌린다. 컬럼 하나라 되돌리기가
안전하다(메뉴판 데이터는 그대로 두면 되고, 다시 승인되면 플래그만 켜면 된다).

---

## ⑥ 반영 확인

```sql
-- 메뉴판이 들어갔는지
SELECT category, count(*) FROM club_menu_items WHERE club_id = '<club_id>' GROUP BY category;

-- 예약 가능 판정 3요소를 한눈에
SELECT c.name,
       EXISTS (SELECT 1 FROM club_menu_items m WHERE m.club_id = c.id) AS has_menu,
       EXISTS (SELECT 1 FROM club_partners p WHERE p.club_id = c.id)   AS has_md,
       c.foreign_booking_agreed                                        AS agreed
FROM clubs c WHERE c.name = '<클럽명>';
```

`has_menu AND (has_md OR agreed)`가 참이면 다음이 전부 자동으로 바뀐다:

- 클럽 목록·홈(`ClubsClient`, `EnHomeClient`) → ⚡배지 노출, 예약 가능 우선 정렬
- 클럽 상세 4개 언어 → CTA가 "Booking coming soon" → "🍾 Book {클럽명}",
  JSON-LD FAQ도 "예약해드립니다"로 전환
- 외국인 예약 폼(`ForeignRequestForm.tsx`) → 클럽 선택 목록에 등장, 메뉴판 표시
- `/en/clubs`의 "Bookable" 탭 목록에 포함

**주의**: Next.js 캐시(`revalidate=30`)로 화면 반영은 최대 30초 지연. DB 조회로
먼저 확인할 것([[feedback_migration_before_deploy]]의 "방만404" 오진 사례 참고).

---

## ⑦ 주문 들어온 뒤 — 파트너 가입 요청

실제 예약 요청이 접수되면 그때 클럽 담당자에게 MD 파트너 가입을 안내한다.
가입이 끝나 `club_partners`에 연결되면 `has_md`가 켜지고, 그때부터는 승인
플래그와 무관하게 예약 가능 상태가 유지된다(둘 중 하나만 있으면 되므로).

---

## 체크리스트 (클럽 1곳당)

- [ ] DM 승인(O) 확인 — **이게 없으면 아래를 진행하지 않는다**
- [ ] 주대표 사진 확보(+ 테이블 차지 확인)
- [ ] 사진 다운로드 → Read로 실제 읽음(추측 금지)
- [ ] 할인/중복/용량차이/택1/평일주말/zone/VVIP 함정 점검
- [ ] `SELECT id FROM clubs WHERE name ILIKE ...`로 club_id 확보
- [ ] 마이그레이션 번호 중복 확인 후 파일 작성(상단에 출처·판단 근거 주석)
- [ ] 대시보드에서 수동 적용
- [ ] **`foreign_booking_agreed = TRUE` 켜기**
- [ ] 위 3요소 쿼리로 판정 확인
- [ ] `/en/clubs/<area>/<club>` 페이지에서 실제 "Book" CTA 확인(캐시 지연 감안)

## 관련

- DM 발송 전략·대상 클럽 목록: `.claude/plans/curried-churning-sunrise.md`
- 예약 가능 판정 전체 파이프라인: `.claude/plans/foreign-booking-checklist.md`
- 스키마 원본: `supabase/migrations/642_club_menu_and_data.sql`
- 최근 실제 작업 예시: `supabase/migrations/665_menu_arzu_cheongdam.sql`
- [[project_en_track_redesign_mockups]] [[reference_foreign_funnel_sop]]
