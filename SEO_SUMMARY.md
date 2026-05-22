# NightFlow SEO 작업 요약

**문서 작성일**: 2026-05-21
**대상 도메인**: https://nightflow.kr
**SEO 전략 핵심**: "퍼즐(브랜드 자산) + 조각·합석(검색 키워드)" 이중 포지셔닝

---

## 1. 인프라 / 도메인

| 항목 | 상태 | 비고 |
|------|------|------|
| 커스텀 도메인 | ✅ `nightflow.kr` | hosting.kr 등록, Vercel DNS 이관 |
| HTTPS / SSL | ✅ | Vercel 자동 발급 |
| `metadataBase` | ✅ | `new URL("https://nightflow.kr")` (layout.tsx:34) |
| Google Search Console 인증 | ✅ | `public/google0c81019eea6de48c.html` |
| Naver Search Advisor 인증 | ✅ | `naver-site-verification` 메타 태그 (layout.tsx:115) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Vercel Production env에 `https://nightflow.kr` |
| 폴백 도메인 | ✅ | `nightflow-black.vercel.app` 유지 |

상세 이력: [.claude/plans/tranquil-knitting-elephant.md](/.claude/plans/tranquil-knitting-elephant.md)

---

## 2. 전역 메타데이터 ([src/app/layout.tsx](src/app/layout.tsx))

### 2-1. 기본 메타
- **title default**: `강남·홍대 클럽 테이블 예약 - 나이트플로우(나플)`
- **title template**: `%s | 나이트플로우`
- **applicationName**: `NightFlow`
- **description**: 강남·홍대·신사 + MD 직거래 + 퍼즐(조각·합석) 키워드 자연 노출
- **alternates.canonical**: `https://nightflow.kr`

### 2-2. Keywords (총 33개)
브랜드 변형 + 지역 클럽 + 클럽 예약/추천/테이블 + 퍼즐·조각·합석 일행 모집까지 망라.
```
나이트플로우, 나플, NightFlow, 서울 클럽, 강남/홍대/신사 클럽,
강남/홍대 클럽 예약·추천·테이블, 클럽 예약, 클럽 테이블 경매, 클럽 MD,
퍼즐, 클럽 퍼즐, 클럽 조각, 클럽 조각모임, 클럽 합석,
강남/홍대 클럽 조각, 강남/홍대 클럽 합석, 클럽 일행, 클럽 일행 구하기, 클럽 메이트
```

### 2-3. OpenGraph / Twitter
- `og:type=website`, `og:locale=ko_KR`, `og:siteName=NightFlow`
- og 이미지 `/og-image.png` (1200x630)
- Twitter `summary_large_image` 카드

### 2-4. Robots
- `index: true, follow: true`
- Googlebot: `max-image-preview: large`, `max-snippet: -1`

### 2-5. 외부 서비스 키
- `naver-site-verification`: `43d940356195c90cde1de23bc0d9b3b255fe5fa3`
- `google-adsense-account`: `ca-pub-6936468170635504`

---

## 3. JSON-LD 구조화 데이터

### 3-1. 전역 (layout.tsx:134-166)
- **Organization**: `NightFlow` + `alternateName: [나이트플로우, 나플, NightFlow Korea]` + `sameAs` 인스타그램
- **WebSite**: `inLanguage: ko-KR` + `SearchAction` (사이트 내 검색 노출)
- `<Script strategy="beforeInteractive">`로 HTML 헤더에서 즉시 로드

### 3-2. 클럽 상세 페이지 ([src/app/(main)/clubs/[id]/page.tsx:95-111](src/app/(main)/clubs/[id]/page.tsx))
- **NightClub** 스키마
- `alternateName`: aliases 자동 주입
- `address.addressLocality`: 지역 (강남/홍대/이태원 등) 자동 주입

---

## 4. Sitemap ([src/app/sitemap.ts](src/app/sitemap.ts))

| 구분 | 경로 | priority | changeFrequency | 데이터 소스 |
|------|------|----------|-----------------|-------------|
| 정적 | `/` | 1.0 | hourly | - |
| 정적 | `/clubs` | 0.8 | daily | - |
| 정적 | `/about` | 0.7 | monthly | - |
| 정적 | `/faq` | 0.6 | monthly | - |
| 정적 | `/contact` | 0.5 | monthly | - |
| 정적 | `/terms`, `/privacy` | 0.3 | yearly | - |
| 동적 | `/auctions/{id}` | 0.8(live)/0.6 | hourly/monthly | active+scheduled+won+contacted+confirmed (max 1000) |
| 동적 | `/clubs/{id}` | 0.7 | weekly | `deleted_at IS NULL` (max 200) |
| 동적 | `/flags/{id}` | 0.7 | hourly | `status=open AND expires_at > now()` (max 500) |

DB 쿼리 실패 시 정적 라우트만 반환 (graceful degradation).

---

## 5. Robots.txt ([src/app/robots.ts](src/app/robots.ts))

```
Allow: /
Disallow:
  /admin/   /md/        /api/       /auth/
  /settings/ /profile/  /notifications/
  /my-wins/ /my-penalties/ /bids/
  /favorites/ /recover-account/
Sitemap: https://nightflow.kr/sitemap.xml
Host: https://nightflow.kr
```

→ 개인화/관리 페이지는 인덱싱 차단, 공개 콘텐츠만 노출.

---

## 6. OG 이미지

- **전역 OG**: `/public/og-image.png` 정적 파일 + 동적 라우트 [src/app/opengraph-image.tsx](src/app/opengraph-image.tsx) (edge runtime, 1200x630)
- **경매 공유 이미지**: [/api/auctions/[id]/share-image](src/app/api/auctions/[id]/share-image/route.tsx) — 카카오톡 공유 시 동적 생성
- **폴백 SVG**: `/public/nightflow-share-fallback.svg`

---

## 7. 페이지별 `generateMetadata` 구현 현황

| 경로 | 상태 | 특이사항 |
|------|------|----------|
| `/` (home) | ✅ layout 상속 + sr-only h1/p | "퍼즐(클럽 조각·합석)" 자연 노출 ([page.tsx:95-106](src/app/(main)/page.tsx)) |
| `/about` | ✅ static | canonical 지정 |
| `/faq` | ✅ static | canonical 지정 |
| `/contact` | ✅ static | - |
| `/terms`, `/privacy` | ✅ static | - |
| `/clubs` (목록) | ✅ static | OG title/description + 전국 클럽 키워드 |
| `/clubs/[id]` (상세) | ✅ dynamic | 클럽명 + 별칭 + 지역 + JSON-LD NightClub |
| `/auctions/[id]` | ✅ dynamic | 클럽명 + 지역 + 현재가 + 입찰 수 |
| `/flags/[id]` (퍼즐 상세) | ✅ dynamic | 지역 + 인원 + 예산 + 모집/확정 모드 + OG image |
| `/match/[id]` (낙찰 확인) | ✅ dynamic | 클럽/테이블/날짜 정보 |

### 7-1. 동적 메타 예시 — 클럽 상세
- title: `Club ACE (Club ACE) 강남 클럽 테이블 가격·예약`
- keywords: `[club.name, ...aliases, "강남 클럽", "강남 클럽 테이블", "강남 클럽 조각", "강남 클럽 합석", "Club ACE 조각", "Club ACE 합석", "에이스 조각", ...]`

### 7-2. 동적 메타 예시 — 퍼즐(깃발) 상세
- title: `강남 클럽 퍼즐 4명 추가 모집 · 5/22(금) · 15만원`
- description: `강남 클럽 조각·합석 일행 모집. 5/22(금) 4명 15만원 퍼즐 진행 중. 나이트플로우(나플)에서 안전하게 일행을 찾으세요.`
- type: `article`, OG image 자동 생성

### 7-3. 동적 메타 예시 — 경매 상세
- title: `Club ACE 강남 클럽 테이블 경매 - 현재가 ₩250,000`
- description: 클럽 + 지역 + 경매 타이틀 + 현재가 + 입찰 수

---

## 8. 클럽 별칭 시스템 ([src/lib/clubs/aliases.ts](src/lib/clubs/aliases.ts))

검색 의도 매칭을 위해 클럽별 변형 명칭을 SEO에 자동 노출.

**현재 매핑된 클럽**: 10개
- 홍대 CLUB BERMUDA → `버뮤다, 클럽 버뮤다, 홍대 버뮤다`
- 강남 Club ACE (구 레이스) → `Club ACE, ACE, 에이스, 강남 ACE, 강남 에이스, 레이스, 강남 레이스`
- 강남 DM 라운지 → `DM, 디엠, 디엠라운지`
- 강남 아르쥬 청담 라운지 → `아르쥬, 청담 아르쥬`
- 강남 컬러 압구 → `컬러, 압구정 컬러`
- 강남 HYPE SEOUL → `하잎서울, 하잎 서울, 하잎`
- 광주 VEIL CLUB → `베일, 베일 클럽, 광주 베일, 광주 VEIL`
- 강남 플팔 → `Plus82, 플러스82`
- 홍대 OCEAN → `오션, 홍대 오션`
- 부산 그루브&스팟 → `그루브, 스팟, 부산 그루브`

이 별칭은 다음에 모두 노출됨:
1. 클럽 상세 페이지 `keywords` 메타
2. 클럽 상세 페이지 `description`
3. JSON-LD `NightClub.alternateName`
4. `{별칭} 조각`, `{별칭} 합석` 변형 키워드 자동 생성

> **재명명 이력**: `사운드`(폐업) 병합 + `레이스` → `Club ACE` 리네이밍 처리 ([.claude/plans/prancy-sniffing-sutton.md](/.claude/plans/prancy-sniffing-sutton.md))

---

## 9. 퍼즐(깃발) SEO 전략 — 이중 포지셔닝

**핵심 통찰**: "클럽 조각"·"클럽 합석"은 이미 BAAM·불밤 등 5년+ 정착된 검색어. NightFlow는 신조어 만들지 않고 기존 시장 진입.

| 요소 | 처리 방식 |
|------|----------|
| 사이트 UI 용어 | "퍼즐" 그대로 유지 (브랜드 자산) |
| URL | `/flags/[id]` (기존 유지) |
| 메타데이터 keywords | 퍼즐 + 조각 + 합석 + 일행 모두 노출 |
| FAQ | "퍼즐(클럽 조각)이 뭔가요?" — 두 표현 명시 매핑 |
| About 페이지 | "퍼즐(클럽 조각·합석)로 같이 갈 일행" 자연 매핑 |
| 메인 sr-only | "퍼즐(클럽 조각·합석)" 한 줄 자연 노출 |
| 클럽별 별칭 | `{클럽명} 조각`, `{클럽명} 합석` 자동 키워드 추가 |

**검색량 우선순위** (리서치 결과):
1. ⭐ **클럽 조각** — 중경쟁, 진입 가능
2. 클럽 합석 — 고경쟁 (위키·MD 업체 점령)
3. 강남 클럽 합석 / 홍대 클럽 일행 — 중경쟁, 지역 특화

상세: [.claude/plans/seo-cosmic-brooks.md](/.claude/plans/seo-cosmic-brooks.md)

---

## 10. 분석 / 광고 트래킹

| 도구 | 상태 | 위치 |
|------|------|------|
| Google Analytics (gtag.js) | ✅ | [src/lib/analytics/google-analytics.tsx](src/lib/analytics/google-analytics.tsx), env `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| Google AdSense | ✅ | layout.tsx lazyOnload, `pub-6936468170635504` |
| ads.txt | ✅ | `public/ads.txt` |
| 로그인 성공 트래커 | ✅ | [src/components/analytics/LoginSuccessTracker.tsx](src/components/analytics/LoginSuccessTracker.tsx) |

---

## 11. 기타 SEO/공유 자산

- **PWA manifest**: `public/manifest.webmanifest` (icons 48~512 maskable)
- **앱 아이콘**: `src/app/icon.png`, `src/app/apple-icon.png`
- **공유 fallback**: `public/nightflow-share-fallback.svg`
- **OG 동적 생성**: edge runtime 사용으로 빠른 응답
- **viewport**: `width=device-width, initialScale=1, viewportFit=cover`
- **language**: `<html lang="ko" className="dark">`

---

## 12. 남은 작업 / 후속 과제

| 우선순위 | 작업 | 상태 |
|----------|------|------|
| 중 | 클럽별 별칭 추가 매핑 (10개 → 20개+ 확장) | 대기 |
| 중 | FAQ에 "퍼즐(클럽 조각)이 뭔가요?" Q&A 명시적 추가 | 대기 |
| 낮 | 동적 OG image: 경매 상세별 시각화 (현재 정적 `/og-image.png`) | 대기 |
| 낮 | `BreadcrumbList` JSON-LD 추가 (`/` → `/clubs` → `/clubs/[id]`) | 대기 |
| 낮 | `Event` JSON-LD (경매 상세, 이벤트성 콘텐츠) | 대기 |
| 낮 | Search Console / Naver 색인 진행 모니터링 | 진행 중 |

---

## 13. 검증 체크리스트

배포 직후 확인:
- [ ] `curl -s https://nightflow.kr/sitemap.xml` → 정적 + 동적 URL 모두 포함
- [ ] `curl -s https://nightflow.kr/robots.txt` → Disallow 경로 확인
- [ ] `curl -sI https://nightflow.kr/og-image.png` → 200 OK
- [ ] 메인 페이지 view-source → `<meta name="naver-site-verification">` 확인
- [ ] 클럽 상세 view-source → `application/ld+json` NightClub 확인
- [ ] 퍼즐 상세 view-source → keywords에 "조각/합석" 확인

1-2주 후:
- [ ] Google Search Console "성과" — 새 키워드 노출 추이
- [ ] `site:nightflow.kr/flags` → 색인 페이지 수 확인
- [ ] 구글에서 "강남 클럽 조각", "홍대 클럽 합석" 검색 → 우리 페이지 진입 확인

---

## 14. 관련 플랜 문서

- [seo-cosmic-brooks.md](/.claude/plans/seo-cosmic-brooks.md) — 퍼즐(조각) SEO 진입 전략
- [tranquil-knitting-elephant.md](/.claude/plans/tranquil-knitting-elephant.md) — nightflow.kr 도메인 연결
- [prancy-sniffing-sutton.md](/.claude/plans/prancy-sniffing-sutton.md) — 사운드 폐업 + 레이스→Club ACE 리브랜딩
