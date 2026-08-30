import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

// 동적 OG 이미지 생성 — 외국인 트랙 영문 페이지용.
// 사용: openGraph.images = [`/api/og?title=Encoded%20Title&sub=Subtitle&lang=en`]
//
// 영문 텍스트만 지원 (시스템 fallback 폰트). 한글/중일어는 깨짐 →
// 한국어/중국어/일본어 페이지는 기존 정적 og-image-v2.png 유지.
//
// Edge runtime — Vercel Edge Functions에서 빠른 응답.
export const runtime = "edge";

const ACCENT_BY_LANG: Record<string, string> = {
  en: "#f59e0b", // amber
  zh: "#ef4444", // red (중국 본토 신호색)
  ja: "#ec4899", // pink (일본 J-pop 톤)
};

const LABEL_BY_LANG: Record<string, string> = {
  en: "ENGLISH",
  zh: "中文",
  ja: "日本語",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? "NightFlow").slice(0, 100);
  const sub = (searchParams.get("sub") ?? "Korea Club Booking — No Korean Needed").slice(0, 140);
  const lang = (searchParams.get("lang") ?? "en").toLowerCase();
  const accent = ACCENT_BY_LANG[lang] ?? "#f59e0b";
  const label = LABEL_BY_LANG[lang] ?? "ENGLISH";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "linear-gradient(135deg, #0A0A0A 0%, #1a1a1a 100%)",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* 상단: 언어 마커 + NightFlow 로고 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                background: accent,
                borderRadius: "50%",
              }}
            />
            <span
              style={{
                color: "#999",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "2px",
              }}
            >
              {label}
            </span>
          </div>
          <span
            style={{
              color: "#fff",
              fontSize: "28px",
              fontWeight: 900,
              letterSpacing: "-1px",
            }}
          >
            NightFlow
          </span>
        </div>

        {/* 중앙: 제목 + 부제 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <h1
            style={{
              color: "#fff",
              fontSize: title.length > 60 ? "56px" : "72px",
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-2px",
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              color: "#aaa",
              fontSize: "26px",
              fontWeight: 500,
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            {sub}
          </p>
        </div>

        {/* 하단: 도메인 + accent bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              height: "6px",
              width: "120px",
              background: accent,
              borderRadius: "3px",
            }}
          />
          <span
            style={{
              color: "#666",
              fontSize: "20px",
              fontWeight: 600,
            }}
          >
            nightflow.kr/{lang}
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
