# MD 승인 시 자동 SMS 발송 설정 가이드

## 📋 개요
MD가 승인되면 자동으로 SMS 문자가 발송되는 시스템입니다.

**작동 방식**:
```
Admin이 MD 승인
  ↓
Database Trigger 발동 (md_status → 'approved')
  ↓
Supabase Edge Function 호출
  ↓
Coolsms API로 SMS 발송
  ↓
MD에게 문자 도착 📱
```

---

## 🔑 Step 1: Coolsms 계정 생성 및 API 키 발급

### 1-1. Coolsms 회원가입
1. https://www.coolsms.co.kr 접속
2. 회원가입 (사업자 등록 필요 없음, 개인도 가능)
3. 휴대폰 인증

### 1-2. 발신번호 등록
1. 로그인 후 [발신번호 관리] 메뉴
2. 발신번호 등록 (본인 명의 휴대폰 번호)
3. ARS 인증 또는 서류 제출
4. 승인 대기 (보통 1-2시간)

### 1-3. API 키 발급
1. [개발자센터] → [API Key 관리]
2. [새 API Key 생성]
3. **API Key**와 **API Secret** 복사해서 안전한 곳에 보관

### 1-4. 충전
1. [충전/결제] 메뉴
2. 최소 5,000원 충전 (SMS 1건당 약 15원)
3. 테스트용이라면 5,000원이면 충분 (약 300건 발송 가능)

---

## ⚙️ Step 2: Supabase Edge Function 배포

### 2-1. Supabase CLI 설치 (이미 설치되어 있으면 생략)
```bash
# macOS
brew install supabase/tap/supabase

# 로그인
supabase login
```

### 2-2. Edge Function에 환경변수 설정
```bash
cd /Users/gimmingi/project\ 1/nightflow

# Coolsms API Key 설정
supabase secrets set COOLSMS_API_KEY="여기에_발급받은_API_KEY_입력"
supabase secrets set COOLSMS_API_SECRET="여기에_발급받은_API_SECRET_입력"
supabase secrets set COOLSMS_SENDER="01012345678"  # 등록한 발신번호 (하이픈 없이)
```

**예시**:
```bash
supabase secrets set COOLSMS_API_KEY="NCSAYU7YBXXXXXXXX"
supabase secrets set COOLSMS_API_SECRET="NGYO3OXXXXXXXXXXXXXXXXXX"
supabase secrets set COOLSMS_SENDER="01012345678"
```

### 2-3. Edge Function 배포
```bash
# send-approval-sms 함수 배포
supabase functions deploy send-approval-sms

# 배포 확인
supabase functions list
```

**배포 성공 시 출력**:
```
Deployed Function send-approval-sms
URL: https://your-project.supabase.co/functions/v1/send-approval-sms
```

---

## 🗄️ Step 3: Database Migration 실행

### 3-1. 로컬에서 마이그레이션 적용 (개발 환경)
```bash
cd /Users/gimmingi/project\ 1/nightflow

# Supabase 로컬 시작 (이미 실행 중이면 생략)
supabase start

# 마이그레이션 적용
supabase db reset
```

### 3-2. 프로덕션에 마이그레이션 적용
```bash
# Supabase 프로젝트 링크 (처음 한 번만)
supabase link --project-ref your-project-id

# 마이그레이션 푸시
supabase db push
```

또는 **Supabase Dashboard**에서 직접 실행:
1. https://supabase.com/dashboard → 프로젝트 선택
2. **SQL Editor** 메뉴
3. `supabase/migrations/012_md_approval_notification.sql` 파일 내용 복사
4. 붙여넣기 후 **Run** 클릭

### 3-3. Database 설정값 입력

Supabase Dashboard → **SQL Editor**에서 실행:

```sql
-- Supabase URL 설정 (본인 프로젝트 URL로 변경)
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';

-- Service Role Key 설정 (Supabase Dashboard → Settings → API에서 복사)
ALTER DATABASE postgres SET app.settings.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**Service Role Key 찾는 법**:
1. Supabase Dashboard → Settings → API
2. **Project API keys** 섹션
3. `service_role` 키 복사 (secret, 절대 클라이언트에 노출 금지)

---

## ✅ Step 4: 테스트

### 4-1. 테스트용 MD 신청
```bash
# 1. 로그인
http://localhost:3000/login

# 2. MD 신청
http://localhost:3000/signup/md

# 이름: 테스트
# 전화번호: 010-1234-5678 (본인 번호로 테스트 권장)
# 활동 지역: 강남
# 은행: 신한은행
# 계좌번호: 110-123-456789
```

### 4-2. Admin에서 승인
```bash
# 1. Admin 페이지 접속
http://localhost:3000/admin/mds

# 2. 대기 중인 MD 목록에서 방금 신청한 계정 확인

# 3. [승인] 버튼 클릭
```

### 4-3. SMS 수신 확인
- 등록한 전화번호로 **30초 이내**에 SMS 도착
- 문자 내용:
  ```
  [NightFlow] 테스트님, MD 승인이 완료되었습니다!
  이제 경매를 등록하고 수수료를 받으세요.
  https://nightflow.kr/md/dashboard
  ```

### 4-4. 로그 확인 (문제 발생 시)

**Edge Function 로그**:
```bash
supabase functions logs send-approval-sms
```

**Database 로그** (Supabase Dashboard):
1. Logs → Database Logs
2. `NOTICE: MD 승인 알림 발송` 메시지 확인

---

## 🔧 문제 해결 (Troubleshooting)

### 문자가 안 오는 경우

**1. Coolsms 잔액 확인**
- Coolsms 대시보드에서 충전 잔액 확인
- SMS 1건당 약 15원 차감

**2. 발신번호 승인 확인**
- Coolsms → [발신번호 관리]
- 상태가 "승인 완료"인지 확인

**3. Edge Function 로그 확인**
```bash
supabase functions logs send-approval-sms --limit 10
```

오류 예시:
```
❌ "SMS 발송 실패: Insufficient balance" → 잔액 부족
❌ "SMS 발송 실패: Invalid sender" → 발신번호 미등록 또는 미승인
❌ "Authorization failed" → API 키 오류
```

**4. Database Trigger 확인**
```sql
-- Trigger 존재 확인
SELECT * FROM pg_trigger WHERE tgname = 'md_approval_notification_trigger';

-- 함수 존재 확인
SELECT proname FROM pg_proc WHERE proname = 'notify_md_approval';
```

**5. 환경변수 확인**
```bash
# 설정된 secrets 확인 (값은 보이지 않음)
supabase secrets list
```

출력 예시:
```
COOLSMS_API_KEY
COOLSMS_API_SECRET
COOLSMS_SENDER
```

---

## 💰 비용 안내

### Coolsms 요금
- **SMS (단문)**: 건당 15원 (80바이트 이하)
- **LMS (장문)**: 건당 45원 (2,000바이트 이하)
- 현재 메시지 길이: 약 100자 → **LMS로 발송됨** (45원/건)

### 월간 예상 비용 (예시)
- MD 신청: 월 100건
- SMS 발송: 100건 × 45원 = **4,500원/월**

---

## 🔒 보안 주의사항

### ⚠️ 절대 노출 금지
- `COOLSMS_API_KEY`
- `COOLSMS_API_SECRET`
- `service_role_key`

### ✅ 권장 사항
- GitHub에 `.env` 파일 커밋 금지
- Supabase Secrets로 환경변수 관리
- API 키 주기적 재발급

---

## 📝 메시지 수정

메시지 내용을 변경하려면:

**파일**: `supabase/functions/send-approval-sms/index.ts`

```typescript
// 라인 37-38
const message = `[NightFlow] ${name}님, MD 승인이 완료되었습니다! 이제 경매를 등록하고 수수료를 받으세요. https://nightflow.kr/md/dashboard`;
```

수정 후 재배포:
```bash
supabase functions deploy send-approval-sms
```

---

## 🎉 완료!

이제 MD 승인 시 자동으로 SMS가 발송됩니다.

**추가 기능 아이디어**:
- [ ] 경매 낙찰 시 MD에게 알림
- [ ] 입찰 발생 시 MD에게 실시간 알림
- [ ] 결제 완료 시 유저에게 예약 확인 문자
- [ ] 노쇼 발생 시 Admin에게 알림

---

**문의**: 문제가 발생하면 Coolsms 고객센터(1670-9876) 또는 Supabase Discord로 문의하세요.
