import { Suspense } from "react";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>로딩 중...</p></div>}>
      <SignupForm />
    </Suspense>
  );
}

// Ensure the page is treated as dynamic to avoid static generation errors with useSearchParams
export const dynamic = "force-dynamic";
