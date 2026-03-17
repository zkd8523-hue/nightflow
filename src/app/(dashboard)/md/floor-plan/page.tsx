import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FloorPlanEditor } from "@/components/md/FloorPlanEditor";

export default async function MDFloorPlanPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: userData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!userData || userData.role !== "md" || userData.md_status !== "approved") {
    redirect("/");
  }

  // MD의 기본 클럽 조회
  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("id", userData.default_club_id)
    .single();

  if (!club) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] p-4">
        <div className="max-w-2xl mx-auto">
          <div className="space-y-4">
            <h1 className="text-white text-2xl font-black">플로어맵 관리</h1>
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center space-y-3">
              <p className="text-neutral-400">등록된 클럽이 없습니다.</p>
              <p className="text-neutral-600 text-sm">
                관리자에게 클럽 등록을 요청해주세요.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-4">
      <div className="max-w-2xl mx-auto pb-12">
        <div className="space-y-2 mb-8">
          <h1 className="text-white text-2xl font-black">{club.name} 플로어맵</h1>
          <p className="text-neutral-400 text-sm">
            테이블 위치를 수정하거나 새로운 테이블을 추가할 수 있습니다.
          </p>
        </div>

        <FloorPlanEditor
          targetId={club.id}
          targetType="club"
          initialFloorPlanUrl={club.floor_plan_url}
          onSave={() => {
            // 저장 완료 후 추가 액션 필요시 작성
          }}
        />
      </div>
    </div>
  );
}
