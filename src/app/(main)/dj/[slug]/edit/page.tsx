import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DjEditForm } from "@/components/djs/DjEditForm";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// 소유자 확인은 여기서 직접 한다 — 미들웨어 PROTECTED_PREFIXES는 고정 경로만
// 매칭하므로 /dj/[slug]/edit 같은 동적 경로는 페이지에서 직접 가드한다.
export default async function DjEditPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dj/${slug}/edit`);

  const { data: dj } = await supabase
    .from("djs")
    .select("id, slug, display_name, bio, photo_url, soundcloud_url, claimed_by_user_id")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!dj) notFound();
  if (dj.claimed_by_user_id !== user.id) redirect(`/dj/${slug}`);

  return (
    <div className="min-h-screen bg-background pt-20 pb-24 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-black text-foreground">프로필 편집</h1>
        <DjEditForm dj={dj} />
      </div>
    </div>
  );
}
