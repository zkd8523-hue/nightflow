import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SignupForm } from "@/components/auth/SignupForm";
import { getLang, makeT } from "@/lib/i18n";
import { LoadingSpinner } from "@/components/ui/skeleton";

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

  // 로딩 fallback은 스피너 하나로 통일(2026-09-06, 목업 3안) — 언어별
  // 문구를 따로 두던 예전 방식(4개 언어가 한꺼번에 스쳐 "버그"처럼 보이던
  // 문제의 근본 원인이었다)은 스피너에는 애초에 적용되지 않는다.
  return (
    <Suspense fallback={<LoadingSpinner minHeight="100vh" />}>
      <SignupForm referralCode={referralCode} mdReferrer={mdReferrer} />
    </Suspense>
  );
}

// Ensure the page is treated as dynamic to avoid static generation errors with useSearchParams
export const dynamic = "force-dynamic";
