"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { MDHealthBadge } from "@/components/admin/MDHealthBadge";
import { computeHealthStatus, getGradeLabel } from "@/lib/utils/mdHealth";
import { toast } from "sonner";
import {
  Trash2, Check, X, ChevronDown, ChevronUp,
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

function ImagePreview({
  url,
  label,
  onPreview,
}: {
  url: string | null | undefined;
  label: string;
  onPreview: (url: string) => void;
}) {
  if (!url) {
    return (
      <div className="h-20 bg-neutral-900 rounded-xl border border-dashed border-neutral-800 flex items-center justify-center">
        <span className="text-xs text-neutral-600 italic">{label} 미첨부</span>
      </div>
    );
  }
  return (
    <button
      onClick={() => onPreview(url)}
      className="relative rounded-xl overflow-hidden border border-neutral-800 group w-full"
    >
      <img src={url} alt={label} className="w-full h-20 object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Eye className="w-5 h-5 text-white" />
      </div>
    </button>
  );
}

export function AdminClubsList({ initialClubs, authUserId, healthScores }: AdminClubsListProps) {
  const [clubs, setClubs] = useState<Club[]>(initialClubs);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingClub, setRejectingClub] = useState<Club | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  // 탭별 클럽 필터링
  const pendingClubs = clubs.filter((c) => c.status === "pending");
  const approvedClubs = clubs.filter((c) => c.status === "approved");
  const rejectedClubs = clubs.filter((c) => c.status === "rejected");

  const getHealthScore = (mdId: string | null | undefined): MDHealthScore | undefined => {
    if (!mdId) return undefined;
    return healthScores.find((hs) => hs.md_id === mdId);
  };

  const toggleExpand = (clubId: string) => {
    setExpandedClubId((prev) => (prev === clubId ? null : clubId));
  };

  const handleApprove = async (club: Club) => {
    try {
      setProcessing(club.id);

      const { data, error } = await supabase
        .from("clubs")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: authUserId,
          rejected_reason: null,
          rejected_at: null,
          rejected_by: null,
        })
        .eq("id", club.id)
        .eq("status", "pending")
        .eq("version", club.version)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          toast.error("다른 관리자가 이미 처리했습니다. 새로고침하세요.");
          router.refresh();
          return;
        }
        throw error;
      }

      setClubs((prev) => prev.map((c) => (c.id === club.id ? data as Club : c)));
      toast.success("클럽이 승인되었습니다.");
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'AdminClubsList.handleApprove');
      toast.error(msg || "승인 실패");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingClub) return;
    if (!rejectReason.trim()) {
      toast.error("거부 사유를 입력해주세요.");
      return;
    }

    try {
      setProcessing(rejectingClub.id);

      const { data, error } = await supabase
        .from("clubs")
        .update({
          status: "rejected",
          rejected_reason: rejectReason,
          rejected_by: authUserId,
          rejected_at: new Date().toISOString(),
          approved_at: null,
          approved_by: null,
        })
        .eq("id", rejectingClub.id)
        .eq("status", "pending")
        .eq("version", rejectingClub.version)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          toast.error("다른 관리자가 이미 처리했습니다. 새로고침하세요.");
          router.refresh();
          return;
        }
        throw error;
      }

      setClubs((prev) => prev.map((c) => (c.id === rejectingClub.id ? data as Club : c)));
      toast.success("클럽이 거부되었습니다.");
      setRejectDialogOpen(false);
      setRejectingClub(null);
      setRejectReason("");
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'AdminClubsList.handleReject');
      toast.error(msg || "거부 실패");
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 이 클럽을 삭제하시겠습니까? 관련 데이터가 모두 삭제될 수 있습니다.")) return;

    try {
      const { error } = await supabase.from("clubs").delete().eq("id", id);
      if (error) throw error;

      setClubs(clubs.filter((c) => c.id !== id));
      toast.success("삭제되었습니다.");
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'AdminClubsList.handleDelete');
      toast.error(msg || "삭제 실패");
    }
  };

  const openRejectDialog = (club: Club) => {
    setRejectingClub(club);
    setRejectDialogOpen(true);
  };

  return (
    <div className="space-y-6 pb-20">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "pending" | "approved" | "rejected")} className="w-full">
        <TabsList className="grid grid-cols-3 bg-neutral-900 border border-neutral-800">
          <TabsTrigger value="pending" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            승인 대기 ({pendingClubs.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            승인 완료 ({approvedClubs.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
            거부됨 ({rejectedClubs.length})
          </TabsTrigger>
        </TabsList>

        {/* 승인 대기 탭 */}
        <TabsContent value="pending" className="space-y-3 mt-4">
          {pendingClubs.length === 0 ? (
            <Card className="bg-[#1C1C1E] border-neutral-800/50 p-6 text-center">
              <p className="text-neutral-500 text-sm">승인 대기 중인 클럽이 없습니다</p>
            </Card>
          ) : (
            pendingClubs.map((club) => {
              const isExpanded = expandedClubId === club.id;
              const hs = getHealthScore(club.md?.id);
              const healthStatus = hs ? computeHealthStatus(hs) : undefined;

              return (
                <Card key={club.id} className="bg-[#1C1C1E] border-neutral-800/50 overflow-hidden">
                  <div className="p-4">
                    {/* 헤더: 클럽 정보 + 상태 배지 */}
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-white font-bold">
                          {club.name} <span className="text-neutral-500 text-xs ml-2">{club.area}</span>
                        </h3>
                        <p className="text-xs text-neutral-500 mt-1">{club.address}</p>
                      </div>
                      <StatusBadge status="pending" />
                    </div>

                    {/* MD 요약 정보 */}
                    {club.md && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                          신청자: {club.md.name} ({club.md.phone})
                        </span>
                        {club.md.area && (
                          <span className="text-xs text-neutral-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {club.md.area}
                          </span>
                        )}
                        {healthStatus && <MDHealthBadge status={healthStatus} />}
                      </div>
                    )}

                    {/* 확장 토글 */}
                    {club.md && (
                      <button
                        onClick={() => toggleExpand(club.id)}
                        className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors font-bold"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        MD 상세 정보 {isExpanded ? "접기" : "보기"}
                      </button>
                    )}

                    {/* 확장 영역: MD 프로필 + 실적 */}
                    {isExpanded && club.md && (
                      <div className="mt-4 pt-4 border-t border-neutral-800/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* 좌: MD 프로필 */}
                          <div className="bg-neutral-900/50 rounded-2xl p-4 border border-neutral-800/30 space-y-3">
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                              <Building2 className="w-3.5 h-3.5" /> MD Profile
                            </div>

                            {/* 아바타 + 이름 */}
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sm font-black text-neutral-400 shrink-0 overflow-hidden">
                                {club.md.profile_image ? (
                                  <img src={club.md.profile_image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  club.md.name?.substring(0, 1)
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-black text-white">{club.md.name}</p>
                                {club.md.md_status && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    club.md.md_status === "approved" ? "bg-green-500/10 text-green-400" :
                                    club.md.md_status === "pending" ? "bg-amber-500/10 text-amber-400" :
                                    "bg-neutral-500/10 text-neutral-400"
                                  }`}>
                                    {club.md.md_status === "approved" ? "승인됨" :
                                     club.md.md_status === "pending" ? "심사중" :
                                     club.md.md_status}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 메타 정보 */}
                            <div className="space-y-1.5">
                              {club.md.area && (
                                <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                                  <MapPin className="w-3 h-3 shrink-0" /> {club.md.area}
                                </div>
                              )}
                              {club.md.created_at && (
                                <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                                  <Calendar className="w-3 h-3 shrink-0" />
                                  가입 {dayjs(club.md.created_at).format("YYYY-MM-DD")}
                                  <span className="text-neutral-600">({dayjs(club.md.created_at).fromNow()})</span>
                                </div>
                              )}
                              {club.md.verification_club_name && (
                                <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                                  <Building2 className="w-3 h-3 shrink-0" /> 인증 클럽: {club.md.verification_club_name}
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

                            {/* 명함 사진 */}
                            <div className="space-y-1.5">
                              <p className="text-[10px] text-neutral-600 font-bold">명함 사진</p>
                              <ImagePreview
                                url={club.md.business_card_url}
                                label="명함"
                                onPreview={setPreviewImage}
                              />
                            </div>
                          </div>

                          {/* 우: 경매 실적 */}
                          <div className="bg-neutral-900/50 rounded-2xl p-4 border border-neutral-800/30 space-y-3">
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                              Performance
                            </div>

                            {hs ? (
                              <>
                                {/* Health Score + Grade */}
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-2xl font-black text-white">
                                      {hs.health_score !== null ? hs.health_score : "—"}
                                    </div>
                                    <div className="text-xs text-neutral-500">Health Score</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-bold text-neutral-300">{getGradeLabel(hs.grade)}</div>
                                    {healthStatus && <MDHealthBadge status={healthStatus} />}
                                  </div>
                                </div>

                                {/* 실적 그리드 */}
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
                                    <div className={`text-sm font-bold ${
                                      hs.sell_through_rate >= 60 ? "text-green-500" :
                                      hs.sell_through_rate >= 40 ? "text-amber-500" :
                                      hs.total_auctions > 0 ? "text-red-500" : "text-neutral-600"
                                    }`}>
                                      {hs.total_auctions > 0 ? `${hs.sell_through_rate}%` : "—"}
                                    </div>
                                  </div>
                                  <div className="bg-neutral-800/50 rounded-xl p-2.5 text-center">
                                    <div className="text-xs text-neutral-500 mb-0.5">노쇼</div>
                                    <div className={`text-sm font-bold ${hs.noshow_count > 0 ? "text-red-500" : "text-neutral-600"}`}>
                                      {hs.noshow_count}건
                                    </div>
                                  </div>
                                </div>

                                {/* Red Flags */}
                                {(hs.flag_consecutive_noshow || hs.flag_dormant) && (
                                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-2.5 space-y-1">
                                    {hs.flag_consecutive_noshow && (
                                      <p className="text-[11px] text-red-400">· 7일 이내 노쇼 2건+</p>
                                    )}
                                    {hs.flag_dormant && (
                                      <p className="text-[11px] text-red-400">· 30일+ 경매 미등록 (휴면)</p>
                                    )}
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

                        {/* MD 상세 보기 링크 */}
                        {club.md && (
                          <Link
                            href={`/admin/mds/${club.md.id}`}
                            className="mt-3 flex items-center gap-1.5 text-xs font-bold text-neutral-400 hover:text-white transition-colors"
                          >
                            MD 상세 보기 <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    )}

                    {/* 승인/거부 버튼 */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        onClick={() => handleApprove(club)}
                        disabled={processing === club.id}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold h-10"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        승인
                      </Button>
                      <Button
                        onClick={() => openRejectDialog(club)}
                        disabled={processing === club.id}
                        variant="outline"
                        className="flex-1 border-red-600 text-red-400 hover:bg-red-500/10 font-bold h-10"
                      >
                        <X className="w-4 h-4 mr-1" />
                        거부
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* 승인 완료 탭 */}
        <TabsContent value="approved" className="space-y-3 mt-4">
          {approvedClubs.length === 0 ? (
            <Card className="bg-[#1C1C1E] border-neutral-800/50 p-6 text-center">
              <p className="text-neutral-500 text-sm">승인된 클럽이 없습니다</p>
            </Card>
          ) : (
            approvedClubs.map((club) => (
              <Card key={club.id} className="bg-[#1C1C1E] border-neutral-800/50 p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-white font-bold">
                      {club.name} <span className="text-neutral-500 text-xs ml-2">{club.area}</span>
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">{club.address}</p>
                    {club.approved_at && (
                      <p className="text-xs text-green-400 mt-1">
                        승인: {new Date(club.approved_at).toLocaleDateString("ko-KR")}
                      </p>
                    )}
                    <StatusBadge status="approved" />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-neutral-500 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => handleDelete(club.id)}
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* 거부됨 탭 */}
        <TabsContent value="rejected" className="space-y-3 mt-4">
          {rejectedClubs.length === 0 ? (
            <Card className="bg-[#1C1C1E] border-neutral-800/50 p-6 text-center">
              <p className="text-neutral-500 text-sm">거부된 클럽이 없습니다</p>
            </Card>
          ) : (
            rejectedClubs.map((club) => (
              <Card key={club.id} className="bg-[#1C1C1E] border-neutral-800/50 p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-white font-bold">
                      {club.name} <span className="text-neutral-500 text-xs ml-2">{club.area}</span>
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">{club.address}</p>
                  </div>
                  <StatusBadge status="rejected" />
                </div>
                {club.rejected_reason && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded p-2 mt-2">
                    <p className="text-xs text-red-400 font-bold">거부 사유:</p>
                    <p className="text-xs text-red-400 mt-1">{club.rejected_reason}</p>
                  </div>
                )}
                {club.rejected_at && (
                  <p className="text-xs text-neutral-500 mt-2">
                    거부: {new Date(club.rejected_at).toLocaleDateString("ko-KR")}
                  </p>
                )}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* 거부 다이얼로그 */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-[#1C1C1E] border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle>클럽 신청 거부</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-neutral-400 text-sm">클럽명</Label>
              <p className="text-white font-bold mt-1">{rejectingClub?.name}</p>
            </div>
            <div>
              <Label className="text-neutral-400 text-sm">거부 사유 (필수)</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="bg-neutral-900 border-neutral-800 text-white mt-2 min-h-[100px]"
                placeholder="예: 실제 클럽 확인 불가, 중복 신청 등"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectingClub(null);
                setRejectReason("");
              }}
              className="border-neutral-700 text-white hover:bg-neutral-800"
            >
              취소
            </Button>
            <Button
              onClick={handleReject}
              disabled={!rejectReason.trim() || processing !== null}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              거부하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이미지 미리보기 다이얼로그 */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="bg-[#1C1C1E] border-neutral-800 max-w-2xl p-2">
          {previewImage && (
            <img src={previewImage} alt="미리보기" className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
