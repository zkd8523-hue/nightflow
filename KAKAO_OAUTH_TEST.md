# Kakao OAuth 검증 가이드

## 📋 사전 준비

1. **Kakao Developers 설정 확인**
   - [https://developers.kakao.com/](https://developers.kakao.com/) 접속
   - 내 애플리케이션 > NightFlow 선택
   - 앱 키 > REST API 키 확인

2. **환경변수 확인**
   ```bash
   cd nightflow
   cat .env.local | grep KAKAO
   ```

   필수 환경변수:
   - `NEXT_PUBLIC_KAKAO_CLIENT_ID` (REST API 키)
   - `NEXT_PUBLIC_KAKAO_REDIRECT_URI` (예: http://localhost:3000/auth/callback)

3. **Redirect URI 등록 확인**
   - Kakao Developers > 내 애플리케이션 > 제품 설정 > 카카오 로그인
   - Redirect URI 등록: `http://localhost:3000/auth/callback`
   - 프로덕션: `https://your-domain.com/auth/callback`

---

## ✅ 테스트 시나리오

### 1. 회원가입 플로우

1. **로그인 페이지 접근**
   ```
   http://localhost:3000/login
   ```

2. **"카카오로 시작하기" 버튼 클릭**
   - Kakao 로그인 화면으로 리다이렉트 확인
   - URL에 `client_id`, `redirect_uri` 파라미터 포함 확인

3. **Kakao 계정 로그인**
   - 카카오 계정으로 로그인
   - 동의 항목 확인:
     - 닉네임
     - 프로필 이미지
     - 카카오계정 (이메일)
     - 전화번호 (필수)

4. **콜백 처리 확인**
   - `/auth/callback` 으로 리다이렉트
   - 사용자 정보가 `users` 테이블에 저장되는지 확인:
     ```sql
     SELECT * FROM users WHERE kakao_id = 'YOUR_KAKAO_ID';
     ```

5. **메인 페이지 리다이렉트**
   - 로그인 성공 후 `/` 으로 리다이렉트
   - 헤더에 사용자 이름 표시 확인

---

### 2. 로그인 플로우

1. **이미 가입한 계정으로 로그인**
   - `/login` 접근
   - "카카오로 시작하기" 클릭
   - Kakao 로그인 (빠른 로그인 가능)

2. **기존 사용자 확인**
   - 사용자 정보 업데이트되는지 확인
   - 중복 계정 생성되지 않는지 확인

---

### 3. 로그아웃 플로우

1. **헤더에서 로그아웃 버튼 클릭**
   - Supabase 세션 종료 확인
   - `/login` 으로 리다이렉트

2. **보호된 페이지 접근 차단 확인**
   - 로그아웃 후 `/md/dashboard` 접근 시도
   - `/login` 으로 리다이렉트되는지 확인

---

## 🔍 체크리스트

### 환경 설정
- [ ] `NEXT_PUBLIC_KAKAO_CLIENT_ID` 환경변수 설정됨
- [ ] `NEXT_PUBLIC_KAKAO_REDIRECT_URI` 환경변수 설정됨
- [ ] Kakao Developers에 Redirect URI 등록됨
- [ ] 동의 항목 설정됨 (닉네임, 프로필 이미지, 전화번호 필수)

### 회원가입
- [ ] "카카오로 시작하기" 버튼 동작
- [ ] Kakao 로그인 화면 표시
- [ ] 동의 화면 표시
- [ ] 콜백 URL로 리다이렉트
- [ ] `users` 테이블에 새 사용자 생성
- [ ] 사용자 정보 정확히 저장 (name, profile_image, phone)
- [ ] 메인 페이지로 리다이렉트
- [ ] 헤더에 사용자 이름 표시

### 로그인
- [ ] 기존 사용자로 로그인 성공
- [ ] 중복 계정 생성되지 않음
- [ ] 사용자 정보 업데이트 (프로필 이미지 변경 시)
- [ ] 세션 정상 생성

### 로그아웃
- [ ] 로그아웃 버튼 동작
- [ ] Supabase 세션 종료
- [ ] 로그인 페이지로 리다이렉트

### 권한 보호
- [ ] 미들웨어가 비로그인 사용자 차단
- [ ] `/md/*` 접근 시 MD 권한 확인
- [ ] `/admin/*` 접근 시 Admin 권한 확인

---

## 🐛 문제 해결

### 1. "Redirect URI mismatch" 에러
**원인**: Kakao Developers에 등록된 Redirect URI와 실제 URI가 다름

**해결**:
1. Kakao Developers > 내 애플리케이션 > 제품 설정 > 카카오 로그인
2. Redirect URI에 정확한 URL 등록
3. 로컬: `http://localhost:3000/auth/callback`
4. 프로덕션: `https://your-domain.com/auth/callback`

---

### 2. 콜백 처리 실패
**원인**: `/auth/callback` 페이지에서 에러 발생

**확인 사항**:
1. 브라우저 콘솔 에러 확인
2. Network 탭에서 API 호출 확인
3. Supabase 연결 확인

**로그 확인**:
```bash
# Next.js 서버 로그
npm run dev
```

---

### 3. 사용자 정보 저장 안됨
**원인**: Supabase RLS 정책 또는 테이블 스키마 문제

**확인**:
1. Supabase Dashboard > Table Editor > users 테이블 확인
2. RLS 정책 확인:
   ```sql
   -- Anyone can insert their own user record
   CREATE POLICY "Users can insert own record" ON users
     FOR INSERT WITH CHECK (auth.uid() = id);
   ```

---

## 📊 성공 기준

✅ **다음 시나리오가 모두 성공하면 OAuth 검증 완료**:

1. 신규 사용자 회원가입 → 메인 페이지 접근 가능
2. 기존 사용자 로그인 → 중복 계정 생성 안됨
3. 로그아웃 → 보호된 페이지 접근 차단
4. 전화번호 필수 동의 → users 테이블에 phone 저장됨
5. 프로필 이미지 → users 테이블에 profile_image 저장됨

---

## 🚀 다음 단계

OAuth 검증 완료 후:
1. ✅ 결제 E2E 테스트
2. ✅ 프로덕션 배포 준비
3. ✅ 이용약관/개인정보처리방침 준비
