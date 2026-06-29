import { BottomNav } from "@/components/layout/BottomNav";
import { ChatUpdateSheet } from "@/components/common/ChatUpdateSheet";

// 대시보드(/md/*, /admin/*)에도 하단 네비 노출 — 채팅·홈 등으로 빠르게 이동.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="pb-16">{children}</div>
      <BottomNav />
      <ChatUpdateSheet />
    </>
  );
}
