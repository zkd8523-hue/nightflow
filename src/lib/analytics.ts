import mixpanel from "mixpanel-browser";

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

export function initAnalytics() {
  if (!TOKEN || typeof window === "undefined") return;
  mixpanel.init(TOKEN, {
    debug: process.env.NODE_ENV === "development",
    track_pageview: true,
    persistence: "localStorage",
  });
}

export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (!TOKEN) return;
  mixpanel.track(name, props);
}

export function identifyUser(
  userId: string,
  props?: Record<string, unknown>
) {
  if (!TOKEN) return;
  mixpanel.identify(userId);
  if (props) mixpanel.people.set(props);
}

export function resetAnalytics() {
  if (!TOKEN) return;
  mixpanel.reset();
}
