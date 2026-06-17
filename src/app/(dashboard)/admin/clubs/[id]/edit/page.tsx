"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Loader2,
  Save,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { CLUB_TAG_GROUPS, makeTag } from "@/lib/clubs/tags";

interface ClubRow {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  operating_hours: string | null;
  entry_fee_detail: string | null;
  drink_menu_url: string | null;
  instagram: string | null;
  tags: string[] | null;
  aliases: string[] | null;
}

/** 누락 필드 개수 계산 — 진행 정렬용 */
function missingCount(c: ClubRow): number {
  let n = 0;
  if (!c.operating_hours) n++;
  if (!c.entry_fee_detail) n++;
  if (!c.drink_menu_url) n++;
  if (!c.tags || c.tags.length === 0) n++;
  return n;
}

export default function AdminClubEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { user, isLoading: userLoading } = useCurrentUser();

  const [allClubs, setAllClubs] = useState<ClubRow[]>([]);
  const [current, setCurrent] = useState<ClubRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 편집 상태
  const [operatingHours, setOperatingHours] = useState("");
  const [entryFeeDetail, setEntryFeeDetail] = useState("");
  const [drinkMenuUrl, setDrinkMenuUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");

  // 권한 가드
  useEffect(() => {
    if (userLoading) return;
    if (!user || user.role !== "admin") {
      router.replace("/");
    }
  }, [user, userLoading, router]);

  // 전체 클럽 + 현재 클럽 로드 (이전/다음 네비용)
  useEffect(() => {
    if (user?.role !== "admin") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("clubs")
        .select(
          "id, name, area, address, operating_hours, entry_fee_detail, drink_menu_url, instagram, tags, aliases"
        )
        .is("deleted_at", null)
        .order("name");
      if (error) {
        toast.error("클럽 목록 로드 실패");
        return;
      }
      if (cancelled) return;
      const rows = (data ?? []) as ClubRow[];
      // 누락 많은 클럽 먼저, 같으면 area+name
      rows.sort((a, b) => {
        const da = missingCount(b) - missingCount(a);
        if (da !== 0) return da;
        const aa = (a.area || "") + a.name;
        const bb = (b.area || "") + b.name;
        return aa.localeCompare(bb);
      });
      setAllClubs(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // 현재 클럽 세팅 (params.id 또는 allClubs의 첫 항목)
  useEffect(() => {
    if (allClubs.length === 0) return;
    const found = allClubs.find((c) => c.id === params.id);
    if (found) {
      setCurrent(found);
    } else {
      // id가 잘못된 경우 첫 누락 클럽으로 redirect
      router.replace(`/admin/clubs/${allClubs[0].id}/edit`);
    }
  }, [allClubs, params.id, router]);

  // 현재 클럽 데이터 → 편집 폼
  useEffect(() => {
    if (!current) return;
    setOperatingHours(current.operating_hours ?? "");
    setEntryFeeDetail(current.entry_fee_detail ?? "");
    setDrinkMenuUrl(current.drink_menu_url ?? "");
    setTags(current.tags ?? []);
    setAliases(current.aliases ?? []);
    setAliasInput("");
  }, [current]);

  const currentIndex = current
    ? allClubs.findIndex((c) => c.id === current.id)
    : -1;
  const prevClub = currentIndex > 0 ? allClubs[currentIndex - 1] : null;
  const nextClub =
    currentIndex >= 0 && currentIndex < allClubs.length - 1
      ? allClubs[currentIndex + 1]
      : null;

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addAlias = (raw: string) => {
    const v = raw.toLowerCase().trim().replace(/\s+/g, " ");
    if (!v) return;
    setAliases((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setAliasInput("");
  };
  const removeAlias = (v: string) => {
    setAliases((prev) => prev.filter((a) => a !== v));
  };

  const handleSave = async (goNext: boolean) => {
    if (!current) return;
    setSaving(true);
    try {
      // tags는 별도 API
      const tagsRes = await fetch("/api/admin/clubs/update-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: current.id, tags }),
      });
      if (!tagsRes.ok) {
        const j = await tagsRes.json().catch(() => ({}));
        throw new Error(j.error || "태그 저장 실패");
      }

      // 나머지 필드는 update-name API
      const baseRes = await fetch("/api/admin/clubs/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId: current.id,
          operating_hours: operatingHours.trim() || null,
          entry_fee_detail: entryFeeDetail.trim() || null,
          aliases,
        }),
      });
      if (!baseRes.ok) {
        const j = await baseRes.json().catch(() => ({}));
        throw new Error(j.error || "기본 정보 저장 실패");
      }

      // drink_menu_url은 별도 컬럼인데 update-name API에 없음 → 직접 update
      const trimmedDrink = drinkMenuUrl.trim();
      const dmuChanged = trimmedDrink !== (current.drink_menu_url ?? "");
      if (dmuChanged) {
        const { error: dmuError } = await supabase
          .from("clubs")
          .update({
            drink_menu_url: trimmedDrink || null,
            drink_menu_updated_at: trimmedDrink ? new Date().toISOString() : null,
          })
          .eq("id", current.id);
        if (dmuError) throw new Error(dmuError.message);
      }

      // 로컬 캐시 갱신
      setAllClubs((prev) =>
        prev.map((c) =>
          c.id === current.id
            ? {
                ...c,
                operating_hours: operatingHours.trim() || null,
                entry_fee_detail: entryFeeDetail.trim() || null,
                drink_menu_url: trimmedDrink || null,
                tags,
                aliases,
              }
            : c
        )
      );

      toast.success("저장됐어요");

      if (goNext && nextClub) {
        router.push(`/admin/clubs/${nextClub.id}/edit`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  if (userLoading || loading || !current) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  const missingNow = missingCount({
    ...current,
    operating_hours: operatingHours || null,
    entry_fee_detail: entryFeeDetail || null,
    drink_menu_url: drinkMenuUrl || null,
    tags,
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-2xl mx-auto px-4 py-5">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-5">
          <Link
            href="/admin/clubs"
            className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-white truncate">
              {current.name}
            </h1>
            <p className="text-[11px] text-neutral-500">
              {current.area || "지역 미설정"}
              {current.address ? ` · ${current.address}` : ""}
            </p>
          </div>
          {current.instagram && (
            <a
              href={`https://instagram.com/${current.instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center"
              aria-label="인스타그램 열기"
            >
              <Instagram className="w-4 h-4 text-pink-400" />
            </a>
          )}
        </div>

        {/* 진행 표시 */}
        <div className="flex items-center justify-between bg-[#1C1C1E] rounded-2xl px-4 py-3 mb-5">
          <div className="text-[12px] text-neutral-400">
            <span className="text-white font-black">{currentIndex + 1}</span>
            <span className="text-neutral-600"> / {allClubs.length}</span>
            {missingNow > 0 && (
              <span className="text-amber-400 font-bold ml-2">
                · 누락 {missingNow}개
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!prevClub || saving}
              onClick={() =>
                prevClub && router.push(`/admin/clubs/${prevClub.id}/edit`)
              }
              className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center disabled:opacity-30"
              aria-label="이전 클럽"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              type="button"
              disabled={!nextClub || saving}
              onClick={() =>
                nextClub && router.push(`/admin/clubs/${nextClub.id}/edit`)
              }
              className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center disabled:opacity-30"
              aria-label="다음 클럽"
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* 영업시간 */}
        <Section title="영업시간" missing={!operatingHours}>
          <input
            type="text"
            value={operatingHours}
            onChange={(e) => setOperatingHours(e.target.value)}
            placeholder="예: 금/토 22:00-05:00"
            disabled={saving}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
        </Section>

        {/* 입장료 */}
        <Section title="입장료" missing={!entryFeeDetail}>
          <input
            type="text"
            value={entryFeeDetail}
            onChange={(e) => setEntryFeeDetail(e.target.value)}
            placeholder="예: 남 15,000 / 여 10,000"
            disabled={saving}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
        </Section>

        {/* 주류메뉴 URL */}
        <Section title="주류메뉴 URL" missing={!drinkMenuUrl}>
          <input
            type="text"
            value={drinkMenuUrl}
            onChange={(e) => setDrinkMenuUrl(e.target.value)}
            placeholder="예: https://drive.google.com/... (이미지/PDF)"
            disabled={saving}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
        </Section>

        {/* 태그 */}
        <Section title="태그" missing={tags.length === 0}>
          <div className="space-y-3">
            {CLUB_TAG_GROUPS.map((g) => (
              <div key={g.group}>
                <div className="text-[11px] text-neutral-500 font-bold mb-1.5 flex items-center gap-1">
                  {g.emoji} {g.label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.options.map((opt) => {
                    const tag = makeTag(g.group, opt.key);
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        disabled={saving}
                        className={`text-[12px] font-bold px-3 py-1.5 rounded-full transition-colors ${
                          active
                            ? "bg-white text-black"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
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
        </Section>

        {/* 별칭 */}
        <Section title="검색 별칭">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {aliases.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 bg-neutral-800 text-white text-[11px] font-bold px-2 py-1 rounded-full"
              >
                {a}
                <button
                  type="button"
                  onClick={() => removeAlias(a)}
                  disabled={saving}
                  className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-neutral-700 text-neutral-400 hover:text-white"
                  aria-label={`${a} 제거`}
                >
                  ×
                </button>
              </span>
            ))}
            {aliases.length === 0 && (
              <span className="text-[11px] text-neutral-600">
                등록된 별칭이 없어요
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => {
                // 한글 IME 조합 중 Enter는 조합 확정용 — 별칭 잘림 막기
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addAlias(aliasInput);
                }
              }}
              placeholder="예: 에이스, ace, 에이쓰"
              disabled={saving}
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
            />
            <button
              type="button"
              onClick={() => addAlias(aliasInput)}
              disabled={saving || !aliasInput.trim()}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-black disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </Section>
      </div>

      {/* 저장 바 (sticky) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A0A0A]/95 backdrop-blur border-t border-neutral-800 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex-1 h-11 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            저장
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving || !nextClub}
            className="flex-[1.4] h-11 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-black text-[14px] flex items-center justify-center gap-1 disabled:opacity-50"
          >
            저장 + 다음
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  missing,
  children,
}: {
  title: string;
  missing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="text-[12px] text-neutral-400 font-bold mb-2 flex items-center gap-1.5">
        {title}
        {missing && (
          <span className="text-amber-400 text-[10px]">· 누락</span>
        )}
      </div>
      {children}
    </div>
  );
}
