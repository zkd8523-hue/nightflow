import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NightFlow - 클럽 테이블 경매";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0A0A0A",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "-2px",
          }}
        >
          NightFlow
        </div>
        <div
          style={{
            fontSize: 36,
            color: "#a3a3a3",
            letterSpacing: "2px",
          }}
        >
          클럽 테이블 경매
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 24,
            color: "#f59e0b",
          }}
        >
          강남 · 홍대 클럽 테이블을 실시간 경매로
        </div>
      </div>
    ),
    { ...size }
  );
}
