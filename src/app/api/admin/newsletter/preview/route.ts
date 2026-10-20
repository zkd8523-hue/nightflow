import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeeklyEmailIssue } from "@/lib/email/weeklyIssue";

// 메일 HTML 을 브라우저에서 그대로 본다. 아무것도 보내지 않는다.
//
// 테스트 발송 전에 여기서 먼저 본다 — 테스트도 결국 메일 한 통이고,
// 오타 하나 고칠 때마다 받은편지함에 쌓는 건 낭비다.
// 브라우저 렌더는 지메일보다 관대하므로(여기서 멀쩡해도 지메일에서 깨질 수 있다)
// 최종 확인은 테스트 발송으로 한다.
//
//   GET /api/admin/newsletter/preview?slug=2026-10-22

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(c) {
          c.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const admin = createAdminClient();
  const { data: row } = await admin.from("users").select("role").eq("id", user.id).single();
  if (row?.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const slug = req.nextUrl.searchParams.get("slug") || "";
  const issue = getWeeklyEmailIssue(slug);
  if (!issue) return NextResponse.json({ error: "조판된 호가 아닙니다." }, { status: 404 });

  // 미리보기에서는 진짜 토큰을 쓰지 않는다. 눌러도 "처리할 수 없는 주소입니다" 가 뜬다.
  const html = issue.html({
    unsubscribeUrl: `${(process.env.NEXT_PUBLIC_APP_URL || "https://nightflow.kr").replace(/\/$/, "")}/newsletter/unsubscribe?t=preview-token-not-a-real-subscriber`,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}
