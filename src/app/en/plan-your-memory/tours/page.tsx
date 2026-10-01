import { permanentRedirect } from "next/navigation";

// 투어가 허브 기본 화면이 됐다(2026-10-01) — 같은 목록이 두 주소에 생기지 않게 허브로 영구 이동.
export default function Page() {
  permanentRedirect("/en/plan-your-memory");
}
