// 앱 스토어 주소 — 클라이언트 훅(useAppDownloadCta)과 서버(/app 라우트) 공용.

// 안드로이드 앱 정식 출시 (공유용 pcampaignid는 제외, 한국어 페이지 고정)
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=kr.nightflow.app&hl=ko";

// iOS 앱스토어 (한국 스토어 포함, 2026-09-07부터)
export const APP_STORE_URL = "https://apps.apple.com/app/id6769749996";

// 기기 자동 분기 다운로드 링크(src/app/app/route.ts) — PC에서 QR로 찍거나
// 카톡 "나에게 보내기"로 넘길 때 하나의 주소로 아이폰·안드로이드 모두 커버한다.
export const APP_SMART_LINK = "https://nightflow.kr/app";
