"use client";

import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { APP_SMART_LINK } from "@/lib/appStore";
import { trackAppDownloadClick } from "@/lib/analytics/events";

/**
 * PC용 앱 설치 QR — 휴대폰 카메라로 찍으면 nightflow.kr/app이 기기에 맞는
 * 스토어(App Store/Google Play)로 보낸다. QR을 못 찍는 상황용으로 링크 복사도 둔다
 * (카톡 "나에게 보내기" 등으로 폰에 넘기기).
 *
 * QR은 흰 바탕이어야 다크 테마에서도 카메라가 읽는다.
 */
export function AppInstallQr({ location }: { location: "booking_submitted" | "app_page" }) {
  const copy = () => {
    navigator.clipboard
      ?.writeText(APP_SMART_LINK)
      .then(() => {
        toast.success("링크 복사됨 — 휴대폰으로 보내서 열어주세요");
        trackAppDownloadClick(location, { via: "copy_link" });
      })
      .catch(() => {});
  };
  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0 rounded-xl bg-white p-2">
        <QRCodeSVG value={APP_SMART_LINK} size={104} level="M" />
      </div>
      <div className="space-y-2 min-w-0">
        <p className="text-[12px] text-muted-foreground leading-relaxed break-keep">
          휴대폰 카메라로 찍으면 아이폰·안드로이드에 맞는 스토어로 연결돼요.
        </p>
        <button
          type="button"
          onClick={copy}
          className="h-9 px-3 rounded-full bg-muted border border-border text-foreground text-[12px] font-bold flex items-center gap-1.5 hover:bg-muted/60 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          nightflow.kr/app 복사
        </button>
      </div>
    </div>
  );
}
