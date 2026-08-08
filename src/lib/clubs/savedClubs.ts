"use client";

import { useEffect, useState } from "react";

// 클럽 찜(하트) — 기기 로컬 저장소.
//
// 배경: 외국인 유저가 /en, /en/clubs에서 클럽을 여러 개 열어보다가(관측: 한 명이 7개)
// 정작 예약 폼에서는 클럽 이름을 다시 검색해야 해서 이탈하는 패턴이 있었음.
// 후보를 모아두는 곳이 없어서 "아 좋네" → 이름 까먹음 → 재탐색 피로 → 이탈.
//
// 로그인 없이도 동작해야 하므로(익명 신청 허용) 서버가 아닌 localStorage에 둔다.
// sessionStorage("nightflow_book_intent")는 "지금 이 클럽으로 바로 예약" 단일 경로라 별개 —
// 이쪽은 여러 개를 계속 쌓아두는 장바구니 성격.

const KEY = "nightflow_saved_clubs";
const MAX_SAVED = 20;
// 같은 탭 안의 다른 컴포넌트에 변경을 알림 (storage 이벤트는 다른 탭에만 발생)
const CHANGED_EVENT = "nf-saved-clubs-changed";

export type SavedClub = {
  id: string;
  name: string;
  name_en?: string | null;
  area: string;
  thumbnail_url?: string | null;
  savedAt: number;
};

function read(): SavedClub[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 형태가 깨진 항목은 조용히 버림 (구버전 데이터·수동 편집 대비)
    return parsed.filter((c): c is SavedClub => !!c && typeof c.id === "string" && typeof c.name === "string");
  } catch {
    return [];
  }
}

function write(list: SavedClub[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {
    /* 사파리 시크릿 등 저장 실패 — 찜은 부가 기능이라 조용히 무시 */
  }
}

export function getSavedClubs(): SavedClub[] {
  return read();
}

export function isSavedClub(id: string): boolean {
  return read().some((c) => c.id === id);
}

/** 찜 토글. 저장된 새 상태(true=찜함)를 반환. */
export function toggleSavedClub(club: Omit<SavedClub, "savedAt">): boolean {
  const list = read();
  const exists = list.some((c) => c.id === club.id);
  if (exists) {
    write(list.filter((c) => c.id !== club.id));
    return false;
  }
  // 최근 찜한 것이 앞으로 (폼에서 위에 노출)
  write([{ ...club, savedAt: Date.now() }, ...list]);
  return true;
}

export function removeSavedClub(id: string) {
  write(read().filter((c) => c.id !== id));
}

export function clearSavedClubs() {
  write([]);
}

/**
 * 찜 목록 구독 훅.
 * SSR에서는 빈 배열로 시작하고 마운트 후 로드 — localStorage를 첫 렌더에서 읽으면
 * 서버 HTML과 달라져 하이드레이션 불일치가 남.
 */
export function useSavedClubs(): SavedClub[] {
  const [saved, setSaved] = useState<SavedClub[]>([]);

  useEffect(() => {
    const sync = () => setSaved(read());
    sync();
    window.addEventListener(CHANGED_EVENT, sync);
    window.addEventListener("storage", sync); // 다른 탭에서 변경된 경우
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return saved;
}
