"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBusinessMin, toBusinessMinutes } from "@/lib/lineups/time";
import { getClubAliases } from "@/lib/clubs/aliases";
import { DjPickerSheet, type DjPickerResult } from "@/components/admin/DjPickerSheet";
import { toast } from "sonner";
import { Loader2, Upload, X, ChevronLeft, Search } from "lucide-react";

/** 클럽 검색 정규화 — 공백·특수문자 제거 후 소문자. "club bermuda" == "CLUBBERMUDA" */
function normalizeClubSearch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

export interface ClubOption {
  id: string;
  name: string;
  area: string | null;
}

/**
 * DB(lineup_drafts.normalized)와 parse-poster API 응답이 실제로 쓰는 형태 —
 * 항상 snake_case + matchedDjId. 편집 화면 전용 camelCase(EditRow)와 다른 스키마다.
 * 여기서 섞어 쓰면 DB에서 다시 읽어온 draft(검토 큐 클릭, pending 복귀 등)를 열 때
 * start_min/end_min이 undefined가 되어 시간 입력란에 NaN:NaN이 뜨는 사고가 난다
 * (실제로 발생·재현·수정됨 — DraftEditView는 반드시 이 형태에서 EditRow로 변환한다).
 */
interface StoredSetRow {
  raw_name: string;
  // 캡션에서 온 라인업(핸들만 있고 포스터 시간표가 없는 경우)은 시간이 없다 —
  // null이 정상값이다. Migration 573.
  start_min: number | null;
  end_min: number | null;
  matchedDjId: string | null;
}

export interface DraftListItem {
  id: string;
  club_id: string;
  origin: string;
  poster_url: string | null;
  normalized: {
    event_date?: string;
    door_open_min?: number | null;
    event_title?: string | null;
    sets?: StoredSetRow[];
  } | null;
  confidence: number | null;
  confidence_detail: Record<string, number> & { blockers?: string[] } | null;
  status: string;
  created_at: string;
  clubs: { name: string; area: string | null } | null;
}

/**
 * 클럽 자동 매칭에 실패한 업로드 건. 이미 base64로 인코딩해서 한 번 파싱까지
 * 마친 상태라, 사람이 클럽만 골라주면 재업로드·재파싱 없이 바로 저장으로 이어간다.
 */
interface UnresolvedItem {
  fileName: string;
  imageBase64: string;
  guessedClubName: string | null;
  guessedClubInstagram: string | null;
  candidates: { id: string; name: string; area: string | null }[];
}

/** 편집 화면 전용 상태. StoredSetRow → EditRow 변환은 DraftEditView 진입 시 한 번만 한다. */
interface EditRow {
  rawName: string;
  startMin: number | null;
  endMin: number | null;
  djId: string | null;
  newDjName?: string;
  newDjInstagram?: string | null;
  learnAlias?: boolean;
  /** 화면 표시용 — djId가 있으면 그 이름, 없으면 미매칭 상태 */
  displayLabel: string;
}

function confidenceBadgeColor(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 85) return "bg-green-500/15 text-green-500";
  if (score >= 50) return "bg-amber-500/15 text-amber-500";
  return "bg-red-500/15 text-red-500";
}

const DETAIL_LABELS: Record<string, string> = {
  unmatched_dj: "미매칭 DJ",
  unreadable_time: "시간 판독 실패",
  dropped_rows: "판독 불가 행",
  time_reversed: "시간 역행",
  time_discontinuity: "시간 불연속",
  date_from_timestamp: "날짜 추정",
  too_many_sets: "셋 과다",
  no_door_open: "오픈시간 없음",
};

export function AdminLineupEditor({
  clubs,
  initialDrafts,
}: {
  clubs: ClubOption[];
  initialDrafts: DraftListItem[];
}) {
  const [drafts, setDrafts] = useState<DraftListItem[]>(initialDrafts);
  const [activeDraft, setActiveDraft] = useState<DraftListItem | null>(null);

  if (activeDraft) {
    return (
      <DraftEditView
        draft={activeDraft}
        clubs={clubs}
        onBack={() => setActiveDraft(null)}
        onPublished={(draftId) => {
          setDrafts((prev) => prev.filter((d) => d.id !== draftId));
          setActiveDraft(null);
        }}
      />
    );
  }

  return (
    <QueueListView
      clubs={clubs}
      drafts={drafts}
      onOpenDraft={setActiveDraft}
      onNewDraft={(draft) => {
        setDrafts((prev) => [draft, ...prev]);
        setActiveDraft(draft);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 검토 큐 목록
// ---------------------------------------------------------------------------

function QueueListView({
  clubs,
  drafts,
  onOpenDraft,
  onNewDraft,
}: {
  clubs: ClubOption[];
  drafts: DraftListItem[];
  onOpenDraft: (d: DraftListItem) => void;
  onNewDraft: (d: DraftListItem) => void;
}) {
  // 클럽이 100곳 가까이라 드롭다운으로는 못 찾는다 → 검색형 선택
  const [selectedClubId, setSelectedClubId] = useState("");
  const [clubQuery, setClubQuery] = useState("");
  const [clubSearchOpen, setClubSearchOpen] = useState(true);
  const [uploading, setUploading] = useState(false);

  const selectedClub = clubs.find((c) => c.id === selectedClubId) ?? null;

  const filteredClubs = useMemo(() => {
    const q = normalizeClubSearch(clubQuery);
    if (!q) return clubs.slice(0, 60);
    return clubs
      .filter((c) => {
        // 이름 + 지역 + 하드코딩 별칭("버뮤다" 같은 한글 통칭)까지 검색 대상
        const haystack = [c.name, c.area ?? "", ...getClubAliases(c.id)].map(normalizeClubSearch);
        return haystack.some((h) => h.includes(q));
      })
      .slice(0, 60);
  }, [clubs, clubQuery]);

  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [unresolvedItems, setUnresolvedItems] = useState<UnresolvedItem[]>([]);

  type ParsePosterResponse = {
    draftId?: string;
    clubId?: string;
    matchedClubName?: string | null;
    error?: string;
    reason?: string;
    guessedClubName?: string | null;
    guessedClubInstagram?: string | null;
    clubMatchCandidates?: { id: string; name: string; area: string | null }[];
    pendingParse?: unknown;
    normalized?: { eventDate: string; doorOpenMin: number | null; eventTitle: string | null };
    rows?: { raw_name: string; start_min: number | null; end_min: number | null; matchedDjId: string | null }[];
    confidence?: number | null;
    confidenceDetail?: Record<string, number | string[]>;
    blockers?: string[];
  };

  const buildDraftFromResponse = (data: ParsePosterResponse, clubId: string): DraftListItem | null => {
    if (!data.draftId || !data.normalized) return null;
    const club = clubs.find((c) => c.id === clubId);
    return {
      id: data.draftId,
      club_id: clubId,
      origin: "manual",
      poster_url: null,
      normalized: {
        event_date: data.normalized.eventDate,
        door_open_min: data.normalized.doorOpenMin,
        event_title: data.normalized.eventTitle,
        // DB/정본 형태(snake_case + matchedDjId) 그대로 둔다 — camelCase 변환은
        // DraftEditView 진입 시 한 번만 한다. 여기서 미리 바꾸면 DB에서 다시 읽어온
        // draft와 스키마가 갈라진다(실제로 NaN:NaN 버그로 재현된 원인).
        sets: data.rows ?? [],
      },
      confidence: data.confidence ?? null,
      confidence_detail: { ...data.confidenceDetail, blockers: data.blockers } as DraftListItem["confidence_detail"],
      status: "pending",
      created_at: new Date().toISOString(),
      clubs: club ? { name: club.name, area: club.area } : (data.matchedClubName ? { name: data.matchedClubName, area: null } : null),
    };
  };

  /** 실패 사유를 서버 응답에서 사람이 읽을 문구로 변환 — 원인별로 뭉개지 않는다. */
  const describeFailure = (res: Response, data: ParsePosterResponse): string =>
    res.status === 401
      ? "로그인이 만료됐어요. 새로고침 후 다시 로그인해주세요."
      : res.status === 403
        ? "관리자 권한이 없어요."
        : res.status === 400
          ? `요청이 거부됐어요: ${data.error ?? "알 수 없는 사유"}`
          : res.status >= 500
            ? `서버 오류예요 (HTTP ${res.status}): ${data.error ?? "잠시 후 다시 시도해주세요."}`
            : data.reason === "not_timetable"
              ? "타임테이블을 인식하지 못했어요. 수동으로 입력해주세요."
              : data.reason === "no_key"
                ? "서버에 ANTHROPIC_API_KEY가 없어요."
                : data.reason === "upstream_error"
                  ? "AI 호출에 실패했어요. 잠시 후 다시 시도해주세요."
                  : (data.error ?? "파싱에 실패했어요.");

  /** 파일 하나를 처리. 클럽을 못 찾으면 draft를 만들지 않고 unresolvedItems에 쌓아 사람이 나중에 고르게 한다. */
  const processFile = async (file: File, explicitClubId: string | null): Promise<void> => {
    const isHeic = /\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
    if (isHeic) {
      toast.error(`${file.name}: HEIC 형식은 지원하지 않아요. '호환성 우선(JPEG)'으로 바꾸거나 스크린샷으로 다시 저장해주세요.`);
      return;
    }

    const compressed = await compressToJpeg(file, 1600, 0.85);
    const base64 = await fileToBase64(compressed);

    const res = await fetch("/api/admin/lineups/parse-poster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageBase64: base64,
        mediaType: "image/jpeg",
        clubId: explicitClubId ?? undefined,
      }),
    });

    let data: ParsePosterResponse;
    try {
      data = await res.json();
    } catch {
      toast.error(`${file.name}: 서버 응답을 읽을 수 없어요 (HTTP ${res.status}).`);
      return;
    }

    if (data.reason === "club_unresolved") {
      // 클럽을 못 찾음 — 파싱 결과는 이미 있으니 다시 파싱하지 않고 사람이 클럽만
      // 고르면 바로 저장할 수 있도록 원본 base64와 함께 보관한다.
      setUnresolvedItems((prev) => [
        ...prev,
        {
          fileName: file.name,
          imageBase64: base64,
          guessedClubName: data.guessedClubName ?? null,
          guessedClubInstagram: data.guessedClubInstagram ?? null,
          candidates: data.clubMatchCandidates ?? [],
        },
      ]);
      toast.error(`${file.name}: 클럽을 찾지 못했어요${data.guessedClubName ? ` (추정: "${data.guessedClubName}")` : ""}. 아래에서 직접 골라주세요.`);
      return;
    }

    if (!res.ok || !data.draftId) {
      toast.error(`${file.name}: ${describeFailure(res, data)}`);
      return;
    }

    const newDraft = buildDraftFromResponse(data, data.clubId ?? explicitClubId ?? "");
    if (!newDraft) {
      toast.error(`${file.name}: 파싱 결과가 비어 있어요.`);
      return;
    }
    onNewDraft(newDraft);
    toast.success(`${file.name}: 파싱 완료${data.matchedClubName ? ` — ${data.matchedClubName}` : ""}`);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });
    try {
      // 순차 처리 — 병렬로 쏘면 같은 클럽·같은 날짜 포스터 2장이 동시에 permalink 없이
      // 들어와도 구분할 방법이 없고, Vision API 레이트리밋도 걱정할 필요가 없어진다.
      for (let i = 0; i < files.length; i++) {
        try {
          await processFile(files[i], selectedClubId || null);
        } catch (err) {
          console.error("[AdminLineupEditor] 파일 처리 실패:", files[i].name, err);
          toast.error(`${files[i].name}: ${err instanceof Error ? err.message : "업로드 중 오류가 발생했어요."}`);
        }
        setUploadProgress({ done: i + 1, total: files.length });
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  /** "클럽 확인 필요" 목록에서 사람이 클럽을 골랐을 때 — 재파싱 없이 그대로 저장으로 이어간다. */
  const resolveUnresolvedItem = async (item: UnresolvedItem, clubId: string) => {
    setUnresolvedItems((prev) => prev.filter((i) => i !== item));
    setUploading(true);
    try {
      const res = await fetch("/api/admin/lineups/parse-poster", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: item.imageBase64,
          mediaType: "image/jpeg",
          clubId,
        }),
      });
      let data: ParsePosterResponse;
      try {
        data = await res.json();
      } catch {
        toast.error(`${item.fileName}: 서버 응답을 읽을 수 없어요.`);
        return;
      }
      if (!res.ok || !data.draftId) {
        toast.error(`${item.fileName}: ${describeFailure(res, data)}`);
        return;
      }
      const newDraft = buildDraftFromResponse(data, clubId);
      if (!newDraft) {
        toast.error(`${item.fileName}: 파싱 결과가 비어 있어요.`);
        return;
      }
      onNewDraft(newDraft);
      toast.success(`${item.fileName}: 클럽 확정 — 검토해주세요`);
    } catch (err) {
      console.error("[AdminLineupEditor] 클럽 확정 실패:", err);
      toast.error(err instanceof Error ? err.message : "저장 중 오류가 발생했어요.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        <h1 className="text-xl font-black text-foreground">라인업 검토</h1>

        {/* 업로드 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3">
          <label className="text-xs text-muted-foreground block">클럽</label>

          {selectedClub && !clubSearchOpen ? (
            // 선택 완료 상태 — 다시 누르면 검색으로 돌아간다
            <button
              onClick={() => {
                setClubSearchOpen(true);
                setClubQuery("");
              }}
              className="w-full flex items-center justify-between bg-[#0A0A0A] border border-border rounded-xl px-3 py-2.5 text-sm text-left"
            >
              <span className="text-foreground truncate">
                {selectedClub.area ? `[${selectedClub.area}] ` : ""}
                {selectedClub.name}
              </span>
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            </button>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={clubQuery}
                  onChange={(e) => setClubQuery(e.target.value)}
                  placeholder="클럽 이름 검색 (예: 버뮤다, bermuda)"
                  autoFocus
                  className="w-full bg-[#0A0A0A] border border-border rounded-xl pl-9 pr-3 py-2.5 text-foreground text-sm placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1">
                {filteredClubs.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">검색 결과가 없습니다.</p>
                )}
                {filteredClubs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedClubId(c.id);
                      setClubSearchOpen(false);
                      setClubQuery("");
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      c.id === selectedClubId
                        ? "bg-white/10 text-foreground"
                        : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c.area && <span className="text-muted-foreground">[{c.area}] </span>}
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label
            className={`flex items-center justify-center gap-2 w-full py-8 rounded-xl border-2 border-dashed transition-colors ${
              uploading ? "border-border/40 cursor-not-allowed opacity-60" : "border-border cursor-pointer hover:border-white/30"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  파싱 중{uploadProgress ? ` (${uploadProgress.done}/${uploadProgress.total})` : "..."}
                </span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {selectedClubId ? "포스터 업로드 (여러 장 가능)" : "포스터 업로드 — 클럽은 자동으로 찾아요"}
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>
          {!selectedClubId && (
            <p className="text-[11px] text-muted-foreground px-1">
              클럽을 미리 고르지 않아도 돼요 — 포스터에 찍힌 클럽명·인스타로 자동으로 찾습니다. 여러 클럽 포스터를 한 번에 올려도 각각 알아서 매칭돼요.
            </p>
          )}
        </div>

        {unresolvedItems.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-bold text-amber-500">클럽 확인 필요 ({unresolvedItems.length})</h2>
            {unresolvedItems.map((item, i) => (
              <UnresolvedItemCard
                key={i}
                item={item}
                clubs={clubs}
                onResolve={(clubId) => resolveUnresolvedItem(item, clubId)}
                onDismiss={() => setUnresolvedItems((prev) => prev.filter((it) => it !== item))}
              />
            ))}
          </div>
        )}

        {/* 검토 큐 */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground px-1">검토 대기 ({drafts.length})</h2>
          {drafts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">대기 중인 항목이 없습니다.</p>
          )}
          {drafts.map((d) => (
            <button
              key={d.id}
              onClick={() => onOpenDraft(d)}
              className="w-full bg-[#1C1C1E] rounded-2xl p-3 flex gap-3 text-left hover:bg-[#232325] transition-colors"
            >
              {d.poster_url ? (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-[#0A0A0A]">
                  <Image src={d.poster_url} alt="" fill className="object-cover" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-lg bg-[#0A0A0A] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium text-sm truncate">{d.clubs?.name ?? "?"}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${confidenceBadgeColor(d.confidence)}`}>
                    {d.confidence ?? "-"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {d.normalized?.event_date ?? "-"} · 셋 {d.normalized?.sets?.length ?? 0}개
                </p>
                {d.confidence_detail && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {Object.entries(d.confidence_detail)
                      .filter(([k]) => k !== "blockers")
                      .map(([k, v]) => (
                        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground">
                          {DETAIL_LABELS[k] ?? k} {String(v)}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 클럽 자동 매칭 실패 건 하나. 후보가 있으면(동명 클럽 등) 후보 버튼으로 바로
 * 고르게 하고, 없으면 검색창을 보여준다 — 매번 전체 클럽 목록을 스크롤하지 않도록.
 */
function UnresolvedItemCard({
  item,
  clubs,
  onResolve,
  onDismiss,
}: {
  item: UnresolvedItem;
  clubs: ClubOption[];
  onResolve: (clubId: string) => void;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState(item.guessedClubName ?? "");
  const [searchOpen, setSearchOpen] = useState(item.candidates.length === 0);

  const filtered = useMemo(() => {
    const q = normalizeClubSearch(query);
    if (!q) return clubs.slice(0, 30);
    return clubs
      .filter((c) => {
        const haystack = [c.name, c.area ?? "", ...getClubAliases(c.id)].map(normalizeClubSearch);
        return haystack.some((h) => h.includes(q));
      })
      .slice(0, 30);
  }, [clubs, query]);

  return (
    <div className="bg-[#1C1C1E] rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-foreground truncate">
          {item.fileName}
          {item.guessedClubName && (
            <span className="text-muted-foreground"> · 추정 &ldquo;{item.guessedClubName}&rdquo;</span>
          )}
        </p>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-red-500 flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {item.candidates.length > 0 && !searchOpen && (
        <div className="flex flex-wrap gap-1.5">
          {item.candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => onResolve(c.id)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-foreground transition-colors"
            >
              {c.area ? `[${c.area}] ` : ""}
              {c.name}
            </button>
          ))}
          <button
            onClick={() => setSearchOpen(true)}
            className="text-xs px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            다른 클럽 찾기
          </button>
        </div>
      )}

      {searchOpen && (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="클럽 이름 검색"
              className="w-full bg-[#0A0A0A] border border-border rounded-lg pl-8 pr-2 py-1.5 text-xs text-foreground"
            />
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onResolve(c.id)}
                className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
              >
                {c.area ? `[${c.area}] ` : ""}
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 초안 편집 화면
// ---------------------------------------------------------------------------

function DraftEditView({
  draft,
  clubs,
  onBack,
  onPublished,
}: {
  draft: DraftListItem;
  clubs: ClubOption[];
  onBack: () => void;
  onPublished: (draftId: string) => void;
}) {
  const club = clubs.find((c) => c.id === draft.club_id);
  const [eventDate, setEventDate] = useState(draft.normalized?.event_date ?? "");
  const [doorOpenTime, setDoorOpenTime] = useState(
    draft.normalized?.door_open_min != null ? formatBusinessMin(draft.normalized.door_open_min) : ""
  );
  const [eventTitle, setEventTitle] = useState(draft.normalized?.event_title ?? "");
  const [rows, setRows] = useState<EditRow[]>(
    (draft.normalized?.sets ?? []).map((s) => ({
      rawName: s.raw_name,
      startMin: s.start_min,
      endMin: s.end_min,
      djId: s.matchedDjId,
      displayLabel: s.raw_name,
    }))
  );
  const [autoLink, setAutoLink] = useState(true);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // 일괄 등록 직후 "인스타 못 찾은 DJ 목록"을 보여줄지
  const [showUnregisteredList, setShowUnregisteredList] = useState(false);

  const unmatchedCount = rows.filter((r) => !r.djId && !r.newDjName).length;
  // newDjInstagram이 비어있는(=아직 인스타를 못 찾은) 신규 등록 대상 — 사람이 채워야 할 목록
  const missingInstagramRows = rows.filter((r) => !r.djId && r.newDjName && !r.newDjInstagram);

  const updateRow = (i: number, patch: Partial<EditRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      // 자동 연결: 이 행의 end가 바뀌면 다음 행의 start를 맞춘다
      if (autoLink && patch.endMin !== undefined && next[i + 1]) {
        next[i + 1] = { ...next[i + 1], startMin: patch.endMin };
      }
      return next;
    });
  };

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const addRow = () => {
    // 이전 행 끝 시각이 없으면(캡션 라인업이라 시간 자체가 없는 경우) 22:00으로
    // 지어내지 않는다 — 새 행도 시간 없이 시작해 운영자가 직접 채우게 한다.
    const last = rows[rows.length - 1];
    const start = last?.endMin ?? 960; // 기본 22:00 — 이전 행에 시간이 있을 때만 이어붙임
    const hasKnownStart = last ? last.endMin !== null : true;
    setRows((prev) => [
      ...prev,
      {
        rawName: "",
        startMin: hasKnownStart ? start : null,
        endMin: hasKnownStart ? start + 60 : null,
        djId: null,
        displayLabel: "",
      },
    ]);
  };

  /**
   * 미매칭 행 전부를 "이름 그대로" 신규 DJ로 일괄 등록한다. 인스타 핸들은 사람이
   * 찾아 넣어야 하는 정보라 자동화하지 않는다(동명이인 오매칭 위험) — 대신 등록
   * 직후 "인스타 미등록 DJ" 목록을 보여줘서 나중에 찾아 채워 넣을 수 있게 한다.
   */
  const bulkRegisterUnmatched = () => {
    setRows((prev) =>
      prev.map((r) =>
        r.djId || r.newDjName
          ? r
          : { ...r, newDjName: r.rawName, newDjInstagram: null, learnAlias: false, displayLabel: r.rawName }
      )
    );
    setShowUnregisteredList(true);
  };

  const handlePickerSelect = (result: DjPickerResult) => {
    if (pickerIndex === null) return;
    updateRow(pickerIndex, {
      djId: result.djId,
      newDjName: result.newDjName,
      newDjInstagram: result.newDjInstagram,
      learnAlias: result.learnAlias,
      displayLabel: result.djId ? rows[pickerIndex].rawName : result.newDjName ?? rows[pickerIndex].rawName,
    });
  };

  const handleSave = async () => {
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      toast.error("날짜를 YYYY-MM-DD 형식으로 입력해주세요.");
      return;
    }
    if (rows.length < 1) {
      toast.error("셋이 최소 1개 필요합니다.");
      return;
    }
    if (rows.some((r) => !r.djId && !r.newDjName)) {
      toast.error("DJ가 지정되지 않은 행이 있습니다.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/lineups/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          clubId: draft.club_id,
          eventDate,
          doorOpenMin: doorOpenTime ? toBusinessMinutes(doorOpenTime) : null,
          eventTitle: eventTitle || null,
          posterUrl: draft.poster_url,
          source: draft.origin === "ig" ? "ig_review" : "admin_vision",
          sets: rows.map((r) => ({
            startMin: r.startMin,
            endMin: r.endMin,
            rawName: r.rawName,
            djId: r.djId,
            newDjName: r.newDjName,
            newDjInstagram: r.newDjInstagram,
            learnAlias: r.learnAlias ?? true,
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? "저장에 실패했어요.");
        setSaving(false);
        return;
      }
      toast.success("라인업이 게시됐어요.");
      onPublished(draft.id);
    } catch {
      toast.error("저장 중 오류가 발생했어요.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        <button onClick={onBack} className="flex items-center gap-1 text-muted-foreground text-sm">
          <ChevronLeft className="w-4 h-4" /> 목록으로
        </button>

        <h1 className="text-lg font-black text-foreground">{club?.name ?? "?"}</h1>

        {draft.poster_url && (
          <div className="relative w-full aspect-[3/4] max-h-64 rounded-2xl overflow-hidden bg-[#1C1C1E]">
            <Image src={draft.poster_url} alt="포스터" fill className="object-contain" />
          </div>
        )}

        <div className="bg-[#1C1C1E] rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">날짜</label>
              <Input value={eventDate} onChange={(e) => setEventDate(e.target.value)} placeholder="YYYY-MM-DD" className="bg-[#0A0A0A] border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">DOOR OPEN</label>
              <Input value={doorOpenTime} onChange={(e) => setDoorOpenTime(e.target.value)} placeholder="22:00" className="bg-[#0A0A0A] border-border" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">파티명 (선택)</label>
            <Input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} className="bg-[#0A0A0A] border-border" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer px-1">
          <input type="checkbox" checked={autoLink} onChange={(e) => setAutoLink(e.target.checked)} className="w-3.5 h-3.5" />
          이전 행 종료 시각 → 다음 행 시작 시각 자동 연결
        </label>

        {unmatchedCount > 0 && (
          <button
            onClick={bulkRegisterUnmatched}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 text-amber-500 text-sm font-bold hover:bg-amber-500/15 transition-colors"
          >
            미매칭 {unmatchedCount}명 전부 새 DJ로 일괄 등록
          </button>
        )}

        {showUnregisteredList && missingInstagramRows.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-bold text-amber-500">
              인스타 못 찾은 DJ {missingInstagramRows.length}명 — 나중에 DJ 관리에서 채워주세요
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {missingInstagramRows.map((r, i) => (
                <li key={i}>· {r.newDjName ?? r.rawName}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="bg-[#1C1C1E] rounded-xl p-3 flex items-center gap-2">
              <Input
                value={row.startMin !== null ? formatBusinessMin(row.startMin) : ""}
                placeholder="--:--"
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d{2}:\d{2}$/.test(v)) updateRow(i, { startMin: toBusinessMinutes(v) });
                }}
                className="w-16 bg-[#0A0A0A] border-border text-center text-xs px-1"
              />
              <span className="text-muted-foreground text-xs">~</span>
              <Input
                value={row.endMin !== null ? formatBusinessMin(row.endMin) : ""}
                placeholder="--:--"
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d{2}:\d{2}$/.test(v)) updateRow(i, { endMin: toBusinessMinutes(v) });
                }}
                className="w-16 bg-[#0A0A0A] border-border text-center text-xs px-1"
              />
              <button
                onClick={() => setPickerIndex(i)}
                className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm truncate flex items-center gap-1.5 ${
                  row.djId || row.newDjName
                    ? "bg-green-500/10 text-green-500"
                    : "bg-amber-500/10 text-amber-500"
                }`}
              >
                <span className="truncate">{row.newDjName ?? (row.djId ? row.rawName : row.rawName || "DJ 미지정")}</span>
                {!row.djId && row.newDjName && !row.newDjInstagram && (
                  <span className="text-[10px] text-amber-500/70 flex-shrink-0">인스타 미등록</span>
                )}
              </button>
              <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-500 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <Button variant="outline" className="w-full rounded-full" onClick={addRow}>
          + 행 추가
        </Button>

        <Button
          className="w-full rounded-full bg-white text-black font-black py-6"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "게시하기"}
        </Button>
      </div>

      <DjPickerSheet
        key={pickerIndex ?? "closed"}
        open={pickerIndex !== null}
        onOpenChange={(open) => !open && setPickerIndex(null)}
        rawName={pickerIndex !== null ? rows[pickerIndex].rawName : ""}
        onSelect={handlePickerSelect}
      />
    </div>
  );
}

/**
 * 이미지를 JPEG로 재인코딩하며 축소한다.
 *
 * lib/utils/upload.ts 의 compressImage()는 원본 MIME을 유지하는데, PNG(스크린샷)는
 * 압축률이 낮아 base64가 서버 상한(4MB)을 쉽게 넘어 "이미지가 너무 큽니다"로 거절된다.
 * 포스터 판독에는 JPEG로 충분하므로 여기서는 항상 JPEG로 통일한다.
 */
function compressToJpeg(file: File, maxWidth: number, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas context unavailable"));
          return;
        }
        // JPEG는 투명도를 지원하지 않아 알파 영역이 검게 나온다 → 흰 배경을 먼저 깐다
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("toBlob failed"));
              return;
            }
            resolve(new File([blob], "poster.jpg", { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      // 브라우저가 <img>로 디코딩 못 하는 형식(HEIC 등)이면 여기서 걸린다 —
      // 파일 형식을 메시지에 남겨야 "이미지가 하나도 안 됨"과 구분된다.
      img.onerror = () => reject(new Error(`이미지를 열 수 없어요 (${file.type || "형식 불명"}). JPEG/PNG로 다시 시도해주세요.`));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없어요."));
    reader.readAsDataURL(file);
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:image/jpeg;base64,XXXX" 에서 base64 부분만 추출
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
