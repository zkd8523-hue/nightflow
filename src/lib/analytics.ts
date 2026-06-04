// mixpanel-browser 동적 로드 래퍼.
// 라이브러리(약 60KB)를 메인 클라이언트 번들에서 분리하기 위해, 실제 첫 호출 시점에만
// import() 로 로드한다. 로드 전 들어온 이벤트는 큐에 쌓았다가 로드 완료 후 순서대로 flush.
// 호출부(trackEvent/identifyUser/...)는 모두 fire-and-forget 이라 시그니처를 그대로 유지한다.

import type { OverridedMixpanel } from "mixpanel-browser";

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

let mp: OverridedMixpanel | null = null;
let loading: Promise<OverridedMixpanel | null> | null = null;
const queue: Array<(m: OverridedMixpanel) => void> = [];

function loadMixpanel(): Promise<OverridedMixpanel | null> {
  if (mp) return Promise.resolve(mp);
  if (loading) return loading;
  if (!TOKEN || typeof window === "undefined") return Promise.resolve(null);

  loading = import("mixpanel-browser").then(({ default: mixpanel }) => {
    mixpanel.init(TOKEN, {
      debug: process.env.NODE_ENV === "development",
      track_pageview: true,
      persistence: "localStorage",
    });
    mp = mixpanel;
    // 로드 전 큐에 쌓인 호출 순서대로 실행
    while (queue.length) {
      const fn = queue.shift();
      try {
        fn?.(mixpanel);
      } catch {
        /* noop */
      }
    }
    return mixpanel;
  });

  return loading;
}

// mixpanel 인스턴스가 준비됐으면 즉시 실행, 아니면 로드 후 실행되도록 큐잉.
function withMixpanel(fn: (m: OverridedMixpanel) => void) {
  if (!TOKEN || typeof window === "undefined") return;
  if (mp) {
    try {
      fn(mp);
    } catch {
      /* noop */
    }
    return;
  }
  queue.push(fn);
  void loadMixpanel();
}

export function initAnalytics() {
  // 라이브러리를 미리 로드해 둔다(렌더 차단 없는 비동기). init 은 loadMixpanel 내부에서 수행.
  void loadMixpanel();
}

export function trackEvent(name: string, props?: Record<string, unknown>) {
  withMixpanel((m) => m.track(name, props));
}

export function identifyUser(
  userId: string,
  props?: Record<string, unknown>
) {
  withMixpanel((m) => {
    m.identify(userId);
    if (props) m.people.set(props);
  });
}

export function resetAnalytics() {
  withMixpanel((m) => m.reset());
}
