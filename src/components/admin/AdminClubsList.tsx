"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MDHealthBadge } from "@/components/admin/MDHealthBadge";
import { computeHealthStatus, getGradeLabel } from "@/lib/utils/mdHealth";
import { toast } from "sonner";
import {
  Trash2, RotateCcw, ChevronDown, ChevronUp, GitMerge, Pencil,
  Instagram, ExternalLink, Eye, ArrowRight, MapPin, Calendar, Building2, Search,
} from "lucide-react";
import { MergeClubDialog } from "@/components/admin/MergeClubDialog";
import Link from "next/link";

const AddressSearchModal = dynamic(
  () => import("@/components/md/AddressSearchModal").then((m) => ({ default: m.AddressSearchModal })),
  { ssr: false },
);
import { normalizeProfileImage } from "@/lib/utils/image";
import type { Club, MDHealthScore } from "@/types/database";
import { getErrorMessage, logError } from "@/lib/utils/error";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

type ClubMdChip = { id: string; name: string };

interface AdminClubsListProps {
  initialClubs: Club[];
  authUserId: string;
  healthScores: MDHealthScore[];
  clubMdLists: Record<string, ClubMdChip[]>;
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

type SortMode = "newest" | "md_desc" | "md_asc";

export function AdminClubsList({ initialClubs, authUserId, healthScores, clubMdLists }: AdminClubsListProps) {
  const [clubs, setClubs] = useState<Club[]>(initialClubs);
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<Club | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [renameTarget, setRenameTarget] = useState<Club | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameAddress, setRenameAddress] = useState("");
  const [renameAddressDetail, setRenameAddressDetail] = useState("");
  const [renamePostal, setRenamePostal] = useState<string | null>(null);
  const [renameLat, setRenameLat] = useState<number | null>(null);
  const [renameLng, setRenameLng] = useState<number | null>(null);
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  const handleMerged = (sourceId: string) => {
    const nowIso = new Date().toISOString();
    setClubs((prev) => prev.map((c) => (c.id === sourceId ? { ...c, deleted_at: nowIso, deleted_by: authUserId } : c)));
    router.refresh();
  };

  const openRename = (club: Club) => {
    setRenameTarget(club);
    setRenameValue(club.name);
    setRenameAddress(club.address ?? "");
    setRenameAddressDetail(club.address_detail ?? "");
    setRenamePostal(club.postal_code ?? null);
    setRenameLat(club.latitude ?? null);
    setRenameLng(club.longitude ?? null);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const nextName = renameValue.trim();
    const nextAddress = renameAddress.trim();
    const nextAddressDetail = renameAddressDetail.trim();
    if (!nextName) {
      toast.error("클럽명을 입력해주세요");
      return;
    }
    if (!nextAddress) {
      toast.error("주소를 입력해주세요");
      return;
    }

    const patch: Record<string, unknown> = {};
    if (nextName !== renameTarget.name) patch.name = nextName;
    if (nextAddress !== (renameTarget.address ?? "")) patch.address = nextAddress;
    if (nextAddressDetail !== (renameTarget.address_detail ?? "")) {
      patch.address_detail = nextAddressDetail || null;
    }
    if ((renamePostal ?? null) !== (renameTarget.postal_code ?? null)) {
      patch.postal_code = renamePostal;
    }
    if ((renameLat ?? null) !== (renameTarget.latitude ?? null)) {
      patch.latitude = renameLat;
    }
    if ((renameLng ?? null) !== (renameTarget.longitude ?? null)) {
      patch.longitude = renameLng;
    }

    if (Object.keys(patch).length === 0) {
      setRenameTarget(null);
      return;
    }

    setRenameSaving(true);
    try {
      const { data, error } = await supabase
        .from("clubs")
        .update(patch)
        .eq("id", renameTarget.id)
        .select("id, name, address, address_detail, postal_code, latitude, longitude")
        .single();
      if (error) throw error;
      if (!data) throw new Error("저장 후 행을 조회하지 못했습니다");
      setClubs((prev) =>
        prev.map((c) =>
          c.id === renameTarget.id
            ? {
                ...c,
                name: data.name,
                address: data.address,
                address_detail: data.address_detail,
                postal_code: data.postal_code,
                latitude: data.latitude,
                longitude: data.longitude,
              }
            : c,
        ),
      );
      toast.success("클럽 정보가 변경됐습니다");
      setRenameTarget(null);
      router.refresh();
    } catch (error: unknown) {
      logError(error, "AdminClubsList.handleRename");
      toast.error(getErrorMessage(error) || "변경 실패");
    } finally {
      setRenameSaving(false);
    }
  };

  const { activeClubs, deletedClubs } = useMemo(() => {
    const active: Club[] = [];
    const deleted: Club[] = [];
    for (const c of clubs) {
      if (c.deleted_at) deleted.push(c);
      else active.push(c);
    }
    const sorter = (a: Club, b: Club) => {
      if (sortMode === "newest") {
        return (b.created_at || "").localeCompare(a.created_at || "");
      }
      const aCount = clubMdLists[a.id]?.length ?? 0;
      const bCount = clubMdLists[b.id]?.length ?? 0;
      if (aCount !== bCount) return sortMode === "md_desc" ? bCount - aCount : aCount - bCount;
      return (b.created_at || "").localeCompare(a.created_at || "");
    };
    active.sort(sorter);
    deleted.sort(sorter);
    return { activeClubs: active, deletedClubs: deleted };
  }, [clubs, sortMode, clubMdLists]);

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
                {club.name}
                <span className="text-neutral-500 text-xs ml-2">{club.area}</span>
                <span className="text-neutral-500 text-xs ml-2 font-normal">· MD {clubMdLists[club.id]?.length ?? 0}명</span>
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
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-neutral-500 hover:text-blue-400 hover:bg-blue-500/10"
                  onClick={() => openRename(club)}
                  title="정보 수정 (이름·주소)"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-neutral-500 hover:text-amber-400 hover:bg-amber-500/10"
                  onClick={() => setMergeSource(club)}
                  title="병합"
                >
                  <GitMerge className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-neutral-500 hover:text-red-400 hover:bg-red-500/10"
                  onClick={() => handleDelete(club.id)}
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {(clubMdLists[club.id]?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {clubMdLists[club.id]!.map((md) => (
                <Link
                  key={md.id}
                  href={`/admin/mds/${md.id}`}
                  className="text-xs px-2 py-0.5 rounded font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                >
                  {md.name}
                </Link>
              ))}
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
                    <div className="relative w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sm font-black text-neutral-400 shrink-0 overflow-hidden">
                      <span className="absolute inset-0 flex items-center justify-center">
                        {club.md.name?.substring(0, 1)}
                      </span>
                      {club.md.profile_image && (
                        <img
                          src={normalizeProfileImage(club.md.profile_image)!}
                          alt={club.md.name || "MD"}
                          className="relative w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
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
      <div className="flex items-center justify-end gap-1.5">
        {([
          { v: "newest" as SortMode, label: "최신순" },
          { v: "md_desc" as SortMode, label: "MD 많은순" },
          { v: "md_asc" as SortMode, label: "MD 적은순" },
        ]).map((opt) => (
          <button
            key={opt.v}
            onClick={() => setSortMode(opt.v)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              sortMode === opt.v
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:text-neutral-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
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

      <MergeClubDialog
        source={mergeSource}
        onClose={() => setMergeSource(null)}
        onMerged={handleMerged}
      />

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="bg-[#1C1C1E] border-neutral-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Pencil className="w-4 h-4 text-blue-400" /> 클럽 정보 수정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">클럽명</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="클럽명"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50"
                autoFocus
                disabled={renameSaving}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">주소</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={renameAddress}
                  onChange={(e) => setRenameAddress(e.target.value)}
                  placeholder="도로명 주소"
                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50"
                  disabled={renameSaving}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAddressSearchOpen(true)}
                  disabled={renameSaving}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white px-3"
                  title="주소 검색 (좌표 자동 갱신)"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-neutral-600 mt-1">
                직접 수정하면 좌표(위도/경도)는 유지됩니다. 좌표까지 갱신하려면 우측 검색 버튼을 사용하세요.
              </p>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">상세 주소 (선택)</label>
              <input
                type="text"
                value={renameAddressDetail}
                onChange={(e) => setRenameAddressDetail(e.target.value)}
                placeholder="층, 호수 등"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50"
                disabled={renameSaving}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => setRenameTarget(null)}
                disabled={renameSaving}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white"
              >
                취소
              </Button>
              <Button
                onClick={handleRename}
                disabled={renameSaving || !renameValue.trim() || !renameAddress.trim()}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold disabled:opacity-40"
              >
                {renameSaving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddressSearchModal
        isOpen={addressSearchOpen}
        onClose={() => setAddressSearchOpen(false)}
        onSelectAddress={(result) => {
          setRenameAddress(result.address ?? "");
          setRenameAddressDetail(result.addressDetail ?? "");
          setRenamePostal(result.postalCode || null);
          setRenameLat(result.latitude ?? null);
          setRenameLng(result.longitude ?? null);
        }}
      />
    </div>
  );
}
