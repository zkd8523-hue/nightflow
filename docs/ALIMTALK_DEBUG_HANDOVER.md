# 알림톡 발송 문제 인수인계 (Gemini 인수)

**작성일**: 2026-05-17
**작성자**: Claude (Opus 4.7)
**상태**: 미해결, 사용자 4명에게 5분마다 중복 발송 중 🚨

---

## 1. 핵심 증상

`notify-puzzle-events` Edge Function이 매 5분마다 **같은 4명의 깃발 리더**에게 `puzzle_first_offer` 알림톡을 **중복 발송**하고 있음.

- 알림톡은 SOLAPI로 실제 발송됨 (Edge Function 로그에서 `✅ 알림톡 발송 (event=puzzle_first_offer, userId=...)` 확인)
- `notification_logs` 테이블에는 한 건도 기록 안 됨 (puzzle 관련 0건)
- 결과: `alreadySent` 체크가 항상 false → 중복 발송 반복

### 로그 증거
```
17 May 26 05:30:07  ✅ 알림톡 발송 (event=puzzle_first_offer, userId=30f28f04...)
17 May 26 05:30:07  ✅ 알림톡 발송 (event=puzzle_first_offer, userId=2aae9f63...)
17 May 26 05:30:07  ✅ 알림톡 발송 (event=puzzle_first_offer, userId=1e4007ea...)
17 May 26 05:30:06  ✅ 알림톡 발송 (event=puzzle_first_offer, userId=0e5b651f...)
... (5분 뒤 동일 userId 4명에게 또 발송)
17 May 26 05:35:03  ✅ 알림톡 발송 (event=puzzle_first_offer, userId=30f28f04...)
17 May 26 05:35:03  ✅ 알림톡 발송 (event=puzzle_first_offer, userId=2aae9f63...)
17 May 26 05:35:02  ✅ 알림톡 발송 (event=puzzle_first_offer, userId=1e4007ea...)
17 May 26 05:35:02  ✅ 알림톡 발송 (event=puzzle_first_offer, userId=0e5b651f...)
```

---

## 2. 진짜 원인 (가설 2개)

### 가설 A: `notification_logs` CHECK + FK 제약 위반
**Migration 013**과 **Migration 050**에서 정의:

```sql
event_type CHECK (event_type IN (
  'auction_started', 'auction_won', 'visit_confirmed', 'outbid',
  'closing_soon', 'noshow_penalty', 'contact_deadline_warning', 'fallback_won'
))
-- puzzle_*, md_approved 누락

auction_id UUID NOT NULL REFERENCES auctions(id)
-- puzzle.id 넣으면 FK 위반
```

→ Edge Function의 INSERT가 silent 실패 → 알림톡은 보내고 기록은 못 함.

### 가설 B: `alreadySent` 함수 스키마 불일치 (확인 필요)
`supabase/functions/notify-puzzle-events/index.ts` line 44-49:
```ts
const query = supabase
  .from("notification_logs")
  .select("id")
  .eq("event_type", eventType)
  .eq("puzzle_id", puzzleId)   // ← 컬럼명 puzzle_id
  .eq("status", "sent");
```

그런데 `notification_logs` 스키마에는 **`puzzle_id` 컬럼이 없고 `auction_id`만 존재**.
→ alreadySent 쿼리 자체가 컬럼 미존재 에러 → catch에서 false 반환 → 매번 재발송.

**둘 중 어느 가설인지 검증 필요**:
- 가설 B가 진짜 원인일 수 있음 (alreadySent가 단순히 컬럼명 틀려서 항상 false)
- 가설 A는 그 위에 겹친 별개 문제 (INSERT도 실제로 실패하는지)

검증 방법:
```sql
-- 가설 A 검증
INSERT INTO notification_logs
  (event_type, auction_id, recipient_user_id, recipient_phone, template_id, status)
VALUES ('puzzle_first_offer', '<실존 puzzle id>', '<리더 user id>', '01000000000', 'test', 'sent');
-- 결과: 에러 → 가설 A 확정 / 성공 → 가설 A 기각

-- 가설 B 검증
\d notification_logs
-- puzzle_id 컬럼 있나 확인
```

---

## 3. 사용자 의도 (SOLAPI 템플릿 4개 정리)

유저가 활성화하기로 한 템플릿만:

| 템플릿 이름 (SOLAPI) | 템플릿 ID | 사용 위치 (env var) | 발송 경로 |
|---|---|---|---|
| md신청 승인 알람 | `KA01TP260418193658650JFrDpMFOJou` | `ALIMTALK_TPL_MD_APPROVED` | Next.js API: `src/app/api/admin/mds/[id]/approve/route.ts` |
| ① PUZZLE_FIRST_OFFER | `KA01TP260423210327921pKKscNcbkyl` | `ALIMTALK_TPL_PUZZLE_FIRST_OFFER` | Edge Function: `handleFirstOffer` |
| 깃발 D-2 오퍼 리마인더 | `KA01TP260508090231591Op7cAu0nMTK` | `ALIMTALK_TPL_PUZZLE_DEADLINE_REMINDER` (현재 매핑) | Edge Function: `handleDeadlineReminder` |
| ⑤ PUZZLE_OFFER_WON | `KA01TP260414212234808KShqWCf43WR` | `ALIMTALK_TPL_PUZZLE_OFFER_WON` | Edge Function: `handleOfferWon` |

### ⚠️ 매핑 충돌 (D-2 리마인더)
Edge Function 코드에는 **2개의 reminder 핸들러**가 있음:
- `handleDeadlineReminder`: env=`PUZZLE_DEADLINE_REMINDER`, 시점 = **D-day 20:00 KST** (행사 당일)
- `handleOfferReminder`: env=`PUZZLE_OFFER_REMINDER`, 시점 = **D-2 19:00 KST** (행사 2일 전)

유저는 "D-2" 템플릿을 `PUZZLE_DEADLINE_REMINDER` 변수에 넣었지만, **실제 D-2 발송은 `PUZZLE_OFFER_REMINDER`에서 일어남**. Supabase secrets 보면 두 변수 모두 같은 digest로 설정되어 있어서 D-2 발송은 동작하나, D-day(같은 날) 발송도 같은 D-2 템플릿 내용으로 나가게 됨 → 메시지 컨텍스트 충돌.

### 해결 방향 옵션
- **(가)** D-day 리마인더 비활성: secret `ALIMTALK_TPL_PUZZLE_DEADLINE_REMINDER` 비우거나 unset
- **(나)** 코드 정리: `handleDeadlineReminder` 핸들러 자체 제거 (유저는 D-2만 원함)
- 추천: **(나)** — 옛 D-day 핸들러 호출 자체를 막아야 깔끔

---

## 4. 현재 상태

### Supabase Edge Function Secrets (`npx supabase secrets list`)
```
✅ SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, SOLAPI_SENDER_NUMBER
✅ ALIMTALK_TPL_PUZZLE_FIRST_OFFER
✅ ALIMTALK_TPL_PUZZLE_DEADLINE_REMINDER (= D-2 템플릿)
✅ ALIMTALK_TPL_PUZZLE_OFFER_REMINDER (= D-2 템플릿, 같은 digest)
✅ ALIMTALK_TPL_PUZZLE_OFFER_WON
⚠️ ALIMTALK_TPL_PUZZLE_LEADER_CHANGED (옛 ID — 솔라피에서 삭제됐을 가능성)
⚠️ ALIMTALK_TPL_PUZZLE_MATCHED (옛 ID — 솔라피에서 삭제됐을 가능성)
✅ ALIMTALK_TPL_AUCTION_WON, _EARLYBIRD_DDAY_REMINDER, _MD_NOSHOW_CHECK, _NOSHOW_BANNED (옛 시스템용, 미사용 권장)
❌ ALIMTALK_TPL_MD_APPROVED (Supabase에 없음. Next.js 라우트에서 쓰므로 영향 X, Vercel env에는 있어야 함)
```

### `.env.local` (로컬 개발용)
```
ALIMTALK_TPL_MD_APPROVED=KA01TP260418193658650JFrDpMFOJou
ALIMTALK_TPL_PUZZLE_FIRST_OFFER=KA01TP260423210327921pKKscNcbkyl
ALIMTALK_TPL_PUZZLE_DEADLINE_REMINDER=KA01TP260508090231591Op7cAu0nMTK
ALIMTALK_TPL_PUZZLE_OFFER_WON=KA01TP260414212234808KShqWCf43WR
# 나머지는 주석 처리됨
```

### Cron Job 16
- 스케줄: `*/5 * * * *`
- 호출 URL: `https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/notify-puzzle-events`
- 상태: 실행 중, 매 호출 succeeded
- 첫 실행 시각: 미확인

### DB 상태
- `notification_logs` total: 10건 (모두 옛 경매 플로우: auction_won 6, visit_confirmed 2, noshow_penalty 2)
- puzzle 관련: **0건**
- md_approved 관련: **0건** (32명 승인됐고 30명 phone 있는데도)
- 영향받은 깃발: 4개 (id 51542105, 1c12b8a9, 245a1704, ea554358 — 모두 status=open, pending offer 보유)

### MD 승인 알림 별개 이슈
- 32명 승인, 30명 phone 있음
- 그런데 `notification_logs.md_approved` 0건
- 원인 후보:
  1. 옛날 승인분 (approve route에 INSERT 코드 추가되기 전)
  2. 직접 DB로 `md_status='approved'` 수정 (route 우회)
  3. Vercel env에 `ALIMTALK_TPL_MD_APPROVED` 없어서 발송 실패 + 가설 A로 logs 기록도 실패
  4. 가설 B로 인한 silent fail (덜 가능성 높음, 이건 Edge Function 경로 아님)

---

## 5. 작성한 산출물

### Migration 186 (`supabase/migrations/186_notification_logs_relax.sql`) — ⚠️ 미적용
```sql
-- 1) auction_id FK 제거 (entity_id 의미로 재해석)
ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_auction_id_fkey;

-- 2) event_type CHECK 확장 (puzzle_*, md_approved 추가)
ALTER TABLE notification_logs DROP CONSTRAINT IF EXISTS notification_logs_event_type_check;
ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_event_type_check
  CHECK (event_type IN (
    'auction_started', 'auction_won', 'visit_confirmed', 'outbid',
    'closing_soon', 'noshow_penalty', 'contact_deadline_warning', 'fallback_won',
    'md_approved',
    'puzzle_first_offer', 'puzzle_deadline_reminder', 'puzzle_offer_won',
    'puzzle_leader_changed', 'puzzle_offer_reminder', 'puzzle_matched'
  ));
```

이걸 적용해도 **가설 B (alreadySent의 `puzzle_id` 컬럼 미존재)는 별개로 해결해야 함**.

---

## 6. 권장 액션 (우선순위)

### 🔴 즉시 (스팸 중단)
```sql
SELECT cron.unschedule(16);
```
사람들이 더 받지 않도록 cron 일시 중지.

### 🟡 가설 검증
1. **가설 B 먼저**: `\d notification_logs` 로 컬럼 확인. `puzzle_id` 컬럼 있으면 가설 B 기각. 없으면 Edge Function 코드를 `auction_id`로 수정 또는 컬럼 추가.
2. **가설 A 검증**: 직접 INSERT 시도 → CHECK/FK 에러 확인.

### 🟢 수정
가설 결과에 따라:
- **가설 B 확정** → Edge Function 코드 line 48 `puzzle_id` → `auction_id`로 수정 (또는 `puzzle_id` 컬럼 추가하는 마이그레이션)
- **가설 A 확정** → Migration 186 적용
- **둘 다 진짜** → 둘 다 수정

### 🔵 백필 (중복 발송 방지)
가설 A 수정 후 cron 재가동 전에:
```sql
-- 이미 발송된 puzzle_first_offer 4건을 기록 (재발송 방지)
INSERT INTO notification_logs
  (event_type, auction_id, recipient_user_id, recipient_phone, template_id, status, created_at)
SELECT DISTINCT
  'puzzle_first_offer', p.id, p.leader_id, u.phone,
  'KA01TP260423210327921pKKscNcbkyl', 'sent', now()
FROM puzzles p
JOIN users u ON u.id = p.leader_id
WHERE p.status = 'open'
  AND EXISTS (SELECT 1 FROM puzzle_offers WHERE puzzle_id = p.id AND status = 'pending')
  AND u.phone IS NOT NULL;
```

### 🟣 정리
- 사용 안 하는 Supabase secrets unset:
  ```bash
  npx supabase secrets unset \
    ALIMTALK_TPL_PUZZLE_LEADER_CHANGED \
    ALIMTALK_TPL_PUZZLE_MATCHED \
    ALIMTALK_TPL_PUZZLE_OFFER_REMINDER \
    ALIMTALK_TPL_AUCTION_WON \
    ALIMTALK_TPL_EARLYBIRD_DDAY_REMINDER \
    ALIMTALK_TPL_MD_NOSHOW_CHECK \
    ALIMTALK_TPL_NOSHOW_BANNED
  ```
- Edge Function 코드에서 `handleDeadlineReminder`, `handleLeaderChanged`, `handleMatched`, `handleOfferReminder` (중 사용 안 할 것) 제거 또는 비활성
- Vercel env에 `ALIMTALK_TPL_MD_APPROVED` 있는지 확인 (없으면 등록)

### ⚪ 검증
```sql
-- 적용 후 5~10분 기다린 뒤 확인
SELECT event_type, status, COUNT(*)
FROM notification_logs
WHERE created_at > now() - INTERVAL '30 minutes'
GROUP BY event_type, status;
```
- `puzzle_first_offer` status=sent 가 늘어나지 **않아야** 정상 (백필했으므로 alreadySent=true → 더 안 보냄)
- 새 깃발/오퍼 발생 시에만 한 건씩 늘어나야 정상

---

## 7. 사용자 메모

- 유저는 dev 환경 admin 계정으로 테스트 중
- "정확하게 4개 알림톡이 세팅되어 있는지" 확인이 핵심 의도
- 이전 Claude 작업: 얼리버드 = 조각(share) 모드 도입 (별개 작업, Migration 172-185 + AuctionForm 재작성)
- 현재 4명의 깃발 리더가 5분마다 알림톡 받고 있음 — 빨리 멈춰야 함
