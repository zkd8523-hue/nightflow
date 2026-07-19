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
  return <DmRoom threadId={threadId} currentUserId={user.id} />;
}
