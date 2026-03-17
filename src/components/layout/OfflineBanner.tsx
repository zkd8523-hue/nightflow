"use client";

import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-black px-4 py-2 flex items-center justify-center gap-2 text-sm font-bold animate-in slide-in-from-top duration-300">
      <WifiOff className="w-4 h-4" />
      <span>인터넷 연결이 끊어졌습니다</span>
    </div>
  );
}
