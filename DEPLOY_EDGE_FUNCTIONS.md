# Edge Functions 배포 가이드

## 1. Supabase CLI 설치

### macOS
```bash
brew install supabase/tap/supabase
supabase --version
```

### Windows
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Linux
```bash
brew install supabase/tap/supabase
```

---

## 2. Supabase 프로젝트 연결

```bash
cd nightflow
supabase login
supabase link --project-ref ihqztsakxczzsxfvdkpq
```

**프로젝트 ID**: `ihqztsakxczzsxfvdkpq` (NEXT_PUBLIC_SUPABASE_URL에서 확인)

---

## 3. Edge Function 배포

### 전체 함수 배포
```bash
supabase functions deploy
```

### 특정 함수만 배포
```bash
supabase functions deploy close-expired-auctions
```

---

## 4. 환경변수 확인

Edge Function은 자동으로 다음 환경변수를 사용:
- `SUPABASE_URL`: Supabase 프로젝트 URL (자동 주입)
- `SUPABASE_SERVICE_ROLE_KEY`: 서비스 역할 키 (자동 주입)

**추가 환경변수가 필요한 경우**:
```bash
supabase secrets set MY_SECRET=value
```

---

## 5. 로컬 테스트

### 로컬 Supabase 시작 (선택사항)
```bash
supabase start
```

### Edge Function 로컬 실행
```bash
supabase functions serve close-expired-auctions --project-ref ihqztsakxczzsxfvdkpq
```

### 수동 테스트 (HTTP 요청)
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/close-expired-auctions' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```

---

## 6. 프로덕션 확인

### 함수 목록 확인
```bash
supabase functions list
```

### Cron 스케줄 확인
Supabase Dashboard → Edge Functions → close-expired-auctions → Settings
- Schedule: `*/5 * * * *` (5분마다) 확인

### 로그 확인
Supabase Dashboard → Edge Functions → close-expired-auctions → Logs
- 실행 기록, 에러 확인

---

## 7. 테스트 시나리오

### 시나리오 1: 과거 시간 경매 생성
```sql
-- Supabase SQL Editor에서 실행
UPDATE auctions
SET auction_end_at = now() - INTERVAL '10 minutes'
WHERE id = 'YOUR_AUCTION_ID' AND status = 'active';
```

**예상 결과**: 5분 이내에 자동으로 경매 종료 → status가 'won' 또는 'unsold'로 변경

### 시나리오 2: 수동 함수 호출
```bash
curl -i --location --request POST \
  'https://ihqztsakxczzsxfvdkpq.supabase.co/functions/v1/close-expired-auctions' \
  --header 'Authorization: Bearer YOUR_ANON_KEY'
```

**예상 응답**:
```json
{
  "total": 1,
  "success": 1,
  "failed": 0,
  "details": [
    {
      "auction_id": "...",
      "result": "won"
    }
  ]
}
```

---

## 8. 트러블슈팅

### 문제 1: "Function not found"
**해결**: 배포 재시도
```bash
supabase functions deploy close-expired-auctions --no-verify-jwt
```

### 문제 2: "Permission denied"
**해결**: Service Role Key 확인
- Supabase Dashboard → Settings → API → service_role key 복사
- `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY` 추가

### 문제 3: Cron이 실행 안됨
**해결**:
1. Supabase Dashboard → Edge Functions → close-expired-auctions → Settings
2. "Enable Cron" 토글 확인
3. Schedule 문법 확인: `*/5 * * * *`

---

## 9. 비용 최적화

- **무료 플랜**: 월 50만 요청, 400,000 GB-s
- **현재 사용량**: 5분마다 = 하루 288회 = 월 8,640회 (무료 범위 내)
- **권장**: 프로덕션에서는 10분 간격으로 변경 고려

```toml
# config.toml
[functions.close-expired-auctions.schedule]
cron = "*/10 * * * *"  # 10분으로 변경
```

---

## 10. 다음 단계

1. ✅ 경매 자동 종료 구현 완료
2. ⏭️ 결제 만료 처리 Edge Function (`process-payment-expiry`)
3. ⏭️ 토스페이먼츠 Webhook Handler (`handle-payment-webhook`)
4. ⏭️ 노쇼 처리 자동화 (`cleanup-blocked-users`)
