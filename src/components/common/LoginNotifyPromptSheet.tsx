"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppDownloadCta, PLAY_STORE_URL } from "@/hooks/useAppDownloadCta";
import { trackAppDownloadClick } from "@/lib/analytics/events";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { initPushNotifications } from "@/lib/native/pushNotifications";
import { getLang, makeT } from "@/lib/i18n";

const WEB_SEEN_KEY = "naflLoginAppPromptSeen";
const PUSH_SEEN_KEY = "naflLoginPushPrimingSeen";

/**
 * 로그인 직후 1회성 유도 (Migration 551 플랜 B).
 * 플랫폼에 따라 두 갈래로 갈린다:
 *  - 안드로이드 웹: 앱 다운로드 권유 (기존 useAppDownloadCta 게이팅 재사용)
 *  - 네이티브 앱: 푸시 권한 프라이밍 — OS 팝업을 설명 없이 바로 띄우던
 *    PushPermissionPrompt를 대체한다. 여기서 "알림 받기"를 눌러야 그때
 *    처음 OS 권한 팝업이 뜬다(1회성이므로 함부로 소모하지 않는다).
 *
 * FlagCreatedInstallSheet(앱 아이콘+제목/부제+버튼 2개)와
 * ServiceUpdateSheet(localStorage 1회 노출)의 구조를 그대로 따른다.
 */
export function LoginNotifyPromptSheet() {
  const { user } = useCurrentUser();
  const { eligible: webEligible } = useAppDownloadCta();

  const [mode, setMode] = useState<"none" | "web" | "push">("none");
  const [open, setOpen] = useState(false);
  const decidedRef = useRef(false);

  // iOS 앱은 미국·중국·일본 스토어 출시(외국인 전용)라 네이티브 분기가 한국어만
  // 보여주면 안 된다. 다른 화면과 동일하게 ?lang= 기준으로 번역한다.
  // useSearchParams는 Suspense를 요구하므로 window에서 직접 읽는다(레이아웃과 동일 방식).
  const [lang, setLangCode] = useState<string | null>(null);
  useEffect(() => {
    setLangCode(new URLSearchParams(window.location.search).get("lang"));
  }, []);
  const t = makeT(getLang(lang));

  useEffect(() => {
    if (!user || decidedRef.current) return;
    decidedRef.current = true;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // 이미 seen 처리됐으면 스킵
        if (localStorage.getItem(PUSH_SEEN_KEY) === "1") return;

        const { PushNotifications } = await import("@capacitor/push-notifications");
        const status = await PushNotifications.checkPermissions();
        // granted면 뜰 이유가 없고, denied면 OS 팝업이 이제 와서 안 뜨므로
        // 이 시트도 안 띄운다(설정 화면 안내는 /settings/notifications에서 별도 처리).
        if (status.receive !== "prompt" && status.receive !== "prompt-with-rationale") return;

        localStorage.setItem(PUSH_SEEN_KEY, "1");
        setMode("push");
        setOpen(true);
        return;
      }

      // 웹: 기존 게이팅 그대로
      if (!webEligible) return;
      if (localStorage.getItem(WEB_SEEN_KEY) === "1") return;
      localStorage.setItem(WEB_SEEN_KEY, "1");
      setMode("web");
      setOpen(true);
    })();
    // webEligible은 첫 판정 시점 값으로 충분 — user 확정 시 1회만 평가한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (mode === "none") return null;

  const handlePushGrant = async () => {
    if (!user) return;
    await initPushNotifications(user.id);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => setOpen(v)}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-border bg-card pb-10"
      >
        <SheetHeader>
          <SheetTitle className="sr-only">
            {mode === "web" ? "앱 설치 안내" : "알림 권한 안내"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <Image
            src="/app-icon.png"
            alt="나플"
            width={72}
            height={72}
            className="rounded-2xl"
          />
          <div className="space-y-1.5">
            <p className="text-lg font-bold text-foreground">
              {t(
                "당일 쿠폰이나 혜택 등을 놓칠 수 있어요!",
                "You might miss today's coupons and perks!",
                "本日のクーポンや特典を逃すかもしれません！",
                "您可能会错过今天的优惠券和福利！",
                "您可能會錯過今天的優惠券和福利！"
              )}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {mode === "web"
                ? t(
                    "앱을 다운로드하고 알림을 받아보세요.",
                    "Download the app to get notified.",
                    "アプリをダウンロードして通知を受け取りましょう。",
                    "下载 App 即可接收通知。",
                    "下載 App 即可接收通知。"
                  )
                : t(
                    "알림을 켜면 찜한 클럽의 새 쿠폰을 바로 알려드려요.",
                    "Turn on notifications to hear about new coupons from clubs you saved.",
                    "通知をオンにすると、お気に入りクラブの新しいクーポンをすぐにお知らせします。",
                    "开启通知，收藏的俱乐部有新优惠券时立即通知您。",
                    "開啟通知，收藏的俱樂部有新優惠券時立即通知您。"
                  )}
            </p>
          </div>
          <div className="w-full space-y-2 pt-2">
            {mode === "web" ? (
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  trackAppDownloadClick("login_sheet");
                  setOpen(false);
                }}
                className="block w-full rounded-full bg-green-600 py-3.5 text-center text-base font-bold text-white transition-transform active:scale-[0.98]"
              >
                {t(
                  "앱 설치하고 알림 받기",
                  "Install the app",
                  "アプリをインストール",
                  "安装 App",
                  "安裝 App"
                )}
              </a>
            ) : (
              <button
                type="button"
                onClick={handlePushGrant}
                className="block w-full rounded-full bg-green-600 py-3.5 text-center text-base font-bold text-white transition-transform active:scale-[0.98]"
              >
                {t("알림 받기", "Turn on notifications", "通知をオンにする", "开启通知", "開啟通知")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full py-2 text-sm text-muted-foreground transition-colors hover:text-foreground/80"
            >
              {t("나중에", "Later", "あとで", "稍后", "稍後")}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
