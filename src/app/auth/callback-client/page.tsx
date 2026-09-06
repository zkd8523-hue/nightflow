"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoadingSpinner } from "@/components/ui/skeleton";

function CallbackClient() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = params.get("code");
    const next = params.get("next") || "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

    if (!code) {
      router.replace(`/login?error=auth_failed`);
      return;
    }

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(async ({ data, error }) => {
      if (error || !data?.session) {
        const errCode = error?.message?.includes("verifier") ? "pkce_failed" : "exchange_failed";
        router.replace(`/login?error=${errCode}`);
        return;
      }

      // 가입 여부 확인
      const { data: profile } = await supabase
        .from("users")
        .select("id, deleted_at, phone")
        .eq("id", data.session.user.id)
        .maybeSingle();

      if (!profile) {
        router.replace(`/signup${safeNext !== "/" ? `?next=${encodeURIComponent(safeNext)}` : ""}`);
        return;
      }
      if (profile.deleted_at) {
        router.replace("/recover-account");
        return;
      }
      router.replace(safeNext);
    });
  }, [params, router]);

  return <LoadingSpinner minHeight="100vh" />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner minHeight="100vh" />}>
      <CallbackClient />
    </Suspense>
  );
}
