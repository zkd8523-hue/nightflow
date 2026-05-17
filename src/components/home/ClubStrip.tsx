"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface Club {
  id: string;
  name: string;
  area: string;
  thumbnail_url: string | null;
}

interface ClubStripProps {
  clubs: Club[];
}

export function ClubStrip({ clubs: initialClubs }: ClubStripProps) {
  // SSR/hydration mismatch 방지: 초기엔 props 순서 그대로 → 마운트 후 셔플
  const [clubs, setClubs] = useState(initialClubs);

  useEffect(() => {
    setClubs([...initialClubs].sort(() => Math.random() - 0.5));
  }, [initialClubs]);

  if (clubs.length === 0) return null;

  return (
    <section className="mb-1">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">
          추천 클럽
        </span>
        <Link
          href="/clubs"
          className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          전체 {clubs.length}개 →
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-none pb-1 px-1">
        {clubs.map((club) => (
          <Link
            key={club.id}
            href={`/clubs/${club.id}`}
            className="flex flex-col items-center gap-1.5 shrink-0 group"
          >
            <div className="w-14 h-14 rounded-full overflow-hidden bg-neutral-800 border border-neutral-800 group-hover:border-neutral-600 transition-colors">
              {club.thumbnail_url ? (
                <Image
                  src={club.thumbnail_url}
                  alt={club.name}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-black text-xl">
                  {club.name[0]}
                </div>
              )}
            </div>
            <span className="text-[11px] text-neutral-500 font-medium text-center w-16 truncate group-hover:text-neutral-300 transition-colors">
              {club.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
