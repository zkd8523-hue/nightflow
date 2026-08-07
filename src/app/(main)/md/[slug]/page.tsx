import { notFound, permanentRedirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * 구 MD 공개 프로필(/md/<slug>) → 통합 공개 프로필(/u/<id>) 영구 리다이렉트.
 *
 * 이 경로는 구 경매 모델 시절의 MD 페이지였고("진행 중인 경매" 노출), 지금 살아있는
 * 공개 프로필은 /u/[userId](PublicProfileView) 하나다. 앱 내부 링크는 이미 전부
 * /u/<id>를 가리키고 있어 이 경로는 사이트맵과 어드민 링크로만 남아 있었다.
 *
 * 삭제가 아니라 308(permanent)로 넘기는 이유:
 *  - MD가 인스타 바이오 등 외부에 이미 /md/<slug>를 걸어뒀을 수 있다.
 *  - 검색엔진이 수집해둔 URL의 평가를 새 주소로 승계시킨다.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function LegacyMdProfileRedirect({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: md } = await supabase
    .from("public_user_profiles")
    .select("id")
    .eq("md_unique_slug", slug)
    .maybeSingle();

  if (!md) {
    notFound();
  }

  // MD 추천인 쿠키(7일) — 기존 동작 유지. Next 15에서 page의 직접 set은 차단될 수 있어 try/catch.
  try {
    const cookieStore = await cookies();
    cookieStore.set("md_referrer", md.id, {
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // 쿠키 설정 실패는 부수효과라 무시하고 리다이렉트는 그대로 진행
  }

  permanentRedirect(`/u/${md.id}`);
}
