"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function ClubsAdminFab() {
  const { user } = useCurrentUser();
  if (user?.role !== "admin") return null;

  return (
    <Link
      href="/admin/clubs"
      className="fixed bottom-20 right-4 z-50 flex items-center gap-2 bg-amber-500 text-black font-black text-[13px] px-4 py-2.5 rounded-full shadow-lg hover:bg-amber-400 transition-colors active:scale-95"
    >
      <Settings className="w-4 h-4" />
      클럽 관리
    </Link>
  );
}
