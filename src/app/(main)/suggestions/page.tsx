import type { Metadata } from "next";
import { SuggestionBoard } from "@/components/suggestions/SuggestionBoard";

export const metadata: Metadata = {
  title: "자유게시판",
  description:
    "나플 건의부터 클럽 문화·문제 제보까지, 자유롭게 이야기하고 공감·댓글을 남길 수 있는 게시판입니다.",
  alternates: { canonical: "https://nightflow.kr/suggestions" },
};

export default function SuggestionsPage() {
  return <SuggestionBoard />;
}
