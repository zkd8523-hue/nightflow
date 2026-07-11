"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DeleteSurveyButton({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    if (!confirm("이 설문 응답을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_delete_cancellation_survey", {
      p_id: surveyId,
    });
    if (error || !data?.success) {
      alert(data?.error || "삭제에 실패했습니다");
      setDeleting(false);
      return;
    }
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="shrink-0 p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
      aria-label="설문 응답 삭제"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}
