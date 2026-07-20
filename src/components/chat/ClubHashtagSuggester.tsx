"use client";

import Image from "next/image";
import { useClubSearch, type ClubSuggestion } from "@/hooks/useClubSearch";

interface Props {
  /** 현재 입력 중인 # 뒤 토큰 (예: "아레") */
  query: string;
  open: boolean;
  onSelect: (club: ClubSuggestion) => void;
}

/**
 * 컴포저 위에 떠오르는 인라인 클럽 해시태그 자동완성 팝업.
 * - 부모(ChatRoom)가 absolute 컨테이너로 감싸서 위치 잡음
 */
export function ClubHashtagSuggester({ query, open, onSelect }: Props) {
  const { results, loading } = useClubSearch(query, 6);

  if (!open) return null;
  if (query.length === 0) return null;
  if (!loading && results.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
      <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
        #{query} 으로 시작하는 클럽
      </div>
      <div className="max-h-64 overflow-y-auto">
        {loading && results.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-muted-foreground">
            검색 중...
          </div>
        ) : (
          results.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => {
                // textarea blur 방지
                e.preventDefault();
              }}
              onClick={() => onSelect(c)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 transition-colors text-left"
            >
              <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-muted shrink-0">
                {c.thumbnail_url ? (
                  <Image
                    src={c.thumbnail_url}
                    alt={c.name}
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground/40 text-[10px] font-black">
                    {c.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-foreground truncate">
                  {c.name}
                </div>
                {c.area && (
                  <div className="text-[10px] text-muted-foreground">{c.area}</div>
                )}
              </div>
              <div className="text-[10px] text-brand-amber font-bold shrink-0">#</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
