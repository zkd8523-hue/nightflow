import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DmRoom } from "@/components/messages/DmRoom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "대화",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ threadId: string }>;
}

export default async function DmThreadPage({ params }: PageProps) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dm/${threadId}`);

  // 본인 프로필은 users 테이블에서 직접 조회 (연락처 남기기 기능용 — MessageRoom과 동일 패턴)
  const { data: me } = await supabase
    .from("users")
    .select("id, role, instagram, phone, kakao_open_chat_url, preferred_contact_methods")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <DmRoom
      threadId={threadId}
      currentUserId={user.id}
      me={me ?? undefined}
      isMd={me?.role === "md"}
    />
  );
}
