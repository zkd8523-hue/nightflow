import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SignupForm } from "@/components/auth/SignupForm";
import { getLang, makeT } from "@/lib/i18n";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await searchParams;
  const lang = getLang(raw);
  if (lang === "ko") return { title: "회원가입" };
  const t = makeT(lang);
  const title = t("회원가입", "Sign up", "新規登録", "注册");
  return { title: { absolute: `${title} | NightFlow` } };
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const cookieStore = await cookies();
  const referralCode = cookieStore.get('referral_code')?.value ?? null;
  const mdReferrer = cookieStore.get('md_referrer')?.value ?? null;

  // 로딩 fallback을 진입 언어(?lang=) 하나로만 렌더.
  // 이전엔 4개 언어를 한 줄에 다 넣어, 한국어 유저가 signup으로 튕길 때
  // 중국어·일본어가 한꺼번에 스쳐 "버그"처럼 보였음.
  const t = makeT(getLang((await searchParams).lang));
  const loadingText = t("로딩 중...", "Loading...", "読み込み中...", "加载中...");

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>{loadingText}</p></div>}>
      <SignupForm referralCode={referralCode} mdReferrer={mdReferrer} />
    </Suspense>
  );
}

// Ensure the page is treated as dynamic to avoid static generation errors with useSearchParams
export const dynamic = "force-dynamic";
