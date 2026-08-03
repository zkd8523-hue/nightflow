import type { Metadata } from "next";
import { SuggestionBoard } from "@/components/suggestions/SuggestionBoard";

export const metadata: Metadata = {
  title: "건의 게시판",
  description:
    "나플에 바라는 점을 남기고 다른 회원의 건의에 공감·댓글을 남길 수 있는 게시판입니다.",
  alternates: { canonical: "https://nightflow.kr/suggestions" },
};

export default function SuggestionsPage() {
  return <SuggestionBoard />;
}
