# NightFlow iOS 출시 — 진행 상황 인수인계

> **최종 업데이트**: 2026-05-16 (심사 제출 완료, Apple 리뷰 대기 중 ⏳)
> **목적**: 새 채팅에서 즉시 작업 이어가기

---

## 🔥 새 채팅용 빠른 이어가기 프롬프트

```
NightFlow iOS 심사 진행 상태 확인하고 싶어.

다음 문서 읽고 현재 상황 파악해줘:
/Users/gimmingi/project 1/IOS_HANDOFF.md (이 문서)

핵심: Bundle ID는 kr.nightflow.app, 빌드 1.0(2) iPhone 전용
현재 상태: 심사 제출 완료 (2026-05-16). Apple Review 대기 중.

남은 시나리오:
A. 승인 시: "출시" 버튼 클릭 → App Store 라이브
B. Metadata Rejected: 텍스트/스크린샷만 수정 → 재제출 (재빌드 X)
C. Binary Rejected: 코드 수정 → CURRENT_PROJECT_VERSION 3으로 올리고 재 Archive → 재업로드 → 재제출
```

---

## 📍 현재 진행 상황 (8/8 외부 콘솔 ✅)

### ✅ 완료
| # | 단계 | 결과 |
|---|------|------|
| 1 | Apple Developer App ID | `kr.nightflow.app` + Sign in with Apple + Push Capabilities |
| 2 | APNs + Sign-in Auth Key | `R58XD2DGB2` (.p8 다운로드 완료, 한 키로 APNs + Apple Sign-in 둘 다) |
| 2-extra | APNs Configure | Sandbox & Production + Team Scoped (All Topics) |
| 3 | Apple Service ID | `kr.nightflow.app.signin` + Domains/Return URLs 등록 |
| 4 | Google Cloud iOS Client | `288156738643-kr4jg0rgtce96hgij027vqguolao05u8.apps.googleusercontent.com` |

### ✅ 완료 (추가)
| # | 단계 | 결과 |
|---|------|------|
| 5 | Kakao iOS 플랫폼 | Default Native AppKey(`1fc85f8f...`)에 Bundle ID `kr.nightflow.app` 등록 완료. Info.plist 3곳 신규 키로 교체 완료 |
| 6 | Firebase iOS 앱 + APNs Key | iOS 앱 `kr.nightflow.app` 등록 + APNs Auth Key 개발/프로덕션 양쪽 모두 업로드 완료 (`R58XD2DGB2` / `3DH4BMUM7D`) |
| 7 | Supabase Apple Provider | Client IDs `kr.nightflow.app` + Allow users without an email ON + Secret Key 비움(iOS native만 사용). Skip nonce checks 토글은 최신 UI에서 미노출(시뮬 테스트 시 재확인) |
| 8 | Privacy Policy | https://nightflow.kr/privacy 라이브 (Apple 5.1.1(v) 대응 영문 섹션 포함) |

### ✅ 완료 (로컬 환경 준비)
| # | 단계 | 결과 |
|---|------|------|
| 9 | Xcode 설치 | `/Applications/Xcode.app` 설치됨, `xcode-select -p` → `/Applications/Xcode.app/Contents/Developer` |
| 10 | xcode-select 경로 | 이미 Xcode Developer 경로 가리킴 (CommandLineTools 아님) |
| 11 | `pod install` 검증 | CocoaPods 1.16.2, `ios/App/Pods/` 정상 생성, `App.xcworkspace` 존재 |

### ✅ 완료 (실기기 빌드)
| # | 단계 | 결과 |
|---|------|------|
| 12 | Xcode Signing & Capabilities | Team `Minki Kim`, Provisioning `Xcode Managed`, Signing Cert `43NQXX8KPG`, Entitlements (aps-environment, Sign in with Apple), Background Modes (Remote notifications) |
| 13 | iPhone 13 mini USB 페어링 | Developer Mode ON, available (paired), Mac 비밀번호 Apple ID로 재설정 + 키체인 새 비번 |
| 13a | 실기기 빌드 + 설치 + 실행 | "Finished running App on 김민기의 iPhone" ✅ |
| 13b | Apple Sign-In 검증 | ✅ 성공 (좀비 user 자동 정리 후 매직 phone으로 가입 완료) |
| 13c | 매직 phone 환경변수 추가 | `MAGIC_TEST_PHONE=01099999999`, `MAGIC_TEST_OTP=<사용자 설정>` — Apple 심사관용 우회 |

### ✅ 완료 (OAuth 검증 + 매직 phone + 코드)
| # | 단계 | 결과 |
|---|------|------|
| 14 | Apple/Google/Kakao 3종 OAuth 검증 | 실기기에서 모두 로그인 성공 ✅ |
| 14a | Google iOS Client ID 하드코딩 fallback | `src/lib/native/googleLogin.ts` — Vercel env 미반영 우회용 (커밋 `252f1be`) |
| 14b | Vercel 환경변수 추가 | `MAGIC_TEST_PHONE=01099999999`, `MAGIC_TEST_OTP=<사용자 설정>` (Production/Preview/Development 3개 모두) |
| 14c | SignupForm "로그인 화면으로" 버튼 | agree 단계에서 빠져나갈 길 추가 (커밋 `7dafbee`) |
| 14d | send-otp 매직 phone 분기 | 매직 phone이면 SMS 우회 + 기존 매직 user 자동 정리 (커밋 `426711e`) |
| 14e | iOS 서명 설정 커밋 | project.pbxproj + Info.plist + App.entitlements (커밋 `dde109d`) |

### ✅ 완료 (App Store Connect 메타데이터)
| # | 단계 | 결과 |
|---|------|------|
| 15 | App Store Connect 앱 등록 | 이름: `NightFlow : 접속하는 순간, VIP`, Bundle ID: `kr.nightflow.app`, SKU: `nightflow-ios-001` |
| 15a | 부제 | (사용자가 직접 입력) |
| 15b | 설명 (한국어) | 박스 드로잉 문자(━━) 제거한 깔끔한 버전 |
| 15c | 키워드 | `클럽,테이블,예약,경매,강남,홍대,라운지,VIP,파티,핫플,입찰,예약앱,모임,데이트,바` |
| 15d | 카테고리 | 1차: 라이프스타일 / 2차: 엔터테인먼트 |
| 15e | 연령 등급 | 17+ (성적 콘텐츠/도박 모두 없음) |
| 15f | 개인정보 처리방침 URL | https://nightflow.kr/privacy |
| 15g | 데이터 수집 설문 | 사용자 ID + 기기 ID 체크 (모두 "앱 기능" 목적). 분석/광고/타사 콘텐츠 모두 없음 |
| 15h | 콘텐츠 권리 | "아니요" (타사 저작권 콘텐츠 없음) |
| 15i | 사전 주문 / 앱 클립 / iMessage / Game Center | 모두 비활성화 |
| 15j | 사용 가능 여부 | 175개 전체 국가 |
| 15k | 출시 방식 | (수동 출시 권장 — 사용자가 결정) |
| 16 | 스크린샷 1242×2688 변환 | `~/Downloads/앱샷/IMG_0001~0011.PNG` (총 10장, IMG_0010 누락) |

### ✅ 완료 (Archive 업로드)
| # | 단계 | 결과 |
|---|------|------|
| 17 | Xcode Archive | 2개 생성됨 (1.0 빌드 1) — 둘 다 동일 빌드, 하나만 업로드 |
| 18 | Distribute App → Upload | App Store Connect 업로드 완료. TestFlight 처리 대기 중 |

### ✅ 완료 (2026-05-16 심사 제출까지)
| # | 단계 | 결과 |
|---|------|------|
| 19 | iPad 호환 옵션 A 채택 | `TARGETED_DEVICE_FAMILY = "1,2"` → `"1"` (Debug+Release 둘 다, iPhone 전용) |
| 19a | 빌드 번호 +1 | `CURRENT_PROJECT_VERSION = 1` → `2` (재업로드 중복 거부 방지) |
| 19b | 새 Archive 1.0(2) 생성 + 업로드 | App Store Connect 업로드 완료 |
| 20 | 수출 규정 답변 | "위에 언급된 알고리즘에 모두 해당하지 않음" 선택 ✅ |
| 21 | 배포 페이지 빌드 추가 | 1.0 (2) 배포용 빌드로 선택 ✅ |
| 22 | Review Notes 작성 | 매직 phone(010-9999-9999) + OTP + Social Login 안내 명시 ✅ |
| 23 | 심사 제출 | "심사를 위해 제출" 클릭 완료 ✅ (2026-05-16) |

### ⏳ Apple 심사 대기 중 (24~72시간 예상)

심사 상태는 [App Store Connect](https://appstoreconnect.apple.com/apps) → NightFlow → 배포 탭 우측 상단에서 확인.

| 상태 | 의미 | 대응 |
|------|------|------|
| Waiting for Review | 심사 대기열 | 대기 (대부분 시간이 여기서 소요) |
| In Review | 심사관이 보는 중 | 대기 (30분~2시간) |
| Pending Developer Release | ✅ 승인됨 | "출시" 버튼 클릭 → App Store 라이브 |
| Ready for Sale | 🎊 출시 완료 | — |
| Metadata Rejected | 텍스트/스크린샷 문제 | 메타데이터 수정 → 재제출 (재빌드 X) |
| Binary Rejected | 코드 문제 | 수정 → 빌드 번호 3으로 올림 → 재 Archive → 재업로드 → 재제출 |

---

## 🗒 메모한 모든 자격증명 값

```
# Bundle / Identifiers
Bundle ID: kr.nightflow.app
Service ID: kr.nightflow.app.signin
Team ID: 3DH4BMUM7D

# Apple Push + Sign-in Key (단일 키)
Key ID: R58XD2DGB2
.p8 파일: ~/Downloads/AuthKey_R58XD2DGB2.p8 (또는 사용자 보관 위치)
Services: APNs + Sign in with Apple (둘 다 활성화)
APNs Config: Sandbox & Production + Team Scoped (All Topics)

# Google OAuth (iOS)
Client ID: 288156738643-kr4jg0rgtce96hgij027vqguolao05u8.apps.googleusercontent.com
Reversed (URL Scheme): com.googleusercontent.apps.288156738643-kr4jg0rgtce96hgij027vqguolao05u8

# Kakao
NightFlow Android AppKey (Android 전용, kr.nightflow.app 등록): 05e4bc59b65a9accadeb923e263e2212
Default Native AppKey (iOS 전용, kr.nightflow.app 등록 + Info.plist 적용): 1fc85f8f5fb19704e4ba1d8befe17ed4
REST API Key: 92b01c338c8d2ab84603c1c23e8f5ce3
JS Key: e413d652524c649e5acebaea543dc3be

# Firebase
Project ID: nightflow-13b5d
iOS App: NightFlow iOS (kr.nightflow.app) 등록 완료
APNs Key 업로드: ✅ 개발+프로덕션 양쪽 완료 (R58XD2DGB2 / 3DH4BMUM7D)

# Supabase
Project URL: ihqztsakxczzsxfvdkpq.supabase.co
Apple Provider: ✅ 활성화 (Client IDs=kr.nightflow.app, Secret Key 비움, Allow users w/o email ON)

# Apple Developer 계정
Apple ID: zkd8523@gmail.com
```

---

## ✅ 이미 처리한 코드 변경 (commit `c1c7253` push 완료)

### 신규 파일
- `src/lib/native/appleLogin.ts` — capgo social-login Apple provider
- `ios/` 폴더 전체 — **CocoaPods 모드**로 재생성 (카카오 SDK SPM 미지원 우회)

### 수정 파일
- `src/lib/native/googleLogin.ts` — iOS 분기 + iOSClientId/iOSServerClientId
- `src/app/(auth)/login/page.tsx` — Apple 로그인 버튼 (iOS 네이티브 감지 시 맨 위)
- `src/app/(main)/privacy/page.tsx` — 영문 Account Deletion 섹션 (Apple 5.1.1(v))
- `.env.example` — `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` 추가
- `.gitignore` — `ios.backup-*/`, `android/app/google-services.json.old-*`
- `ios/App/App/Info.plist` — Kakao/Google URL 스킴, KAKAO_APP_KEY, push background, **Google reversed Client ID 실제 값 적용**
- `ios/App/App/AppDelegate.swift` — KakaoSDK init, KakaoTalk URL 핸들러, push didRegister/didFail
- `ios/App/App.xcodeproj/project.pbxproj` — Bundle ID `kr.nightflow.app` (Debug+Release)
- `ios/App/Podfile` + `Podfile.lock` — 12개 플러그인 + 카카오 SDK 7개 모듈

### `.env.local` (커밋 안 됨, 로컬만)
- `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID=288156738643-kr4jg0rgtce96hgij027vqguolao05u8.apps.googleusercontent.com`

### Vercel 배포 상태
✅ **Privacy Policy 영문 섹션 라이브 검증 완료** (https://nightflow.kr/privacy)

### iOS 폴더 백업
- `ios.backup-20260514-054332/` (CocoaPods 전환 전 SPM 모드 백업, .gitignore됨)

---

## 🚧 Kakao iOS 플랫폼 — 막힌 지점 상세

### 문제
카카오 Developer Console 새 UI (2024+)에서 "플랫폼" 단독 메뉴가 사라짐. 네이티브 앱 키 카드 안에서 플랫폼 정보 등록하는 구조로 변경.

### 발견한 사실
NightFlow 카카오 앱(ID 1388635, 비즈앱)에 네이티브 앱 키 2개 존재:
- **Default Native AppKey** (`1fc85f8f5fb19704e4ba1d8befe17ed4`) — Android 패키지/키해시만 등록됨
- **NightFlow Android** (`05e4bc59b65a9accadeb923e263e2212`) — Android 정보 등록됨, **iOS 섹션 없음 (확인 완료)**

iOS Info.plist에는 `05e4bc59...` 키가 KAKAO_APP_KEY로 등록되어 있어 NightFlow Android 키와 일치.

### 시도해야 할 옵션
1. **Default Native AppKey 카드 클릭** → 안에 iOS 섹션 있는지 확인 (가능성 낮음)
2. **+ 네이티브 앱 키 추가** → 이름 `NightFlow iOS` → iOS 앱 정보 입력 (Bundle ID `kr.nightflow.app`, Team ID `3DH4BMUM7D`) → 새 키 발급
3. 새 키 발급 시 **Info.plist의 KAKAO_APP_KEY를 새 키로 교체** 필요

### 권장 시도 순서
1. Default Native AppKey 클릭해서 iOS 섹션 유무 확인
2. 없으면 새 iOS 전용 키 발급 → Info.plist 자동 교체 (Claude가 처리 가능)

---

## ⚠️ 알려진 함정

### 1. 카카오 SDK SPM 미지원 → CocoaPods 모드 사용
- `capacitor-kakao-login-plugin@3.0.0`이 `Package.swift` 없음
- Capacitor 8 기본 SPM에서 CocoaPods로 전환 완료 (이미 처리됨)
- **Xcode는 `App.xcworkspace`로 열어야 함** (App.xcodeproj X)

### 2. xcode-select 경로 변경 필요
- 현재 Mac은 Command Line Tools만 가리킴 (`/Library/Developer/CommandLineTools`)
- Xcode 설치 후: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- 그 후 `cd ios/App && pod install` 검증

### 3. Apple 심사 4.8 가이드라인
- OAuth 제공 시 Sign in with Apple 필수 (이미 구현됨)
- Privacy Policy 영문 Account Deletion 섹션 필수 (이미 라이브)

### 4. App Store 메타데이터 단어 회피
- club / nightclub / alcohol / drinking / party / bar → 거부 위험
- lounge / venue / hospitality / event 사용 권장
- CAPACITOR_HANDOFF.md Phase 6에 영문 메타데이터 + Review Notes 초안 준비됨

### 5. Supabase Skip nonce checks ON 필수
- capgo social-login은 자동 nonce 주입 X
- Apple Provider 활성화 시 Skip nonce checks 토글 ON

### 6. 테스트 로그인 활성화 (출시 빌드)
- `.env.local`에 `NEXT_PUBLIC_ENABLE_TEST_LOGIN=true` 설정 후 Archive
- Apple 심사관이 `test-user@nightflow.test / test1234`로 즉시 로그인 가능
- Review Notes에 명시
- 심사 통과 후 다음 빌드에서 false 권장

---

## 📦 자산 준비 상태

### ✅ 완료
- 앱 아이콘: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024×1024 RGB, no alpha — Apple 거부 사유 #1 회피)
- 스플래시: 6개 (라이트/다크 각 @1x/@2x/@3x)
- Pods 의존성: 12개 플러그인 + 카카오 SDK 7개 모듈 모두 설치
- Privacy Policy 영문 섹션: Vercel 라이브 (https://nightflow.kr/privacy)
- Bundle ID 통일: 5개 소스 모두 `kr.nightflow.app`

### ⏳ 사용자 작업
- App Store 스크린샷 (iPhone 6.7" 1290×2796 최소 3장 — Android 자산 리사이징 또는 12 mini 시뮬레이터 캡처)
- 12 mini 실기기 (USB 1회 페어링 후 무선 디버깅)

---

## 🎯 다음 즉시 액션 (Step 12: Xcode Signing & Capabilities)

외부 콘솔 + 로컬 환경 모두 완료. 이제 사용자가 Xcode GUI에서 직접 작업해야 함.

### A. App.xcworkspace 열기
```bash
open "/Users/gimmingi/project 1/nightflow/ios/App/App.xcworkspace"
```
**중요**: `.xcodeproj` 아님, 반드시 `.xcworkspace` (CocoaPods 모드)

### B. Signing & Capabilities 탭
프로젝트 네비게이터 → `App` 타깃 → **Signing & Capabilities**
1. **Team**: 본인 Apple Developer Team 선택 (Team ID `3DH4BMUM7D`)
2. **Bundle Identifier**: `kr.nightflow.app` (이미 설정됨, 확인만)
3. **Automatically manage signing**: ON
4. **Capabilities 확인** (Apple Developer 콘솔에서 이미 활성화됨):
   - Push Notifications ✅
   - Sign in with Apple ✅
   - Background Modes → Remote notifications ✅
5. Capability 누락 시 **+ Capability** 버튼으로 추가

### C. 실기기 페어링 + 빌드 (Step 13)
1. iPhone 12 mini USB 연결 → "이 컴퓨터를 신뢰" 허용
2. Xcode 상단 디바이스 선택 → 12 mini 선택
3. **개발자 모드 ON** 필요: iPhone → 설정 → 개인정보 보호 및 보안 → 개발자 모드 ON (재부팅됨)
4. Window → Devices and Simulators → "Connect via network" 체크 (이후 무선)
5. ⌘+R 으로 실기기 빌드 → 첫 빌드 시 iPhone에서 개발자 신뢰 허용

### D. 막힐 가능성 높은 지점
- **"No matching provisioning profiles"**: Automatic signing이 처음 한 번 Apple Developer 에 프로파일 발급. Xcode가 자동 처리 — 1~2분 대기
- **카카오 SDK Module not found**: `.xcodeproj`로 열었을 가능성. `.xcworkspace`로 다시 열기
- **카메라/마이크 권한 누락**: Info.plist에 NSCameraUsageDescription 등 (이미 추가됐을 가능성 — 빌드 시 누락 경고 뜨면 알려주기)

---

## 📞 막혔을 때 알려줄 정보

새 채팅에서 다음 형식으로 알려주면 빠르게 진단 가능:

```
- 어느 STEP에서 막혔는지 (예: STEP 1-⑤ Kakao iOS)
- 어떤 화면을 보고 있는지 (스크린샷 첨부 권장)
- 어떤 에러 메시지가 떴는지 (있다면)
- 이미 시도한 것 (있다면)
```

---

## 📚 관련 문서

- `/Users/gimmingi/project 1/CAPACITOR_HANDOFF.md` — Android+iOS 통합, App Store 메타데이터 영문 초안, Review Notes 영문 초안
- `/Users/gimmingi/.claude/plans/nightflow-ios-imperative-seahorse.md` — iOS 구현 플랜 (Phase 1~6)
- `/Users/gimmingi/project 1/CLAUDE.md` — NightFlow 프로젝트 전체 컨텍스트

---

**마지막 업데이트**: 2026-05-16
**작성자**: Claude (iOS 출시 단계 보조)
**현재 위치**: 심사 제출 완료 → **Apple Review 대기 중** ⏳

## 🚦 다음 액션 (심사 결과 수신 후)

### ✅ 시나리오 A: 승인 (Pending Developer Release)
- 메일 + Apple Developer 앱 푸시 알림 수신
- App Store Connect → 배포 → **"이 버전 출시"** 클릭
- 1~24시간 내 App Store 라이브 (Ready for Sale)

### ⚠️ 시나리오 B: Metadata Rejected
- 텍스트/스크린샷/Review Notes 문제 — 재빌드 불필요
- Resolution Center에 심사관 코멘트 확인
- App Store Connect에서 해당 항목만 수정 → "심사를 위해 제출" 재클릭

### 🔧 시나리오 C: Binary Rejected
- 코드 변경 필요
- 작업 순서:
  1. 코드 수정
  2. `ios/App/App.xcodeproj/project.pbxproj`에서 `CURRENT_PROJECT_VERSION = 2` → `3` (Debug+Release 둘 다)
  3. Xcode → Product → Archive
  4. Organizer → Distribute App → App Store Connect → Upload
  5. App Store Connect → 배포 탭 → 빌드 1.0 (3) 추가 → 재제출

### 📦 빌드 1.0(2) 출시 정보
- Bundle ID: `kr.nightflow.app`
- iPhone 전용 (iPad/Watch 제외)
- Architectures: arm64
- Marketing Version: 1.0
- Build Number: 2
- Social Login: Apple / Google / Kakao
- 매직 phone: `010-9999-9999` (OTP는 Vercel `MAGIC_TEST_OTP` 환경변수 참조)
