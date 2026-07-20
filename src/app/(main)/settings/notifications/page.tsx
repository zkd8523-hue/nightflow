"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NotificationSettings } from "@/components/settings/NotificationSettings";

export default function NotificationSettingsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-black text-foreground">알림 설정</h1>
        </div>

        <NotificationSettings />
      </div>
    </div>
  );
}
