// 앱 다운로드 스마트 링크 — nightflow.kr/app
// 아이폰은 App Store, 안드로이드는 Google Play로 바로 보내고, PC는 QR 화면(/app/pc)으로.
// 예약 완료 화면 PC용 QR이 이 주소를 가리킨다(2026-10-01).
//
// 스토어 주소는 @/lib/appStore에서 가져온다 — "use client"인 useAppDownloadCta에서
// 가져오면 서버에선 문자열 대신 클라이언트 참조가 들어와 location 헤더 오류(500)가 난다.

import { NextRequest, NextResponse } from "next/server";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/appStore";

export function GET(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return NextResponse.redirect(APP_STORE_URL, 302);
  if (/Android/i.test(ua)) return NextResponse.redirect(PLAY_STORE_URL, 302);
  return NextResponse.redirect(new URL("/app/pc", req.url), 302);
}
