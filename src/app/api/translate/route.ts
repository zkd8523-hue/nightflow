import { NextRequest, NextResponse } from "next/server";

// 오퍼 comment(MD 한글 자유 코멘트) → 영어 번역. 외국인 /en 오퍼 표시용.
// SDK 없이 Anthropic Messages API 직접 호출 (의존성 0). 저렴한 Haiku 사용.
// 키는 환경변수에서만 읽음 (코드/깃에 키 없음).

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_INPUT = 500; // comment는 짧음 — 과금/남용 방지 상한

const TARGET_LANG: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  zh: "Simplified Chinese",
};

export async function POST(req: NextRequest) {
  let text: unknown;
  let lang: unknown;
  try {
    ({ text, lang } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  const input = text.trim().slice(0, MAX_INPUT);
  const targetLang = TARGET_LANG[typeof lang === "string" ? lang : "en"] ?? "English";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 키 미설정 시 — 원문 그대로 폴백 (UI는 원문 노출)
    return NextResponse.json({ translated: null, reason: "no_key" }, { status: 200 });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        system:
          `You translate short Korean nightclub VIP-table offer comments into natural, concise ${targetLang} for foreign clubgoers. ` +
          "IMPORTANT: Korean liquor/club brand names must become their real international brand names (Latin/original spelling), NOT literal translations. " +
          "Examples: 발렌타인→Ballantine's, 돔페리뇽/돔 페리뇽→Dom Pérignon, 조니워커→Johnnie Walker, 헤네시→Hennessy, 맥캘란→Macallan, 그레이구스→Grey Goose, 모엣→Moët. " +
          `Output ONLY the ${targetLang} translation — no quotes, no preamble, no notes.`,
        messages: [{ role: "user", content: input }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ translated: null, reason: "upstream_error" }, { status: 200 });
    }
    const data = await res.json();
    const translated: string =
      data?.content?.[0]?.type === "text" ? (data.content[0].text as string).trim() : "";
    return NextResponse.json({ translated: translated || null }, { status: 200 });
  } catch {
    return NextResponse.json({ translated: null, reason: "fetch_error" }, { status: 200 });
  }
}
