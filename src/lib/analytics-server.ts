// 서버사이드 Mixpanel 트래킹 (Route Handler, API Routes에서 사용)
// mixpanel-browser는 클라이언트 전용이므로 HTTP API 직접 호출

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const MIXPANEL_INGEST_URL = "https://api.mixpanel.com/track";

export async function trackServerEvent(
  eventName: string,
  props: Record<string, unknown> = {}
) {
  if (!TOKEN) return;

  try {
    const payload = [
      {
        event: eventName,
        properties: {
          token: TOKEN,
          distinct_id: (props.md_id as string) || "server",
          time: Math.floor(Date.now() / 1000),
          ...props,
        },
      },
    ];

    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");

    await fetch(`${MIXPANEL_INGEST_URL}?data=${encodeURIComponent(encoded)}`, {
      method: "GET",
    });
  } catch {
    // 트래킹 실패는 무시 (비즈니스 로직에 영향 없도록)
  }
}
