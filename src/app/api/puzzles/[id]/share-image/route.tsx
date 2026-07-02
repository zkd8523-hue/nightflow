import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import dayjs from "dayjs";
import "dayjs/locale/ko";

// service role key 접근 위해 nodejs runtime
export const runtime = "nodejs";

const AREA_LABEL: Record<string, string> = {
  gangnam: "강남",
  hongdae: "홍대",
  itaewon: "이태원",
  other: "그 외",
};

async function loadFont() {
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf"
  );
  return res.arrayBuffer();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = createAdminClient();
    const { data: p, error } = await supabase
      .from("puzzles")
      .select(
        "event_date, area, budget_per_person, total_budget, target_count, current_count"
      )
      .eq("id", id)
      .single();

    if (error || !p) {
      return new Response("Not found", { status: 404 });
    }

    const fontData = await loadFont();
    const dateStr = p.event_date
      ? dayjs(p.event_date).locale("ko").format("M월 D일 (dd)")
      : "";
    const area = AREA_LABEL[p.area as string] ?? (p.area as string) ?? "";
    const perPerson =
      p.budget_per_person ??
      (p.target_count ? Math.round((p.total_budget ?? 0) / p.target_count) : 0);
    const priceStr = perPerson ? `인당 ${perPerson.toLocaleString()}원` : "";
    const countStr = `현재 ${p.current_count ?? 1} / ${p.target_count ?? 0}명`;

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, #0A0A0A 0%, #14141c 100%)",
            padding: "72px 80px",
            fontFamily: "Pretendard",
            color: "#ffffff",
          }}
        >
          {/* 상단 라벨 */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "34px" }}>🧩</span>
            <span style={{ fontSize: "30px", color: "#4ADE80", fontWeight: 700 }}>
              조각 · 파티원 모집
            </span>
          </div>

          {/* 본문 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", fontSize: "76px", fontWeight: 700, lineHeight: 1.1 }}>
              {[dateStr, area].filter(Boolean).join(" · ")}
            </div>
            {priceStr && (
              <div style={{ display: "flex", fontSize: "52px", fontWeight: 700, color: "#4ADE80" }}>
                {priceStr}
              </div>
            )}
            <div style={{ display: "flex", fontSize: "36px", color: "#A1A1AA" }}>
              {countStr} 모집 중 · 같이 갈 사람 구해요
            </div>
          </div>

          {/* 하단: CTA + 브랜딩 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                display: "flex",
                background: "#ffffff",
                color: "#0A0A0A",
                fontSize: "34px",
                fontWeight: 700,
                padding: "18px 40px",
                borderRadius: "999px",
              }}
            >
              지금 합류하기 →
            </div>
            <div style={{ display: "flex", fontSize: "38px", fontWeight: 700 }}>
              <span style={{ color: "#4ADE80" }}>Night</span>
              <span style={{ color: "#ffffff" }}>Flow</span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [{ name: "Pretendard", data: fontData, weight: 700, style: "normal" }],
      }
    );
  } catch (e) {
    return new Response(`share-image error: ${String(e)}`, { status: 500 });
  }
}
