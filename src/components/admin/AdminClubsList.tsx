"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MDHealthBadge } from "@/components/admin/MDHealthBadge";
import { computeHealthStatus, getGradeLabel } from "@/lib/utils/mdHealth";
import { toast } from "sonner";
import {
  Trash2, RotateCcw, ChevronDown, ChevronUp,
  Instagram, ExternalLink, Eye, ArrowRight, MapPin, Calendar, Building2,
} from "lucide-react";
import Link from "next/link";
import type { Club, MDHealthScore } from "@/types/database";
import { getErrorMessage, logError } from "@/lib/utils/error";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface AdminClubsListProps {
  initialClubs: Club[];
  authUserId: string;
  healthScores: MDHealthScore[];
}

function ImagePreview({ url, label, onPreview }: { url: string | null | undefined; label: string; onPreview: (url: string) => void }) {
  if (!url) {
    return (
      <div className="h-20 bg-neutral-900 rounded-xl border border-dashed border-neutral-800 flex items-center justify-center">
        <span className="text-xs text-neutral-600 italic">{label} 미첨부</span>
      </div>
    );
  }
  return (
    <button onClick={() => onPreview(url)} className="relative rounded-xl overflow-hidden border border-neutral-800 group w-full">
      <img src={url} alt={label} className="w-full h-20 object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Eye className="w-5 h-5 text-white" />
      </div>
    </button>
  );
}

export function AdminClubsList({ initialClubs, authUserId, healthScores }: AdminClubsListProps) {
  const [clubs, setClubs] = useState<Club[]>(initialClubs);
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const { activeClubs, deletedClubs } = useMemo(() => {
    const active: Club[] = [];
    const deleted: Club[] = [];
    for (const c of clubs) {
      if (c.deleted_at) deleted.push(c);
      else active.push(c);
    }
    return { activeClubs: active, deletedClubs: deleted };
  }, [clubs]);

  const getHealthScore = (mdId: string | null | undefined): MDHealthScore | undefined => {
    if (!mdId) return undefined;
    return healthScores.find((hs) => hs.md_id === mdId);
  };

  const toggleExpand = (clubId: string) => {
    setExpandedClubId((prev) => (prev === clubId ? null : clubId));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 클럽을 삭제하시겠습니까? (복구 가능)")) return;
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("clubs")
        .update({ deleted_at: nowIso, deleted_by: authUserId })
        .eq("id", id);
      if (error) throw error;
      setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, deleted_at: nowIso, deleted_by: authUserId } : c)));
      toast.success("삭제됐습니다. '삭제됨' 탭에서 복구 가능합니다.");
      router.refresh();
    } catch (error: unknown) {
      logError(error, "AdminClubsList.handleDelete");
      toast.error(getErrorMessage(error) || "삭제 실패");
    }
  };

  const handleRestore = async (id: string) => {
    if (!confirm("이 클럽을 복구하시겠습니까?")) return;
    try {
      const { error } = await supabase
        .from("clubs")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", id);
      if (error) throw error;
      setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, deleted_at: null, deleted_by: null } : c)));
      toast.success("복구됐습니다.");
      router.refresh();
    } catch (error: unknown) {
      logError(error, "AdminClubsList.handleRestore");
      toast.error(getErrorMessage(error) || "복구 실패");
    }
  };

  const renderClubCard = (club: Club) => {
    const isExpanded = expandedClubId === club.id;
    const hs = getHealthScore(club.md?.id);
    const healthStatus = hs ? computeHealthStatus(hs) : undefined;
    const isDeleted = !!club.deleted_at;

    return (
      <Card key={club.id} className="bg-[#1C1C1E] border-neutral-800/50 overflow-hidden">
        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-white font-bold">
                {club.name} <span className="text-neutral-500 text-xs ml-2">{club.area}</span>
              </h3>
              <p className="text-xs text-neutral-500 mt-1">{club.address}</p>
              {isDeleted && (
                <p className="text-xs text-red-400 mt-1.5">
                  {dayjs(club.deleted_at).format("YYYY-MM-DD HH:mm")} 삭제됨
                  <span className="text-neutral-600 ml-1">({dayjs(club.deleted_at).fromNow()})</span>
                </p>
              )}
            </div>
            {isDeleted ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-neutral-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => handleRestore(club.id)}
                title="복구"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="text-neutral-500 hover:text-red-400 hover:bg-red-500/10"
                onClick={() => handleDelete(club.id)}
                title="삭제"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          {club.md && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                MD: {club.md.name} ({club.md.phone})
              </span>
              {club.md.area && (
                <span className="text-xs text-neutral-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {Array.isArray(club.md.area) ? club.md.area.join(", ") : club.md.area}
                </span>
              )}
              {healthStatus && <MDHealthBadge status={healthStatus} />}
            </div>
          )}

          {club.md && (
            <button
              onClick={() => toggleExpand(club.id)}
              className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors font-bold"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              MD 상세 정보 {isExpanded ? "접기" : "보기"}
            </button>
          )}

          {isExpanded && club.md && (
            <div className="mt-4 pt-4 border-t border-neutral-800/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-neutral-900/50 rounded-2xl p-4 border border-neutral-800/30 space-y-3">
                  <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                    <Building2 className="w-3.5 h-3.5" /> MD Profile
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sm font-black text-neutral-400 shrink-0 overflow-hidden">
                      {club.md.profile_image ? (
                        <img src={club.md.profile_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        club.md.name?.substring(0, 1)
                      )}
                    </div>
                    <p className="text-sm font-black text-white">{club.md.name}</p>
                  </div>
                  <div className="space-y-1.5">
                    {club.md.area && (
                      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                        <MapPin className="w-3 h-3 shrink-0" /> {Array.isArray(club.md.area) ? club.md.area.join(", ") : club.md.area}
                      </div>
                    )}
                    {club.md.created_at && (
                      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                        <Calendar className="w-3 h-3 shrink-0" />
                        가입 {dayjs(club.md.created_at).format("YYYY-MM-DD")}
                        <span className="text-neutral-600">({dayjs(club.md.created_at).fromNow()})</span>
                      </div>
                    )}
                    {club.md.instagram ? (
                      <a
                        href={`https://instagram.com/${club.md.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                      >
                        <Instagram className="w-3 h-3 shrink-0" /> @{club.md.instagram}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                        <Instagram className="w-3 h-3 shrink-0" /> 미등록
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-neutral-600 font-bold">명함 사진</p>
                    <ImagePreview url={club.md.business_card_url} label="명함" onPreview={setPreviewImage} />
                  </div>
                </div>

                <div className="bg-neutral-900/50 rounded-2xl p-4 border border-neutral-800/30 space-y-3">
                  <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Performance</div>
                  {hs ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-2xl font-black text-white">{hs.health_score !== null ? hs.health_score : "—"}</div>
                          <div className="text-xs text-neutral-500">Health Score</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-neutral-300">{getGradeLabel(hs.grade)}</div>
                          {healthStatus && <MDHealthBadge status={healthStatus} />}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-neutral-800/50 rounded-xl p-2.5 text-center">
                          <div className="text-xs text-neutral-500 mb-0.5">총 경매</div>
                          <div className="text-sm font-bold text-white">{hs.total_auctions}건</div>
                        </div>
                        <div className="bg-neutral-800/50 rounded-xl p-2.5 text-center">
                          <div className="text-xs text-neutral-500 mb-0.5">낙찰</div>
                          <div className="text-sm font-bold text-white">{hs.won_auctions}건</div>
                        </div>
                        <div className="bg-neutral-800/50 rounded-xl p-2.5 text-center">
                          <div className="text-xs text-neutral-500 mb-0.5">낙찰률</div>
                          <div className={`text-sm font-bold ${hs.sell_through_rate >= 60 ? "text-green-500" : hs.sell_through_rate >= 40 ? "text-amber-500" : hs.total_auctions > 0 ? "text-red-500" : "text-neutral-600"}`}>
                            {hs.total_auctions > 0 ? `${hs.sell_through_rate}%` : "—"}
                          </div>
                        </div>
                        <div className="bg-neutral-800/50 rounded-xl p-2.5 text-center">
                          <div className="text-xs text-neutral-500 mb-0.5">노쇼</div>
                          <div className={`text-sm font-bold ${hs.noshow_count > 0 ? "text-red-500" : "text-neutral-600"}`}>{hs.noshow_count}건</div>
                        </div>
                      </div>
                      {(hs.flag_consecutive_noshow || hs.flag_dormant) && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-2.5 space-y-1">
                          {hs.flag_consecutive_noshow && <p className="text-[11px] text-red-400">· 7일 이내 노쇼 2건+</p>}
                          {hs.flag_dormant && <p className="text-[11px] text-red-400">· 30일+ 경매 미등록 (휴면)</p>}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="text-neutral-600 text-sm font-bold">신규 MD</div>
                      <div className="text-neutral-700 text-xs mt-1">경매 실적 없음</div>
                    </div>
                  )}
                </div>
              </div>
              {club.md && (
                <Link href={`/admin/mds/${club.md.id}`} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-neutral-400 hover:text-white transition-colors">
                  MD 상세 보기 <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-3 pb-20">
      <Tabs defaultValue="active">
        <TabsList className="grid w-full grid-cols-2 bg-[#1C1C1E] border border-neutral-800/50">
          <TabsTrigger value="active">활성 ({activeClubs.length})</TabsTrigger>
          <TabsTrigger value="deleted">삭제됨 ({deletedClubs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3 mt-4">
          {activeClubs.length === 0 ? (
            <Card className="bg-[#1C1C1E] border-neutral-800/50 p-6 text-center">
              <p className="text-neutral-500 text-sm">등록된 클럽이 없습니다</p>
            </Card>
          ) : (
            activeClubs.map(renderClubCard)
          )}
        </TabsContent>

        <TabsContent value="deleted" className="space-y-3 mt-4">
          {deletedClubs.length === 0 ? (
            <Card className="bg-[#1C1C1E] border-neutral-800/50 p-6 text-center">
              <p className="text-neutral-500 text-sm">삭제된 클럽이 없습니다</p>
            </Card>
          ) : (
            deletedClubs.map(renderClubCard)
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="bg-[#1C1C1E] border-neutral-800 max-w-2xl p-2">
          {previewImage && <img src={previewImage} alt="미리보기" className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
