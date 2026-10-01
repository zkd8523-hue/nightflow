// nightflow.kr/app을 PC에서 열었을 때 보이는 화면 — QR + 두 스토어 버튼.
// 기기 분기는 ../route.ts가 한다.

import type { Metadata } from "next";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/appStore";
import { AppInstallQr } from "@/components/common/AppInstallQr";

export const metadata: Metadata = {
  title: "나플 앱 다운로드",
  robots: { index: false },
};

export default function AppDownloadPcPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 space-y-5 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/app-icon.png" alt="나플" className="w-16 h-16 rounded-2xl mx-auto" />
        <div className="space-y-1">
          <h1 className="text-[20px] font-black text-foreground">나플 앱 받기</h1>
          <p className="text-[13px] text-muted-foreground break-keep">
            예약 확정·오퍼 알림을 앱으로 바로 받아보세요.
          </p>
        </div>
        <div className="flex justify-center text-left">
          <AppInstallQr location="app_page" />
        </div>
        <div className="flex gap-2">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-11 leading-[2.75rem] rounded-xl bg-inverse text-inverse-foreground font-black text-[13px]"
          >
            App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-11 leading-[2.75rem] rounded-xl bg-muted border border-border text-foreground font-bold text-[13px]"
          >
            Google Play
          </a>
        </div>
      </div>
    </main>
  );
}
