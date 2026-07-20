"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Search, X, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { findClubIdsByAlias } from "@/lib/clubs/aliases";
import type { ClubLite, PreferredClubItem } from "@/types/database";

const MAX_DEFAULT = 3;
const SEOUL_AREAS = ["강남", "홍대", "이태원"];
const BROWSE_STEP = 10;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Supabase 스토리지 공개 URL → 렌더 변환(작은 이미지). next/image 옵티마이저를 건너뛰고
 * CDN에서 바로 작은 파일(수 KB)을 받아 로딩이 빠르고 균일해진다.
 */
function thumb(url: string | null, size = 144): string | null {
  if (!url) return null;
  if (url.includes("/storage/v1/object/public/")) {
    const render = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
    const sep = render.includes("?") ? "&" : "?";
    return `${render}${sep}width=${size}&height=${size}&resize=cover&quality=60`;
  }
  return url;
}

interface Props {
  value: PreferredClubItem[];
  onChange: (items: PreferredClubItem[]) => void;
  max?: number;
}

/**
 * 선호 클럽 피커 — 프로필/등록폼 공용.
 *  - 검색해서 DB에 있는 클럽 선택 → { kind:"club" }
 *  - 검색 결과 없으면 "'입력값' 추가 요청" → { kind:"wish" } (미등록 클럽 = 영업 리드)
 * 컨트롤드: 저장(user_pinned_clubs / club_requests 분리)은 상위에서 처리.
 */
export function PreferredClubsPicker({ value, onChange, max = MAX_DEFAULT }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClubLite[]>([]);
  const [searching, setSearching] = useState(false);

  // 서울 클럽 둘러보기 (랜덤 슬라이드 + 10개씩 추가로딩)
  const [browse, setBrowse] = useState<ClubLite[]>([]);
  const [browseVisible, setBrowseVisible] = useState(BROWSE_STEP);

  const atMax = value.length >= max;

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("clubs")
        .select("id, name, area, thumbnail_url")
        .in("area", SEOUL_AREAS)
        .is("deleted_at", null)
        .limit(100);
      if (!alive || !data) return;
      const arr = [...(data as ClubLite[])];
      // 셔플 후 썸네일 있는 클럽 우선 (이미지 미리보기 목적)
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      arr.sort((a, b) => (b.thumbnail_url ? 1 : 0) - (a.thumbnail_url ? 1 : 0));
      setBrowse(arr);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      const q = query.trim();
      const supabase = createClient();
      const aliasIds = findClubIdsByAlias(q);
      const sel = "id, name, area, thumbnail_url";

      const [nameRes, aliasRes] = await Promise.all([
        supabase.from("clubs").select(sel).ilike("name", `%${q}%`).is("deleted_at", null).limit(8),
        aliasIds.length > 0
          ? supabase.from("clubs").select(sel).in("id", aliasIds).is("deleted_at", null)
          : Promise.resolve({ data: [] as ClubLite[] }),
      ]);

      const seen = new Set<string>();
      const merged: ClubLite[] = [];
      for (const c of [...((nameRes.data ?? []) as ClubLite[]), ...((aliasRes.data ?? []) as ClubLite[])]) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        merged.push(c);
        if (merged.length >= 8) break;
      }
      setResults(merged);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function addClub(club: ClubLite) {
    if (value.some((v) => v.kind === "club" && v.club.id === club.id)) return;
    if (atMax) return;
    onChange([...value, { kind: "club", club }]);
    setQuery("");
    setResults([]);
  }

  function addWish(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (atMax) return;
    const n = norm(trimmed);
    // 이미 선택된 클럽/위시와 이름 중복 방지
    const dup = value.some(
      (v) => (v.kind === "wish" && norm(v.name) === n) || (v.kind === "club" && norm(v.club.name) === n),
    );
    if (dup) return;
    onChange([...value, { kind: "wish", name: trimmed, area: null }]);
    setQuery("");
    setResults([]);
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  // 이미 선택된 클럽은 둘러보기에서 제외
  const browseAvailable = browse.filter(
    (c) => !value.some((v) => v.kind === "club" && v.club.id === c.id),
  );

  const q = query.trim();
  // 이미 결과에 정확히 있는 이름이면 "추가 요청" 버튼 숨김
  const exactInResults = results.some((c) => norm(c.name) === norm(q));
  const alreadySelected = value.some(
    (v) => (v.kind === "wish" && norm(v.name) === norm(q)) || (v.kind === "club" && norm(v.club.name) === norm(q)),
  );
  const showAddWish = q.length > 0 && !searching && !exactInResults && !alreadySelected && !atMax;

  return (
    <div>
      {/* 선택된 항목 — 3열 그리드, 좌우 꽉차게 */}
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3 w-full">
          {value.map((item, idx) => (
            <div key={idx} className="relative">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-card border border-border">
                {item.kind === "club" && item.club.thumbnail_url ? (
                  <Image src={thumb(item.club.thumbnail_url, 144)!} alt={item.club.name} fill sizes="120px" unoptimized className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground/40 text-xl font-black">
                    {(item.kind === "club" ? item.club.name : item.name).charAt(0)}
                  </div>
                )}
                {item.kind === "wish" && (
                  <span className="absolute bottom-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/90 text-black">
                    요청
                  </span>
                )}
                <button
                  onClick={() => removeAt(idx)}
                  aria-label="삭제"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 backdrop-blur flex items-center justify-center text-foreground hover:bg-background"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="mt-1 text-[11px] font-bold text-foreground truncate">
                {item.kind === "club" ? item.club.name : item.name}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 서울 클럽 둘러보기 (검색창 위, 최대 미만일 때만) */}
      {!atMax && browseAvailable.length > 0 && (
        <div className="mb-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
            {browseAvailable.slice(0, browseVisible).map((c) => (
              <button key={c.id} onClick={() => addClub(c)} className="shrink-0 w-[72px] text-left">
                <div className="relative w-[72px] h-[72px] rounded-xl overflow-hidden bg-card">
                  {c.thumbnail_url ? (
                    <Image
                      src={thumb(c.thumbnail_url, 144)!}
                      alt={c.name}
                      fill
                      sizes="72px"
                      unoptimized
                      loading="eager"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-foreground/40 text-lg font-black">
                      {c.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="mt-1 text-[11px] font-bold text-foreground truncate">{c.name}</div>
              </button>
            ))}
            {browseVisible < browseAvailable.length && (
              <button
                onClick={() => setBrowseVisible((v) => v + BROWSE_STEP)}
                className="shrink-0 w-[72px] h-[72px] rounded-xl border border-dashed border-border flex items-center justify-center text-[12px] font-bold text-muted-foreground hover:bg-card"
              >
                더보기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 검색 (최대 미만일 때만) */}
      {!atMax && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={40}
              placeholder="클럽 이름으로 검색"
              className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-foreground placeholder-neutral-600 focus:outline-none focus:border-border"
            />
          </div>

          {searching && <p className="mt-2 text-[12px] text-muted-foreground">검색 중...</p>}

          {!searching && results.length > 0 && (
            <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => addClub(c)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-card text-left"
                >
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-card shrink-0">
                    {c.thumbnail_url ? (
                      <Image src={thumb(c.thumbnail_url, 96)!} alt={c.name} fill sizes="40px" unoptimized className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-foreground/40 text-sm font-black">
                        {c.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-foreground truncate">{c.name}</div>
                    <div className="text-[12px] text-muted-foreground">{c.area}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 미등록 클럽 자유입력 (영업 리드) */}
          {showAddWish && (
            <button
              onClick={() => addWish(q)}
              className="mt-2 w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-left"
            >
              <span className="text-[13px] text-brand-amber flex-1">
                <span className="font-bold">&lsquo;{q}&rsquo;</span>가 안보이나요? 추가요청하기
              </span>
              <Plus className="w-4 h-4 text-brand-amber shrink-0" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
