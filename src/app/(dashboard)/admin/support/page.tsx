"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ArrowLeft, Headset, ChevronRight } from "lucide-react";
import { logError } from "@/lib/utils/error";
import type { SupportThreadSummary } from "@/types/database";

function fmtRel(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

export default function AdminSupportPage() {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const [supabase] = useState(() => createClient());
  const [threads, setThreads] = useState<SupportThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== "admin") {
      router.replace("/");
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("get_support_threads");
      if (error) logError(error, "Load support threads");
      else setThreads((data as SupportThreadSummary[]) ?? []);
      setLoading(false);
    })();
  }, [user, isLoading, supabase, router]);

  return (
    <div className="max-w-lg mx-auto min-h-dvh bg-[#0A0A0A]">
      <header className="flex items-center gap-2 px-3 py-3 border-b border-neutral-800">
        <Link
          href="/admin"
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-5 h-5 text-neutral-400" />
        </Link>
        <h1 className="text-[16px] font-black text-white">고객 문의</h1>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-24 gap-3">
          <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <Headset className="w-7 h-7 text-blue-400" />
          </div>
          <p className="text-[14px] text-neutral-400 font-bold">아직 문의가 없어요</p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-800/60">
          {threads.map((t) => (
            <Link
              key={t.user_id}
              href={`/admin/support/${t.user_id}`}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-900/40 transition-colors"
            >
              <div className="relative w-11 h-11 rounded-full overflow-hidden bg-neutral-800 shrink-0">
                {t.profile_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.profile_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-neutral-500 text-[13px] font-bold">
                    {t.user_name?.[0] ?? "?"}
                  </div>
                )}
                {t.unread && (
                  <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0A0A0A]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[14px] truncate ${t.unread ? "text-white font-black" : "text-neutral-200 font-bold"}`}>
                    {t.user_name}
                  </p>
                  <span className="text-[11px] text-neutral-500 shrink-0">
                    {fmtRel(t.last_message_at)}
                  </span>
                </div>
                <p className={`text-[12px] truncate ${t.unread ? "text-neutral-300" : "text-neutral-500"}`}>
                  {t.last_sender_role === "admin" && "나: "}
                  {t.last_message_body}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
