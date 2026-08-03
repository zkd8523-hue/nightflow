import type { Metadata } from "next";
import { SuggestionForm } from "@/components/suggestions/SuggestionForm";

export const metadata: Metadata = {
  title: "건의 남기기",
  description: "나플에 바라는 점을 남겨주세요. 관리자만 보기로 비공개 제출도 가능합니다.",
  alternates: { canonical: "https://nightflow.kr/suggestions/new" },
};

export default function NewSuggestionPage() {
  return <SuggestionForm />;
}
