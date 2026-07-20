"use client";

import { useEffect, useMemo, useState } from "react";
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
import { CLUB_TAG_GROUPS, makeTag } from "@/lib/clubs/tags";
import { Wine } from "lucide-react";

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
      <div className="h-20 bg-card rounded-xl border border-dashed border-border flex items-center justify-center">
        <span className="text-xs text-muted-foreground italic">{label} 미첨부</span>
      </div>
    );
  }
  return (
    <button onClick={() => onPreview(url)} className="relative rounded-xl overflow-hidden border border-border group w-full">
      <img src={url} alt={label} className="w-full h-20 object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Eye className="w-5 h-5 text-foreground" />
      </div>
    </button>
  );
}

type SortMode = "newest" | "md_desc" | "md_asc";

type SimilarClub = {
  id: string;
  name: string;
  area: string | null;
  status: string;
  partner_count: number;
  distance_m: number | null;
  reason: string;
};

/** Migration 439: find_similar_clubs — 신청 클럽과 닮은 기존 클럽을 조회해 관리자에게 경고 */
function SimilarClubsHint({ club }: { club: Club }) {
  const [candidates, setCandidates] = useState<SimilarClub[] | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("find_similar_clubs", {
        p_name: club.name,
        p_lat: club.latitude ?? null,
        p_lng: club.longitude ?? null,
        p_exclude: club.id,
      })
      .then(({ data }: { data: SimilarClub[] | null }) => {
        if (!cancelled) setCandidates(data ?? []);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club.id]);

  if (candidates === null) return <p className="text-xs text-muted-foreground">닮은 클럽 확인 중...</p>;
  if (candidates.length === 0) return <p className="text-xs text-emerald-500">✓ 닮은 기존 클럽 없음 — 새 클럽으로 보임</p>;

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-1.5">
      <p className="text-xs font-bold text-red-400">⚠️ 닮은 기존 클럽 {candidates.length}개 — 중복일 수 있어요</p>
      {candidates.slice(0, 5).map((c) => (
        <div key={c.id} className="text-xs text-foreground/80 flex items-center justify-between gap-2">
          <span>
            {c.name} <span className="text-muted-foreground">({c.area || "지역?"})</span>
            {" · "}
            <span className="text-brand-amber">{c.reason}</span>
            {c.distance_m != null && <span className="text-muted-foreground"> · {c.distance_m}m</span>}
          </span>
          <span className="text-muted-foreground shrink-0">파트너{c.partner_count}</span>
        </div>
      ))}
    </div>
  );
}

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
  const [renameInstagram, setRenameInstagram] = useState("");
  const [renameOperatingHours, setRenameOperatingHours] = useState("");
  const [renameTags, setRenameTags] = useState<string[]>([]);
  const [renameDrinkMenuUrl, setRenameDrinkMenuUrl] = useState<string | null>(null);
  const [renameDrinkMenuUpdatedAt, setRenameDrinkMenuUpdatedAt] = useState<string | null>(null);
  const [drinkMenuUploading, setDrinkMenuUploading] = useState(false);
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
    setRenameInstagram(club.instagram ?? "");
    setRenameOperatingHours(club.operating_hours ?? "");
    setRenameTags(club.tags ?? []);
    setRenameDrinkMenuUrl(club.drink_menu_url ?? null);
    setRenameDrinkMenuUpdatedAt(club.drink_menu_updated_at ?? null);
  };

  const toggleTag = (tag: string) => {
    setRenameTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleDrinkMenuUpload = async (file: File) => {
    if (!renameTarget) return;
    setDrinkMenuUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${renameTarget.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("club-menus")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("club-menus").getPublicUrl(path);
      setRenameDrinkMenuUrl(pub.publicUrl);
      setRenameDrinkMenuUpdatedAt(new Date().toISOString());
      toast.success("가격표 업로드됨 (저장 버튼을 눌러주세요)");
    } catch (error: unknown) {
      logError(error, "AdminClubsList.handleDrinkMenuUpload");
      toast.error(getErrorMessage(error) || "업로드 실패");
    } finally {
      setDrinkMenuUploading(false);
    }
  };

  const handleDrinkMenuRemove = () => {
    setRenameDrinkMenuUrl(null);
    setRenameDrinkMenuUpdatedAt(null);
  };

  // URL/@를 떼고 핸들만 추출
  const normalizeInstagramHandle = (raw: string): string => {
    let v = raw.trim();
    if (!v) return "";
    v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
    v = v.replace(/^@/, "");
    v = v.split(/[/?#]/)[0];
    return v.trim();
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
    const nextInstagram = normalizeInstagramHandle(renameInstagram);
    if ((nextInstagram || null) !== (renameTarget.instagram ?? null)) {
      patch.instagram = nextInstagram || null;
    }
    const nextOperatingHours = renameOperatingHours.trim();
    if ((nextOperatingHours || null) !== (renameTarget.operating_hours ?? null)) {
      patch.operating_hours = nextOperatingHours || null;
    }

    const currentTags = [...(renameTarget.tags ?? [])].sort().join("|");
    const nextTags = [...renameTags].sort().join("|");
    if (currentTags !== nextTags) {
      patch.tags = renameTags;
    }
    if ((renameDrinkMenuUrl ?? null) !== (renameTarget.drink_menu_url ?? null)) {
      patch.drink_menu_url = renameDrinkMenuUrl;
      patch.drink_menu_updated_at = renameDrinkMenuUrl
        ? renameDrinkMenuUpdatedAt ?? new Date().toISOString()
        : null;
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
        .select("id, name, address, address_detail, postal_code, latitude, longitude, instagram, operating_hours, tags, drink_menu_url, drink_menu_updated_at")
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
                instagram: data.instagram,
                operating_hours: data.operating_hours,
                tags: data.tags ?? [],
                drink_menu_url: data.drink_menu_url,
                drink_menu_updated_at: data.drink_menu_updated_at,
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

  const { activeClubs, deletedClubs, pendingClubs } = useMemo(() => {
    const active: Club[] = [];
    const deleted: Club[] = [];
    const pending: Club[] = [];
    for (const c of clubs) {
      if (c.deleted_at) deleted.push(c);
      else if (c.status === "pending") pending.push(c);
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
    pending.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")); // 오래 기다린 순
    return { activeClubs: active, deletedClubs: deleted, pendingClubs: pending };
  }, [clubs, sortMode, clubMdLists]);

  const getHealthScore = (mdId: string | null | undefined): MDHealthScore | undefined => {
    if (!mdId) return undefined;
    return healthScores.find((hs) => hs.md_id === mdId);
  };

  const toggleExpand = (clubId: string) => {
    setExpandedClubId((prev) => (prev === clubId ? null : clubId));
  };

  const handleApproveClub = async (id: string) => {
    try {
      const { error } = await supabase.rpc("approve_club", { p_club_id: id });
      if (error) throw error;
      setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, status: "approved" } : c)));
      toast.success("클럽을 승인했습니다. 이제 유저 화면에 노출됩니다.");
      router.refresh();
    } catch (error: unknown) {
      logError(error, "AdminClubsList.handleApproveClub");
      toast.error(getErrorMessage(error) || "승인 실패");
    }
  };

  const handleRejectClub = async (id: string) => {
    const reason = window.prompt("반려 사유를 입력해주세요 (필수)");
    if (!reason || !reason.trim()) return;
    try {
      const { error } = await supabase.rpc("reject_club", { p_club_id: id, p_reason: reason.trim() });
      if (error) throw error;
      setClubs((prev) => prev.map((c) => (c.id === id ? { ...c, status: "rejected" } : c)));
      toast.success("반려했습니다.");
      router.refresh();
    } catch (error: unknown) {
      logError(error, "AdminClubsList.handleRejectClub");
      toast.error(getErrorMessage(error) || "반려 실패");
    }
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
    // Phase 4(Migration 182): club.md 제거 — club_partners 의 owner(또는 첫 번째) 사용
    const primaryPartner = club.partners?.find(p => p.role === "owner") ?? club.partners?.[0];
    const primaryMd = primaryPartner?.user;
    const primaryMdId = primaryPartner?.md_id;
    const hs = getHealthScore(primaryMdId);
    const healthStatus = hs ? computeHealthStatus(hs) : undefined;
    const isDeleted = !!club.deleted_at;

    return (
      <Card key={club.id} className="bg-card border-border/50 overflow-hidden">
        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-foreground font-bold">
                {club.name}
                <span className="text-muted-foreground text-xs ml-2">{club.area}</span>
                <span className="text-muted-foreground text-xs ml-2 font-normal">· 파트너 {clubMdLists[club.id]?.length ?? 0}명</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-1">{club.address}</p>
              {isDeleted && (
                <p className="text-xs text-red-400 mt-1.5">
                  {dayjs(club.deleted_at).format("YYYY-MM-DD HH:mm")} 삭제됨
                  <span className="text-muted-foreground ml-1">({dayjs(club.deleted_at).fromNow()})</span>
                </p>
              )}
            </div>
            {isDeleted ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
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
                  className="text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10"
                  onClick={() => openRename(club)}
                  title="정보 수정 (이름·주소)"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-brand-amber hover:bg-amber-500/10"
                  onClick={() => setMergeSource(club)}
                  title="병합"
                >
                  <GitMerge className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
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
                  className="text-xs px-2 py-0.5 rounded font-medium text-brand-amber bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                >
                  {md.name}
                </Link>
              ))}
              {healthStatus && <MDHealthBadge status={healthStatus} />}
            </div>
          )}

          {primaryMd && (
            <button
              onClick={() => toggleExpand(club.id)}
              className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground/80 transition-colors font-bold"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              파트너 상세 정보 {isExpanded ? "접기" : "보기"}
            </button>
          )}

          {isExpanded && primaryMd && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card/50 rounded-2xl p-4 border border-border/30 space-y-3">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                    <Building2 className="w-3.5 h-3.5" /> MD Profile
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center text-sm font-black text-muted-foreground shrink-0 overflow-hidden">
                      <span className="absolute inset-0 flex items-center justify-center">
                        {primaryMd?.name?.substring(0, 1)}
                      </span>
                      {primaryMd?.profile_image && (
                        <img
                          src={normalizeProfileImage(primaryMd?.profile_image)!}
                          alt={primaryMd?.name || "파트너"}
                          className="relative w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      )}
                    </div>
                    <p className="text-sm font-black text-foreground">{primaryMd?.name}</p>
                  </div>
                  <div className="space-y-1.5">
                    {primaryMd?.area && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" /> {Array.isArray(primaryMd.area) ? primaryMd.area.join(", ") : primaryMd.area}
                      </div>
                    )}
                    {primaryMd?.created_at && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3 shrink-0" />
                        가입 {dayjs(primaryMd?.created_at).format("YYYY-MM-DD")}
                        <span className="text-muted-foreground">({dayjs(primaryMd?.created_at).fromNow()})</span>
                      </div>
                    )}
                    {primaryMd?.instagram ? (
                      <a
                        href={`https://instagram.com/${primaryMd?.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Instagram className="w-3 h-3 shrink-0" /> @{primaryMd?.instagram}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Instagram className="w-3 h-3 shrink-0" /> 미등록
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground font-bold">명함 사진</p>
                    <ImagePreview url={primaryMd?.business_card_url} label="명함" onPreview={setPreviewImage} />
                  </div>
                </div>

                <div className="bg-card/50 rounded-2xl p-4 border border-border/30 space-y-3">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Performance</div>
                  {hs ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-2xl font-black text-foreground">{hs.health_score !== null ? hs.health_score : "—"}</div>
                          <div className="text-xs text-muted-foreground">Health Score</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-foreground/80">{getGradeLabel(hs.grade)}</div>
                          {healthStatus && <MDHealthBadge status={healthStatus} />}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                          <div className="text-xs text-muted-foreground mb-0.5">총 경매</div>
                          <div className="text-sm font-bold text-foreground">{hs.total_auctions}건</div>
                        </div>
                        <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                          <div className="text-xs text-muted-foreground mb-0.5">낙찰</div>
                          <div className="text-sm font-bold text-foreground">{hs.won_auctions}건</div>
                        </div>
                        <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                          <div className="text-xs text-muted-foreground mb-0.5">낙찰률</div>
                          <div className={`text-sm font-bold ${hs.sell_through_rate >= 60 ? "text-money" : hs.sell_through_rate >= 40 ? "text-brand-amber" : hs.total_auctions > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {hs.total_auctions > 0 ? `${hs.sell_through_rate}%` : "—"}
                          </div>
                        </div>
                        <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                          <div className="text-xs text-muted-foreground mb-0.5">노쇼</div>
                          <div className={`text-sm font-bold ${hs.noshow_count > 0 ? "text-red-500" : "text-muted-foreground"}`}>{hs.noshow_count}건</div>
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
                      <div className="text-muted-foreground text-sm font-bold">신규 파트너</div>
                      <div className="text-muted-foreground text-xs mt-1">경매 실적 없음</div>
                    </div>
                  )}
                </div>
              </div>
              {primaryMdId && (
                <Link href={`/admin/mds/${primaryMdId}`} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                  파트너 상세 보기 <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  };

  const renderPendingCard = (club: Club) => (
    <Card key={club.id} className="bg-card border-amber-500/20 overflow-hidden">
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-foreground font-bold">
            {club.name}
            <span className="text-muted-foreground text-xs ml-2">{club.area}</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{club.address}</p>
          <p className="text-xs text-muted-foreground mt-1">
            신청 {dayjs(club.created_at).format("YYYY-MM-DD HH:mm")}
            <span className="ml-1">({dayjs(club.created_at).fromNow()})</span>
          </p>
        </div>

        <SimilarClubsHint club={club} />

        <div className="flex items-center gap-2">
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            onClick={() => handleApproveClub(club.id)}
          >
            승인
          </Button>
          <Button
            variant="ghost"
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => handleRejectClub(club.id)}
          >
            거절
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-brand-amber hover:bg-amber-500/10"
            onClick={() => setMergeSource(club)}
            title="기존 클럽으로 병합"
          >
            <GitMerge className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-3 pb-20">
      <div className="flex items-center justify-end gap-1.5">
        {([
          { v: "newest" as SortMode, label: "최신순" },
          { v: "md_desc" as SortMode, label: "파트너 많은순" },
          { v: "md_asc" as SortMode, label: "파트너 적은순" },
        ]).map((opt) => (
          <button
            key={opt.v}
            onClick={() => setSortMode(opt.v)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              sortMode === opt.v
                ? "bg-amber-500/15 text-brand-amber border border-amber-500/30"
                : "bg-card text-muted-foreground border border-border hover:text-foreground/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <Tabs defaultValue={pendingClubs.length > 0 ? "pending" : "active"}>
        <TabsList className="grid w-full grid-cols-3 bg-card border border-border/50">
          <TabsTrigger value="pending" className="data-[state=active]:text-brand-amber">
            심사 대기 ({pendingClubs.length})
          </TabsTrigger>
          <TabsTrigger value="active">활성 ({activeClubs.length})</TabsTrigger>
          <TabsTrigger value="deleted">삭제됨 ({deletedClubs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {pendingClubs.length === 0 ? (
            <Card className="bg-card border-border/50 p-6 text-center">
              <p className="text-muted-foreground text-sm">심사 대기 중인 클럽이 없습니다</p>
            </Card>
          ) : (
            pendingClubs.map(renderPendingCard)
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-3 mt-4">
          {activeClubs.length === 0 ? (
            <Card className="bg-card border-border/50 p-6 text-center">
              <p className="text-muted-foreground text-sm">등록된 클럽이 없습니다</p>
            </Card>
          ) : (
            activeClubs.map(renderClubCard)
          )}
        </TabsContent>

        <TabsContent value="deleted" className="space-y-3 mt-4">
          {deletedClubs.length === 0 ? (
            <Card className="bg-card border-border/50 p-6 text-center">
              <p className="text-muted-foreground text-sm">삭제된 클럽이 없습니다</p>
            </Card>
          ) : (
            deletedClubs.map(renderClubCard)
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="bg-card border-border max-w-2xl p-2">
          {previewImage && <img src={previewImage} alt="미리보기" className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>

      <MergeClubDialog
        source={mergeSource}
        onClose={() => setMergeSource(null)}
        onMerged={handleMerged}
      />

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Pencil className="w-4 h-4 text-blue-400" /> 클럽 정보 수정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-6 overflow-y-auto flex-1">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">클럽명</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="클럽명"
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
                autoFocus
                disabled={renameSaving}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">주소</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={renameAddress}
                  onChange={(e) => setRenameAddress(e.target.value)}
                  placeholder="도로명 주소"
                  className="flex-1 bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
                  disabled={renameSaving}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAddressSearchOpen(true)}
                  disabled={renameSaving}
                  className="bg-muted hover:bg-muted text-foreground px-3"
                  title="주소 검색 (좌표 자동 갱신)"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                직접 수정하면 좌표(위도/경도)는 유지됩니다. 좌표까지 갱신하려면 우측 검색 버튼을 사용하세요.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">상세 주소 (선택)</label>
              <input
                type="text"
                value={renameAddressDetail}
                onChange={(e) => setRenameAddressDetail(e.target.value)}
                placeholder="층, 호수 등"
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
                disabled={renameSaving}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">공식 인스타그램 (선택)</label>
              <input
                type="text"
                value={renameInstagram}
                onChange={(e) => setRenameInstagram(e.target.value)}
                placeholder="핸들 또는 URL (예: clubaceseoul_official)"
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
                disabled={renameSaving}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                @, URL 입력해도 자동으로 핸들만 추출됩니다
              </p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">영업시간</label>
              <input
                type="text"
                value={renameOperatingHours}
                onChange={(e) => setRenameOperatingHours(e.target.value)}
                placeholder="예: 금/토 22:00-05:00"
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
                disabled={renameSaving}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-2 block">
                태그 (필터/특징)
              </label>
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {CLUB_TAG_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div className="text-[10px] text-muted-foreground mb-1">
                      {g.emoji} {g.label}
                      {g.isFilter && (
                        <span className="ml-1 text-blue-400">(필터)</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.options.map((opt) => {
                        const tag = makeTag(g.group, opt.key);
                        const active = renameTags.includes(tag);
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            disabled={renameSaving}
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                              active
                                ? "bg-inverse text-inverse-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
                <Wine className="w-3.5 h-3.5 text-brand-amber" />
                가격표
              </label>
              {renameDrinkMenuUrl ? (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={renameDrinkMenuUrl}
                      alt="가격표"
                      className="w-full max-h-48 object-contain bg-background"
                    />
                  </div>
                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={drinkMenuUploading || renameSaving}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleDrinkMenuUpload(f);
                          e.target.value = "";
                        }}
                      />
                      <div className="text-center text-xs font-bold bg-muted hover:bg-muted text-foreground rounded-lg py-2">
                        {drinkMenuUploading ? "업로드 중..." : "교체"}
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={handleDrinkMenuRemove}
                      disabled={renameSaving}
                      className="flex-1 text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg py-2"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={drinkMenuUploading || renameSaving}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleDrinkMenuUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="h-20 bg-card rounded-xl border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground hover:border-amber-500/40 hover:text-brand-amber transition-colors">
                    {drinkMenuUploading ? "업로드 중..." : "가격표 이미지 업로드"}
                  </div>
                </label>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                인스타에 올라간 메뉴 이미지를 그대로 올리세요
              </p>
            </div>
          </div>

          <div className="flex gap-2 px-6 py-4 border-t border-border flex-shrink-0 bg-card">
            <Button
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              disabled={renameSaving}
              className="flex-1 bg-muted hover:bg-muted text-foreground"
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
