"use client";

import { useEffect, useState } from "react";

// 최근에 본 클럽 — 기기 로컬 저장소. savedClubs.ts(찜)와 동일한 패턴.
//
// 배경: 찜은 손님이 "일부러" 하트를 눌러야 쌓이는데, 그냥 상세만 열어보고
// 하트는 안 누른 클럽도 나중에 다시 찾고 싶을 수 있다. 찜과 달리 이건
// 매 상세 열람마다 자동으로 쌓인다 — 손님이 아무 것도 안 눌러도 된다.
//
// 로그인 없이도 동작해야 하므로 localStorage에 둔다.

const KEY = "nightflow_recent_clubs";
const MAX_RECENT = 12;
const CHANGED_EVENT = "nf-recent-clubs-changed";

export type RecentClub = {
  id: string;
  name: string;
  name_en?: string | null;
  area: string;
  thumbnail_url?: string | null;
  viewedAt: number;
};

function read(): RecentClub[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is RecentClub => !!c && typeof c.id === "string" && typeof c.name === "string");
  } catch {
    return [];
  }
}

function write(list: RecentClub[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {
    /* 사파리 시크릿 등 저장 실패 — 부가 기능이라 조용히 무시 */
  }
}

/** 상세를 열 때마다 호출. 이미 있으면 맨 앞으로 옮기고(최신순), 없으면 추가. */
export function recordRecentClub(club: Omit<RecentClub, "viewedAt">) {
  const list = read().filter((c) => c.id !== club.id);
  write([{ ...club, viewedAt: Date.now() }, ...list]);
}

export function getRecentClubs(): RecentClub[] {
  return read();
}

/** 목록에서 한 곳만 뺀다. write()가 변경 이벤트를 쏘므로 화면은 자동 갱신된다. */
export function removeRecentClub(id: string) {
  write(read().filter((c) => c.id !== id));
}

export function clearRecentClubs() {
  write([]);
}

/**
 * 최근 본 클럽 구독 훅. SSR에서는 빈 배열로 시작하고 마운트 후 로드 —
 * localStorage를 첫 렌더에서 읽으면 서버 HTML과 달라져 하이드레이션 불일치가 남.
 */
export function useRecentClubs(): RecentClub[] {
  const [recent, setRecent] = useState<RecentClub[]>([]);

  useEffect(() => {
    const sync = () => setRecent(read());
    sync();
    window.addEventListener(CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return recent;
}
