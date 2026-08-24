import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  normalizePromoRows,
  scrubContacts,
  type RawPromoTier,
} from "@/lib/utils/promoParse";

// 카톡 홍보문구 → 조각 템플릿 파싱. MD가 단톡방 문구를 그대로 붙여넣으면 등급별로 뽑아준다.
// SDK 없이 Anthropic Messages API 직접 호출 (translate 라우트와 동일한 패턴, 의존성 0).
// 키는 환경변수에서만 읽음.

const ANTHROPIC_MODEL = "claude-haiku-4-5";
const MAX_INPUT = 2000; // 홍보문구는 길어야 이 정도 — 과금/남용 방지 상한

const SYSTEM_PROMPT = `You parse Korean nightclub (클럽) KakaoTalk promo messages into table "조각"(share) tiers.

SLANG — this is the critical rule:
"엔N" means N만원 (N x 10,000 KRW) PER PERSON. 엔6 -> price_man 6. 엔12 -> 12.
The 엔 prefix may be separated by a space (엔 6) and may be followed by 만/만원.
Ranges use ~ or - or /: "엔6~9" -> price_man 6, price_man_high 9.
An open range "엔6~" has no upper bound -> price_man 6, price_man_high null.

SPLIT vs RANGE: if two numbers on one line differ by MORE than 2x, they are two
separate offers, not a range — emit TWO tiers with the same base name, the second
suffixed " 2". (e.g. "초메인 6인 ~ 엔 70 / 엔 150" -> 초메인=70 and "초메인 2"=150.)
Otherwise treat them as one range.

name: the tier label ONLY (일반자리, 일반석, 준메인, 초메인, 왕자리, 힙합존, 일렉존,
일등석, 메인). Strip emoji, arrows, the 인원 count, and any price. Max 20 chars.
If a line advertises 조각 with a price but names no tier, use "조각".

total_seats: from "N인" on that line. If absent, use 6.

weekday_hint: "평일" if the message mentions 평일 or a Mon-Thu weekday
(월요일/화요일/수요일/목요일); "주말" if it mentions 주말 or 금/토/일요일; null otherwise.
If it mentions both, use null.

md_comment: the care/service marketing lines ONLY, joined with ", ", max 200 chars.
Example: "황제케어 보장, 무한잔술, 입구마중". Same text for every tier.

NEVER include phone numbers, URLs, KakaoTalk IDs, or social handles in any field.
Ignore decorative separator lines (****, ----) and pure-emoji lines.
Emit ONLY lines that state a per-person 조각 price. Do not invent tiers.`;

const TOOL = {
  name: "emit_share_tiers",
  description: "Emit the parsed table tiers from a Korean club promo message.",
  input_schema: {
    type: "object",
    properties: {
      weekday_hint: { type: ["string", "null"] },
      tiers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            total_seats: { type: "integer" },
            price_man: { type: "integer" },
            price_man_high: { type: ["integer", "null"] },
            md_comment: { type: ["string", "null"] },
          },
          required: ["name", "total_seats", "price_man", "price_man_high", "md_comment"],
          additionalProperties: false,
        },
      },
    },
    required: ["weekday_hint", "tiers"],
    additionalProperties: false,
  },
} as const;

/** 파싱 실패는 에러가 아니라 "인식 0건"으로 돌려준다 — 화면은 수동 입력으로 유도한다. */
function empty(reason: string) {
  return NextResponse.json({ rows: [], weekdayHint: null, reason }, { status: 200 });
}

export async function POST(req: NextRequest) {
  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  // 인증 — 비용이 드는 라우트라 익명 접근을 막는다
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요해요" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["md", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "파트너 권한이 필요해요" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return empty("no_key");

  // 호출 전에 연락처를 지운다 — 모델이 본 적 없는 번호는 출력에 섞일 수 없다
  const input = scrubContacts(text.trim().slice(0, MAX_INPUT));

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
        max_tokens: 1500,
        tool_choice: { type: "tool", name: TOOL.name },
        tools: [TOOL],
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: input }],
      }),
    });

    if (!res.ok) return empty("upstream_error");

    const data = await res.json();
    const block = Array.isArray(data?.content)
      ? data.content.find((c: { type?: string }) => c?.type === "tool_use")
      : null;
    if (!block?.input) return empty("unparsed");

    const hint = typeof block.input.weekday_hint === "string" ? block.input.weekday_hint : null;
    const rows = normalizePromoRows(block.input.tiers as RawPromoTier[], hint);

    if (rows.length === 0) return empty("unparsed");
    return NextResponse.json({ rows, weekdayHint: rows[0].category }, { status: 200 });
  } catch {
    return empty("fetch_error");
  }
}
