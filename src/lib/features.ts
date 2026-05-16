// 2026-05-17: 오늘특가 UI 비활성화. 기존 데이터·기능 코드는 보존하되
// 모든 진입점(login pill, today 탭, AuctionForm 모드 선택, MD 등록 페이지)에서
// 노출만 차단. 재활성화하려면 env `NEXT_PUBLIC_FEATURE_INSTANT=on` 지정.
export const isInstantEnabled = () =>
  process.env.NEXT_PUBLIC_FEATURE_INSTANT === "on";
