"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage, logError } from "@/lib/utils/error";

const SEOUL_AREAS = ["강남", "홍대", "이태원", "건대"] as const;
const REGIONAL_AREAS = ["부산", "대구", "인천", "광주", "대전", "울산", "세종"] as const;

interface AreaOnboardingSheetProps {
  userId: string;
  onClose: () => void;
}

export function AreaOnboardingSheet({ userId, onClose }: AreaOnboardingSheetProps) {
  const supabase = createClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (area: string) => {
    setSelected((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  // best-effort: DB 쓰기가 실패해도(예: 컬럼 미배포) 사용자를 모달에 가두지 않는다.
  // 로컬 상태(MDDashboard)에서 같은 세션 재노출은 막고, 영구 저장은 컬럼 배포 후 정상화된다.
  const markSeen = async () => {
    const { error } = await supabase
      .from("users")
      .update({ md_onboarding_areas_seen: true })
      .eq("id", userId);
    if (error) logError(error, "Mark MD onboarding seen");
  };

  const handleSave = async () => {
    if (selected.length === 0) {
      toast.error("최소 1개 지역을 선택하거나 '나중에'를 눌러주세요");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("set_md_puzzle_areas", {
        p_areas: selected,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || "저장 실패");
      await markSeen();
      toast.success("관심 지역이 저장되었습니다");
      onClose();
    } catch (error: unknown) {
      logError(error, "Save MD onboarding areas");
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleLater = async () => {
    setSaving(true);
    await markSeen();
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-lg bg-[#1C1C1E] rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: "calc(2rem + 3.5rem + env(safe-area-inset-bottom))" }}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-400" />
            <h2 className="text-[17px] font-black text-white">관심 지역 설정</h2>
          </div>
          <button
            onClick={handleLater}
            disabled={saving}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
        <p className="text-[13px] text-neutral-400 leading-relaxed mb-5">
          선택한 지역에 새 깃발이 꽂히면 푸시 알림을 받아요.
          <br />
          <span className="text-amber-400/80">
            ※ &lsquo;서울 어디든&rsquo; 깃발은 서울권(강남/홍대/이태원/건대) 1개라도 선택하면 자동 수신됩니다.
          </span>
        </p>

        {/* 서울권 */}
        <div className="mb-4">
          <p className="text-[11px] text-neutral-500 mb-2">서울권</p>
          <div className="flex flex-wrap gap-2">
            {SEOUL_AREAS.map((area) => {
              const isSel = selected.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggle(area)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${
                    isSel
                      ? "bg-white text-black border-white"
                      : "bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>

        {/* 광역시·기타 */}
        <div className="mb-6">
          <p className="text-[11px] text-neutral-500 mb-2">광역시·기타</p>
          <div className="flex flex-wrap gap-2">
            {REGIONAL_AREAS.map((area) => {
              const isSel = selected.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggle(area)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-bold border transition-colors ${
                    isSel
                      ? "bg-white text-black border-white"
                      : "bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={handleLater}
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-[14px] font-bold text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
          >
            나중에
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selected.length === 0}
            className="flex-[2] py-3 rounded-xl text-[14px] font-black bg-white text-black disabled:opacity-50"
          >
            {saving ? "저장 중..." : `저장 ${selected.length > 0 ? `(${selected.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
