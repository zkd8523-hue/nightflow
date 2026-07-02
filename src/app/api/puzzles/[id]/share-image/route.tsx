import { ImageResponse } from "next/og";

export const runtime = "nodejs";

// 조각 공유 OG 이미지 = 조각(피자) 사진만 1200x630로 크롭. 텍스트/데이터 없음.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const bgUrl = `${origin}/og-jogak.jpg`;

  return new ImageResponse(
    (
      <div style={{ width: "1200px", height: "630px", display: "flex", background: "#0A0A0A" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          width={1200}
          height={630}
          src={bgUrl}
          style={{ width: "1200px", height: "630px", objectFit: "cover" }}
          alt=""
        />
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
