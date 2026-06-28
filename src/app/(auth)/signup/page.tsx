import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SignupForm } from "@/components/auth/SignupForm";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  if (lang && lang !== "ko") {
    return { title: { absolute: "Sign up | NightFlow" } };
  }
  return { title: "회원가입" };
}

export default async function SignupPage() {
  const cookieStore = await cookies();
  const referralCode = cookieStore.get('referral_code')?.value ?? null;
  const mdReferrer = cookieStore.get('md_referrer')?.value ?? null;

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>로딩 중...</p></div>}>
      <SignupForm referralCode={referralCode} mdReferrer={mdReferrer} />
    </Suspense>
  );
}

// Ensure the page is treated as dynamic to avoid static generation errors with useSearchParams
export const dynamic = "force-dynamic";
