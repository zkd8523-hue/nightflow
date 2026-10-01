// iOS Universal Links — 앱이 깔려 있으면 아래 경로의 nightflow.kr 링크(QR·문자 등)가
// 사파리 대신 앱으로 열린다(2026-10-02). 안드로이드는 public/.well-known/assetlinks.json.
//
// 확장자 없는 파일을 public/에 두면 Content-Type이 application/json으로 안 나가서
// 라우트 핸들러로 서빙한다. 애플 CDN이 리다이렉트 없이 이 주소를 직접 가져가야 한다.
//
// 경로는 좁게 잡는다 — 로그인 콜백(/auth/*) 등이 앱으로 새면 웹 로그인이 깨진다.
// 경로를 바꾸면 AndroidManifest.xml의 https intent-filter도 같이 맞출 것.

export const dynamic = "force-static";

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["3DH4BMUM7D.kr.nightflow.app"],
        components: [
          { "/": "/app", comment: "앱 다운로드 스마트 링크 — 앱 안에선 홈으로" },
          { "/": "/booking/*", comment: "손님/MD 확정서·제안서" },
          { "/": "/my-bookings" },
        ],
      },
    ],
  },
};

export function GET() {
  return Response.json(AASA, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
