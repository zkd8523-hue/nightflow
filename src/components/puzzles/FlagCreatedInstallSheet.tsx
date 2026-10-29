"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppDownloadCta } from "@/hooks/useAppDownloadCta";
import { trackAppDownloadClick } from "@/lib/analytics/events";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { initPushNotifications } from "@/lib/native/pushNotifications";
import { getLang, makeT } from "@/lib/i18n";

// 웹 앱설치 권유는 3일에 한 번 — 파티를 만들거나 들어갈 때마다 뜨면 잔소리가 된다.
const WEB_SEEN_AT_KEY = "naflPartyInstallPromptSeenAt";
const WEB_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
// 기기 설정에서 알림을 막은 유저에게는 안내를 한 번만 — 앱에서 다시 켤 방법이 없다.
const DENIED_SEEN_KEY = "naflPartyPushDeniedSeen";

type Mode = "none" | "web" | "push" | "denied";
type Trigger = "created" | "joined";

/**
 * 파티를 만들었거나(PuzzleForm "flag-created") 파티에 들어간 직후(PuzzleJoinSheet
 * "party-joined") 알림 받을 길을 열어주는 시트. 파티원 참가(Migration 698)·MD 오퍼
 * (227/230)·파티 채팅(591)은 전부 앱 푸시로만 가기 때문에 이 순간에 권유한다.
 *  - 모바일 웹: 앱 설치 권유 (useAppDownloadCta 게이팅 재사용)
 *  - 앱 + 권한 미결정: 푸시 프라이밍 → "알림 받기"를 눌러야 OS 팝업이 뜬다
 *  - 앱 + 권한 거부: 기기 설정 경로 안내 (NotificationSettings와 같은 문구)
 *  - 앱 + 권한 허용: 안 뜸
 *
 * LoginNotifyPromptSheet와 같은 구조. 그쪽은 로그인 직후 1회, 이쪽은 파티 순간마다.
 */
export function FlagCreatedInstallSheet() {
  const { user } = useCurrentUser();
  const { eligible, storeUrl } = useAppDownloadCta();
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;

  const [mode, setMode] = useState<Mode>("none");
  const [trigger, setTrigger] = useState<Trigger>("created");
  const [open, setOpen] = useState(false);

  const [lang, setLangCode] = useState<string | null>(null);
  useEffect(() => {
    setLangCode(new URLSearchParams(window.location.search).get("lang"));
  }, []);
  const t = makeT(getLang(lang));

  useEffect(() => {
    const show = async (next: Trigger) => {
      const { Capacitor } = await import("@capacitor/core");

      if (Capacitor.isNativePlatform()) {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const status = await PushNotifications.checkPermissions();
        if (status.receive === "granted") return;
        if (status.receive === "denied") {
          if (localStorage.getItem(DENIED_SEEN_KEY) === "1") return;
          localStorage.setItem(DENIED_SEEN_KEY, "1");
          setMode("denied");
        } else {
          setMode("push");
        }
        setTrigger(next);
        setOpen(true);
        return;
      }

      if (!eligibleRef.current) return; // 모바일 웹에서만 (PC·인앱 제외)
      const seenAt = Number(localStorage.getItem(WEB_SEEN_AT_KEY) || 0);
      if (Date.now() - seenAt < WEB_COOLDOWN_MS) return;
      localStorage.setItem(WEB_SEEN_AT_KEY, String(Date.now()));
      setMode("web");
      setTrigger(next);
      setOpen(true);
    };

    const onCreated = (e: Event) => {
      // 깃발 생성 UI는 걷어냈지만(791db6b3) 이벤트는 공용 — 파티(shareMode)만 받는다.
      if (!(e as CustomEvent<{ shareMode?: boolean }>).detail?.shareMode) return;
      show("created").catch(() => {});
    };
    const onJoined = () => {
      show("joined").catch(() => {});
    };
    window.addEventListener("flag-created", onCreated);
    window.addEventListener("party-joined", onJoined);
    return () => {
      window.removeEventListener("flag-created", onCreated);
      window.removeEventListener("party-joined", onJoined);
    };
  }, []);

  if (mode === "none") return null;

  const handlePushGrant = async () => {
    if (!user) return;
    await initPushNotifications(user.id);
    setOpen(false);
  };

  const title = trigger === "created"
    ? t("파티 등록 완료! 🎉", "Your party is up! 🎉")
    : t("파티 합류 완료! 🎉", "You're in the party! 🎉");

  const what = trigger === "created"
    ? t("파티원 참가·파트너 오퍼·채팅", "new members, club offers and chats")
    : t("파티 채팅·오퍼 소식", "party chats and offers");

  const body =
    mode === "web"
      ? t(`${what}을 앱 알림으로 바로 받아보세요.`, `Get ${what} as app notifications.`)
      : mode === "push"
        ? t(`알림을 켜면 ${what}을 바로 알려드려요.`, `Turn on notifications to hear about ${what} right away.`)
        : t(
            `기기에서 알림이 차단돼 있어요. 설정 > 앱 > 나플 > 알림에서 허용하면 ${what}을 받을 수 있어요.`,
            `Notifications are blocked on this device. Allow them in Settings > Apps > NightFlow > Notifications to get ${what}.`
          );

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
            <p className="text-lg font-bold text-foreground">{title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
          <div className="w-full space-y-2 pt-2">
            {mode === "web" && (
              <a
                href={storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  trackAppDownloadClick(trigger === "created" ? "party_created_sheet" : "party_joined_sheet");
                  setOpen(false);
                }}
                className="block w-full rounded-full bg-green-600 py-3.5 text-center text-base font-bold text-white transition-transform active:scale-[0.98]"
              >
                {t("앱 설치하고 알림 받기", "Install the app")}
              </a>
            )}
            {mode === "push" && (
              <button
                type="button"
                onClick={handlePushGrant}
                className="block w-full rounded-full bg-green-600 py-3.5 text-center text-base font-bold text-white transition-transform active:scale-[0.98]"
              >
                {t("알림 받기", "Turn on notifications")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full py-2 text-sm text-muted-foreground transition-colors hover:text-foreground/80"
            >
              {mode === "denied" ? t("확인", "OK") : t("다음에", "Later")}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
