import type { Metadata } from "next";
import { ContactClient } from "@/components/support/ContactClient";

export const metadata: Metadata = {
  title: "고객 문의",
  description:
    "나이트플로우(나플) 고객센터. 앱에서 운영팀과 바로 채팅하거나 인스타그램 DM·이메일로 문의할 수 있습니다.",
  alternates: { canonical: "https://nightflow.kr/contact" },
};

export default function ContactPage() {
  return <ContactClient />;
}
