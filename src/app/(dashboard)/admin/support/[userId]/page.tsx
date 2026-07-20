"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ArrowLeft } from "lucide-react";
import { SupportChat } from "@/components/support/SupportChat";

export default function AdminSupportThreadPage() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params.userId);
  const { user, isLoading } = useCurrentUser();
  const [supabase] = useState(() => createClient());
  const [name, setName] = useState<string>("고객");

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== "admin") {
      router.replace("/");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("display_name, name")
        .eq("id", userId)
        .single();
      if (data) setName(data.display_name || data.name || "고객");
    })();
  }, [user, isLoading, supabase, userId, router]);

  return (
    // (dashboard) 레이아웃의 하단 네비(4rem) 위로 채팅이 들어가도록 높이 보정
    <div className="max-w-lg mx-auto h-[calc(100dvh-4rem)] flex flex-col bg-background">
      <header className="shrink-0 flex items-center gap-2 px-3 py-3 border-b border-border">
        <Link
          href="/admin/support"
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-[15px] font-black text-foreground leading-tight">{name}</h1>
          <p className="text-[11px] text-muted-foreground">고객 문의 답장</p>
        </div>
      </header>

      <SupportChat adminViewUserId={userId} />
    </div>
  );
}
