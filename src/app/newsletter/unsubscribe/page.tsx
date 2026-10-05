import type { Metadata } from "next";
import Link from "next/link";
import { Check, AlertCircle } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// 뉴스레터 수신거부 — 메일 안 링크로만 들어온다.
//
// 왜 (main) 바깥인가: 받는 사람 대부분은 나플 계정이 없다(구독은 이메일만 받는다).
// (main) 레이아웃은 헤더·바텀네비·시트 여러 개를 달고 오는데, 수신거부 한 번 누르려고
// 그걸 다 띄울 이유가 없다. 메일에서 눌렀을 때 가장 빨리 뜨는 쪽을 택한다.
//
// 왜 한 번에 처리하나: 정보통신망법 제50조 제4항은 수신거부가 "쉬워야" 한다고 본다.
// "정말 끊으시겠습니까?"로 한 번 더 막는 건 그 취지에 어긋난다. 링크를 열면 끝난다.
//
// 메일 클라이언트의 링크 프리페치로 이 페이지가 저절로 한 번 열릴 수 있다.
// 그래서 토큰은 추측 불가능해야 하고(Migration 690), 두 번 눌려도 결과가 같아야 한다.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "뉴스레터 수신거부",
  robots: { index: false, follow: false },   // 토큰이 붙은 주소가 색인되면 안 된다
};

export default async function NewsletterUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  // service_role 로 RPC 를 부른다. 689 의 RLS 는 SELECT/UPDATE 를 전부 막아놔서
  // anon 키로는 토큰이 맞아도 아무것도 못 한다. RPC 자체가 바꾸는 건
  // unsubscribed_at 한 컬럼뿐이라(690) 권한을 넓게 줘도 할 수 있는 일이 없다.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let result: "ok" | "already" | "notfound" | "error" = "notfound";
  if (t) {
    const { data, error } = await supabase.rpc("newsletter_unsubscribe", { p_token: t });
    if (error) {
      // Migration 690 미적용이면 함수가 없다. 사람에게 에러 코드를 보여주는 대신
      // 수동 처리 안내로 돌린다 — 수신거부 요청을 삼키면 안 된다.
      console.error("[newsletter] 수신거부 실패:", error.message);
      result = "error";
    } else {
      result = (data as "ok" | "already" | "notfound") ?? "notfound";
    }
  }

  const done = result === "ok" || result === "already";

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md w-full space-y-6">
        <div className="bg-card border border-border rounded-3xl p-8 space-y-4">
          <div className="flex items-start gap-3">
            {done ? (
              <Check className="w-6 h-6 text-[#DFFF00] flex-shrink-0 mt-0.5" strokeWidth={3} />
            ) : (
              <AlertCircle className="w-6 h-6 text-brand-amber flex-shrink-0 mt-0.5" />
            )}
            <div className="space-y-2">
              <h1 className="text-xl font-black text-foreground tracking-tight">
                {result === "ok" && "수신거부 처리됐습니다"}
                {result === "already" && "이미 수신거부된 주소입니다"}
                {result === "notfound" && "처리할 수 없는 주소입니다"}
                {result === "error" && "지금은 처리할 수 없습니다"}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                {result === "ok" &&
                  "앞으로 클러빙 뉴스를 보내지 않습니다. 다시 받고 싶으시면 언제든 구독 폼에서 신청하실 수 있습니다."}
                {result === "already" &&
                  "이 주소로는 이미 뉴스레터를 보내지 않고 있습니다. 추가로 하실 일은 없습니다."}
                {result === "notfound" &&
                  "링크가 잘리거나 만료됐을 수 있습니다. 받으신 메일의 수신거부 링크를 다시 눌러주세요."}
                {result === "error" &&
                  "잠시 후 다시 시도해주세요. 계속 안 되면 아래 주소로 메일 주시면 직접 처리해드리겠습니다."}
              </p>
            </div>
          </div>

          {!done && (
            <p className="text-[13px] text-muted-foreground leading-relaxed pt-2 border-t border-border">
              직접 처리를 원하시면{" "}
              <a href="mailto:team@nightflow.kr" className="text-foreground underline underline-offset-2">
                team@nightflow.kr
              </a>{" "}
              로 수신거부를 원하는 주소를 보내주세요.
            </p>
          )}
        </div>

        <div className="text-center">
          <Link href="/" className="text-[13px] font-bold text-muted-foreground underline underline-offset-4">
            나플 홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}
