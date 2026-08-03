import type { Metadata } from "next";
import { SuggestionDetail } from "@/components/suggestions/SuggestionDetail";

// 비공개(관리자만 보기) 건의가 있어 본문은 클라이언트에서 RLS를 태워 조회한다.
// 메타데이터에 제목을 노출하지 않는 이유도 동일 — 열람 권한 없는 사람에게 새어나가면 안 됨.
export const metadata: Metadata = {
  title: "건의",
  robots: { index: false },
};

export default async function SuggestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SuggestionDetail id={id} />;
}
