import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * 레거시 알림 딥링크 호환용 리다이렉트.
 * 조각/깃발 상세의 정식 경로는 /flags/[id]. 과거 알림들이 action_url을
 * '/puzzles/{id}'로 넣어둔 게 많아(수락/참여 등) 죽은 링크였음 → 여기서 흡수.
 */
export default async function PuzzleRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/flags/${id}`);
}
