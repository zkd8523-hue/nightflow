import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const alt = "NightFlow 경매";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OGImage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // 경매 정보 조회
  const { data: auction } = await supabase
    .from("auctions")
    .select(
      `
      *,
      club:clubs(name, area)
    `
    )
    .eq("id", id)
    .single();

  if (!auction) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #0A0A0A 0%, #1C1C1E 100%)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 48, color: "white", fontWeight: "bold" }}>
            경매를 찾을 수 없습니다
          </div>
        </div>
      ),
      {
        ...size,
      }
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ko-KR").format(price);
  };

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0A0A0A 0%, #1C1C1E 100%)",
          padding: "60px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: "bold",
              color: "white",
              letterSpacing: "-0.02em",
            }}
          >
            🌙 NightFlow
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                background: "rgba(34, 197, 94, 0.2)",
                color: "#22C55E",
                padding: "8px 20px",
                borderRadius: "12px",
                fontSize: 20,
                fontWeight: "bold",
              }}
            >
              {auction.status === "active" ? "진행중" : "예정"}
            </div>
          </div>
        </div>

        {/* 경매 정보 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          {/* 클럽 정보 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                fontSize: 24,
                color: "rgba(255, 255, 255, 0.6)",
                fontWeight: "600",
              }}
            >
              📍 {auction.club?.name || "클럽"} · {auction.club?.area || ""}
            </div>
          </div>

          {/* 경매 제목 */}
          <div
            style={{
              fontSize: 56,
              fontWeight: "black",
              color: "white",
              marginBottom: "32px",
              lineHeight: 1.2,
              letterSpacing: "-0.03em",
            }}
          >
            {auction.title}
          </div>

          {/* 현재 입찰가 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontSize: 20,
                color: "rgba(255, 255, 255, 0.5)",
                fontWeight: "600",
              }}
            >
              현재 입찰가
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: "black",
                color: "#22C55E",
                letterSpacing: "-0.02em",
              }}
            >
              ₩{formatPrice(auction.current_bid || auction.start_price)}
            </div>
          </div>

          {/* 입찰 정보 */}
          <div
            style={{
              display: "flex",
              gap: "24px",
              marginTop: "32px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  fontSize: 18,
                  color: "rgba(255, 255, 255, 0.5)",
                  fontWeight: "600",
                }}
              >
                입찰 {auction.bid_count}회
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  fontSize: 18,
                  color: "rgba(255, 255, 255, 0.5)",
                  fontWeight: "600",
                }}
              >
                참여 {auction.bidder_count}명
              </div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              fontSize: 18,
              color: "rgba(255, 255, 255, 0.4)",
              fontWeight: "600",
            }}
          >
            클럽 테이블 경매 플랫폼
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
