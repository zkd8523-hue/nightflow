import type { Metadata } from "next";
import { MessagesListClient } from "@/components/messages/MessagesListClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "대화",
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return <MessagesListClient />;
}
