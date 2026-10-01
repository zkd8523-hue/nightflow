import { permanentRedirect } from "next/navigation";

// 주소 변경(2026-10-01, SEO 세션 권장·사용자 확정): /en/plan-your-memory/* → /en/night-activities/*.
// 옛 /tours는 투어가 허브 기본 화면이 된 뒤 쓰지 않으므로 새 허브로 바로 보낸다.
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? [];
  const rest = path.length && path[0] !== "tours" ? `/${path.map(encodeURIComponent).join("/")}` : "";
  permanentRedirect(`/en/night-activities${rest}`);
}
