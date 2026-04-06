# Gemini 인수인계 - 카카오톡 공유 이미지 강화

## 목표
카카오톡 공유 시 큰 이미지 카드로 표시되게 개선 (밤bti 앱처럼)

## 현재 상태 (2026-04-06)
- **카카오톡 공유: 4011 에러 발생** (잘못되었거나 삭제된 앱 키)
- share-image API: 로컬에서는 정상, 프로덕션 미확인
- 카카오 공유는 이번 세션 이전에는 정상 동작했음

## Claude가 변경한 파일 4개

### 1. `src/app/api/auctions/[id]/share-image/route.tsx`
**변경 내용:**
- `?format=kakao` 쿼리 파라미터 추가 → 1200x630 가로형 이미지 생성
- 클럽/경매 사진을 배경으로 사용 (`auction.thumbnail_url` → `club.thumbnail_url` 순서)
- 폰트 URL 수정: 기존 URL이 404 반환하고 있었음
  - ❌ `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/Pretendard-Bold.otf`
  - ✅ `https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf`
- Supabase 쿼리에 `club.thumbnail_url` 추가
- 기존 1080x1920 인스타그램용 이미지는 그대로 유지

### 2. `src/hooks/useKakaoShare.ts`
**변경 내용:**
- Kakao SDK 타입에 `imageWidth?: number`, `imageHeight?: number` 추가
- `sendDefault` 호출 시 `imageWidth: 1200, imageHeight: 630` 전달
- 이게 카카오톡이 큰 이미지 카드로 렌더링하는 핵심

### 3. `src/components/auctions/ShareAuctionSheet.tsx`
**변경 내용:**
- 카카오 전용 이미지 URL 변수 추가: `kakaoShareImageUrl = .../share-image?format=kakao`
- 카카오 공유 시 `kakaoShareImageUrl` 사용 (인스타그램은 기존 URL 유지)

### 4. `src/components/md/ShareSuccessSheet.tsx`
**변경 내용:**
- ShareAuctionSheet와 동일하게 카카오 전용 이미지 URL 적용

## 카카오 4011 에러 원인 추정
`npx vercel --prod` CLI 배포를 여러 번 실행하면서 기존 GitHub 배포를 덮어씀.
`NEXT_PUBLIC_` 환경변수는 빌드 시 인라인되는데, CLI 배포 시 환경변수가 다르게 적용됐을 가능성.

또는 Vercel 팀 설정에 환경변수를 중복 추가했다가 삭제하는 과정에서 문제 발생 가능성.

## 확인 필요 사항

1. **카카오 개발자 콘솔** 확인:
   - 앱 키 (JavaScript 키)가 유효한지
   - `nightflow-black.vercel.app` 도메인이 허용된 도메인에 등록되어 있는지

2. **프로덕션 도메인**: `nightflow-black.vercel.app` (Vercel에서 확인됨)

3. **share-image 엔드포인트 테스트**:
   ```
   https://nightflow-black.vercel.app/api/auctions/{경매ID}/share-image?format=kakao
   ```

4. **로컬에서 이미지 확인**:
   ```
   http://localhost:3000/api/auctions/{경매ID}/share-image?format=kakao
   ```
   → 1200x630 가로형 이미지 정상 출력 확인됨

## 코드 변경 커밋 상태
모든 변경사항은 이미 `main` 브랜치에 커밋/push 완료되어 있음.
Vercel 최신 배포(8A8PgfSUC, Current)에 반영되어 있음.

## 관련 플랜 파일
`/Users/gimmingi/.claude/plans/merry-nibbling-valley.md`
