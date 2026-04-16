import { Suspense } from "react";
import { DisplayNameForm } from "@/components/auth/DisplayNameForm";

export default function DisplayNameOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-neutral-950">
          <p className="text-neutral-400">로딩 중...</p>
        </div>
      }
    >
      <DisplayNameForm />
    </Suspense>
  );
}

export const dynamic = "force-dynamic";
