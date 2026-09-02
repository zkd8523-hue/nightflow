"use client";

import { useEffect, useRef } from "react";

/**
 * 앱이 백그라운드로 가면 재생 중인 미리듣기를 멈춘다.
 *
 * 문제: Capacitor 네이티브 앱(kr.nightflow.app)은 앱을 닫아도 WebView가 살아 있다.
 * 브라우저 탭처럼 프로세스가 정리되지 않아 사운드클라우드 iframe이 계속 소리를 낸다
 * ("앱을 닫아도 노래가 계속 나옴"). 시트를 닫을 때는 iframe을 언마운트해서 멈추지만,
 * 홈 버튼으로 나가는 경로에는 아무 처리가 없었다.
 *
 * 두 가지 신호를 다 듣는다 — 어느 하나로는 전 플랫폼이 안 덮인다:
 *   - visibilitychange: 웹/모바일 브라우저, 그리고 안드로이드 WebView 대부분
 *   - Capacitor App.appStateChange: iOS 네이티브에서 visibilitychange가
 *     안 오거나 늦는 경우의 확실한 신호
 *
 * ⚠️ 복귀 시 자동 재생은 하지 않는다. 유저가 나갔다는 건 그만 듣겠다는 뜻이고,
 *    돌아오자마자 소리가 다시 터지면 클럽 밖에서는 사고다. 다시 들으려면 누르면 된다.
 *
 * @param pause 멈추는 동작. 위젯 핸들이 없을 수도 있으므로 호출측에서 방어한다.
 */
export function usePauseOnBackground(pause: () => void) {
  // 호출측이 인라인 함수를 넘기므로 deps에 넣으면 매 렌더 재구독된다.
  // ref로 최신 것만 들고 있고 구독은 마운트 시 1회만 한다.
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  useEffect(() => {
    const run = () => {
      try {
        pauseRef.current();
      } catch {
        /* 위젯이 아직 준비 전이거나 이미 사라짐 — 멈출 게 없으니 무시 */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // iOS 사파리는 앱 전환 시 pagehide만 오는 경우가 있다
    window.addEventListener("pagehide", run);

    // Capacitor 네이티브 — 플러그인은 registerPlugin 브릿지로만 접근한다
    // (직접 import 금지 규칙). 웹에서는 isNativePlatform()이 false라 건너뛴다.
    let removeNative: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { Capacitor, registerPlugin } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const App = registerPlugin<{
          addListener: (
            ev: "appStateChange",
            cb: (s: { isActive: boolean }) => void
          ) => Promise<{ remove: () => void }>;
        }>("App");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) run();
        });
        // await 도중 언마운트됐으면 바로 정리한다(리스너 누수 방지)
        if (cancelled) handle.remove();
        else removeNative = () => handle.remove();
      } catch {
        /* 네이티브 브릿지 없음(웹) — visibilitychange로 충분하다 */
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", run);
      removeNative?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
