# Supabase Edge Functions Cron 활성화 가이드

## 🎯 목적
경매 상태 자동 전환을 위한 Cron Job 활성화

## 📋 현재 상황
- ✅ Edge Function 코드는 이미 배포되어 있음
- ❌ Cron 스케줄이 비활성화 상태
- ⚠️ 결과: 경매 상태가 시간이 지나도 자동으로 전환되지 않음

## 🔧 활성화 방법

### 1️⃣ activate-scheduled-auctions (경매 시작 자동화)

**목적**: `scheduled` 상태 경매를 시작 시간이 되면 자동으로 `active`로 전환

**설정 단계**:
1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트 선택 (nightflow)
3. 좌측 메뉴: **Edge Functions** 클릭
4. 함수 목록에서 **`activate-scheduled-auctions`** 클릭
5. 상단 탭에서 **Settings** 클릭
6. **Cron Schedule** 섹션 찾기
7. 다음 설정 입력:
   ```
   Schedule Expression: * * * * *
   Region: (기본값 유지)
   ```
8. **Enable** 버튼 클릭
9. 우측 하단 **Save** 버튼 클릭

**스케줄 설명**:
- `* * * * *`: 매 1분마다 실행
- 형식: `분 시 일 월 요일`

**동작**:
- 시작 시간(`auction_start_at`)이 현재 시간 이전인 `scheduled` 경매를 찾음
- 해당 경매의 status를 `active`로 업데이트
- 구독자에게 SOLAPI 알림톡 발송 (설정 시)

---

### 2️⃣ close-expired-auctions (경매 종료 자동화)

**목적**: `active` 상태 경매를 종료 시간이 되면 자동으로 `won` 또는 `unsold`로 전환

**설정 단계**:
1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트 선택 (nightflow)
3. 좌측 메뉴: **Edge Functions** 클릭
4. 함수 목록에서 **`close-expired-auctions`** 클릭
5. 상단 탭에서 **Settings** 클릭
6. **Cron Schedule** 섹션 찾기
7. 다음 설정 입력:
   ```
   Schedule Expression: */2 * * * *
   Region: (기본값 유지)
   ```
8. **Enable** 버튼 클릭
9. 우측 하단 **Save** 버튼 클릭

**스케줄 설명**:
- `*/2 * * * *`: 매 2분마다 실행
- 더 자주 실행하려면 `* * * * *` (1분마다) 사용 가능

**동작**:
- 종료 시간(`effective_end_at`)이 현재 시간 이전인 `active` 경매를 찾음
- `close_auction()` RPC 호출하여 낙찰/유찰 처리
- 낙찰 시 SOLAPI 알림톡 발송 (설정 시)

---

## ✅ 확인 방법

### 1. Cron이 활성화되었는지 확인
1. Supabase Dashboard → Edge Functions
2. 각 함수 클릭 → **Settings** 탭
3. **Cron Schedule** 섹션에 녹색 **Enabled** 표시 확인

### 2. 실행 로그 확인
1. Supabase Dashboard → Edge Functions
2. 각 함수 클릭 → **Logs** 탭
3. 최근 실행 기록 확인:
   - `activate-scheduled-auctions`: 1분마다 실행 기록
   - `close-expired-auctions`: 2분마다 실행 기록
4. 에러가 있는지 확인

### 3. 테스트 (선택)
**Scheduled → Active 전환 테스트**:
1. MD 대시보드에서 새 경매 등록
2. 시작 시간을 **현재 시간 + 1분**으로 설정
3. 등록 후 약 2분 대기
4. Admin 경매 관리 페이지에서 "예정" → "진행중"으로 이동 확인

**Active → Won/Unsold 전환 테스트**:
1. 종료 시간을 **과거 시간**으로 설정한 테스트 경매 생성
2. 약 3분 대기
3. Admin 경매 관리 페이지에서 "진행중" → "연락 대기" 또는 "종료"로 이동 확인

---

## 🚨 문제 해결

### Cron이 실행되지 않는 경우
1. **함수 배포 확인**:
   ```bash
   supabase functions list
   ```
   목록에 두 함수가 있는지 확인

2. **환경변수 확인**:
   - Dashboard → Project Settings → Edge Functions → Manage secrets
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 설정 확인

3. **로그 확인**:
   - Dashboard → Edge Functions → [함수명] → Logs
   - 에러 메시지 확인

### 통계가 여전히 맞지 않는 경우
1. **브라우저 캐시 클리어**:
   - Admin 페이지 새로고침 (Ctrl/Cmd + Shift + R)

2. **시간대 확인**:
   - DB의 시간대와 서버 시간대가 일치하는지 확인
   - Supabase는 기본적으로 UTC 사용

3. **코드 반영 확인**:
   ```bash
   npm run build
   npm run start
   ```
   - `AdminAuctionManager.tsx`의 시간 기반 통계 계산이 반영되었는지 확인

---

## 📊 예상 효과

### Before (Cron 비활성화)
- ❌ scheduled 경매가 시작 시간이 지나도 scheduled 상태로 남음
- ❌ active 경매가 종료 시간이 지나도 active 상태로 남음
- ❌ Admin 통계가 실제와 다름
- ⚠️ 입찰이 발생해야만 scheduled→active 전환됨 (place_bid 함수 내 로직)

### After (Cron 활성화)
- ✅ scheduled 경매가 시작 시간 되면 자동으로 active로 전환 (1분 이내)
- ✅ active 경매가 종료 시간 되면 자동으로 won/unsold로 전환 (2분 이내)
- ✅ Admin 통계가 실시간으로 정확하게 표시됨
- ✅ 입찰이 없어도 경매가 자동으로 시작됨

---

## 📝 참고 사항

### Cron 표현식 예시
- `* * * * *`: 매 1분
- `*/2 * * * *`: 매 2분
- `*/5 * * * *`: 매 5분
- `0 * * * *`: 매 시간 정각
- `0 0 * * *`: 매일 자정

### 비용 고려사항
- Supabase Free Tier: 500,000 함수 호출/월
- `activate-scheduled-auctions` (1분마다): 43,200 호출/월
- `close-expired-auctions` (2분마다): 21,600 호출/월
- **합계**: ~64,800 호출/월 (여유 있음)

### 알림톡 연동 (선택)
Cron이 활성화되면 자동으로 알림톡도 발송됩니다:
- **경매 시작**: `ALIMTALK_TPL_AUCTION_STARTED` 템플릿
- **낙찰**: `ALIMTALK_TPL_AUCTION_WON` 템플릿

SOLAPI 환경변수가 설정되지 않았으면 알림톡은 건너뜀 (경매 상태 전환은 정상 동작).

---

**작성일**: 2026-03-08
**작성자**: Claude Code
**관련 파일**:
- `supabase/functions/activate-scheduled-auctions/index.ts`
- `supabase/functions/close-expired-auctions/index.ts`
- `src/components/admin/AdminAuctionManager.tsx`
