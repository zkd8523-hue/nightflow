# 카카오 OAuth 설정 가이드

## 1. Supabase에서 카카오 Provider 활성화

1. [Supabase Dashboard - Authentication](https://supabase.com/dashboard/project/ihqztsakxczzsxfvdkpq/auth/providers) 접속
2. **Providers** 탭 클릭
3. **Kakao** 찾아서 활성화
4. 다음 정보 입력:
   - **Kakao Client ID**: `92b01c338c8d2ab84603c1c23e8f5ce3`
   - **Kakao Client Secret**: (선택사항, 없으면 비워두기)
   - **Redirect URL**: 자동으로 표시됨 (복사해두기)
     - 예: `https://ihqztsakxczzsxfvdkpq.supabase.co/auth/v1/callback`

## 2. 카카오 개발자 콘솔에서 Redirect URI 등록

1. [카카오 개발자 콘솔](https://developers.kakao.com/console/app) 접속
2. 앱 선택 → **카카오 로그인** → **Redirect URI** 설정
3. 다음 URI들 추가:
   ```
   https://ihqztsakxczzsxfvdkpq.supabase.co/auth/v1/callback
   http://localhost:3000/auth/callback  (개발용)
   ```

## 3. 활성화 설정

카카오 개발자 콘솔에서:
- **카카오 로그인** 활성화 ON
- **OpenID Connect** 활성화 ON (선택사항)
- **동의 항목** 설정:
  - 닉네임 (필수)
  - 프로필 사진 (선택)
  - 카카오계정(이메일) (선택)

## 완료!

설정이 끝나면 애플리케이션에서 카카오 로그인을 사용할 수 있습니다.
