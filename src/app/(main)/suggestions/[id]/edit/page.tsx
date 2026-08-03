import type { Metadata } from "next";
import { SuggestionEdit } from "@/components/suggestions/SuggestionEdit";

export const metadata: Metadata = {
  title: "건의 수정",
  robots: { index: false },
};

export default async function SuggestionEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SuggestionEdit id={id} />;
}
