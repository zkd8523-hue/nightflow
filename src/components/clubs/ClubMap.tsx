"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Flag, MapPin } from "lucide-react";

interface ClubMapItem {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tags?: string[];
}

interface Props {
  clubs: ClubMapItem[];
  activeCountMap: Record<string, number>;
  initialCenter?: { lat: number; lng: number };
}

declare global {
  interface Window {
    kakao: any;
  }
}

const DEFAULT_CENTER = { lat: 37.5400, lng: 126.9920 }; // 서울 중심 (강남-홍대-이태원 중간쯤)
const DEFAULT_LEVEL = 8; // 수도권 전체 보이는 줌 레벨

let sdkPromise: Promise<void> | null = null;
function loadKakaoSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  if (typeof window !== "undefined" && window.kakao?.maps) {
    return Promise.resolve();
  }
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!key) {
    return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 미설정"));
  }

  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("kakao-map-sdk") as HTMLScriptElement | null;
    const onReady = () => {
      if (window.kakao?.maps) {
        window.kakao.maps.load(() => resolve());
      } else {
        reject(new Error("kakao SDK 로드 실패"));
      }
    };
    if (existing) {
      if (window.kakao?.maps) onReady();
      else existing.addEventListener("load", onReady);
      return;
    }
    const s = document.createElement("script");
    s.id = "kakao-map-sdk";
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.async = true;
    s.onload = onReady;
    s.onerror = () => reject(new Error("kakao SDK 네트워크 오류"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export function ClubMap({ clubs, activeCountMap, initialCenter }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [selectedClub, setSelectedClub] = useState<ClubMapItem | null>(null);

  const withCoords = clubs.filter((c) => c.latitude != null && c.longitude != null);

  useEffect(() => {
    let cancelled = false;
    loadKakaoSdk()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const center = initialCenter ?? DEFAULT_CENTER;
        const map = new window.kakao.maps.Map(mapRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level: DEFAULT_LEVEL,
        });
        mapInstanceRef.current = map;
        setStatus("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErrorMsg(e.message);
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [initialCenter]);

  // 마커 렌더링
  useEffect(() => {
    if (status !== "ready" || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // 기존 마커 제거
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    withCoords.forEach((c) => {
      const pos = new window.kakao.maps.LatLng(c.latitude!, c.longitude!);
      const flagCount = activeCountMap[c.id] || 0;

      const el = document.createElement("div");
      el.className = "cursor-pointer transition-transform hover:scale-110 active:scale-95";
      el.style.transform = "translate(-50%, -100%)";
      el.innerHTML = `
        <div class="px-2.5 py-1 rounded-full shadow-lg text-[11px] font-black whitespace-nowrap bg-amber-500 text-black">
          ${escapeHtml(c.name)}
        </div>
      `;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedClub(c);
        map.panTo(pos);
      });

      const overlay = new window.kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        yAnchor: 1,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    // 초기 줌은 수도권 고정 (DEFAULT_LEVEL). 비수도권 클럽도 마커는 표시되고
    // 유저가 줌아웃/팬 하면 볼 수 있음.
  }, [status, withCoords, activeCountMap]);

  if (status === "error") {
    return (
      <div className="h-[60vh] rounded-2xl bg-neutral-900 flex items-center justify-center text-center px-6">
        <div className="space-y-2">
          <MapPin className="w-8 h-8 text-neutral-600 mx-auto" />
          <p className="text-sm text-neutral-400">지도를 불러올 수 없어요</p>
          <p className="text-[11px] text-neutral-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={mapRef}
        data-no-pull-refresh
        className="w-full h-[70vh] rounded-2xl bg-neutral-900 overflow-hidden"
        style={{ touchAction: "pan-x pan-y" }}
      />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs text-neutral-500">지도 불러오는 중…</p>
        </div>
      )}
      {withCoords.length === 0 && status === "ready" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
          <p className="text-sm text-neutral-400 text-center">
            지도에 표시할 클럽이 아직 없어요
            <br />
            <span className="text-[11px] text-neutral-600">주소 등록된 클럽부터 자동 표시됩니다</span>
          </p>
        </div>
      )}

      {selectedClub && (
        <SelectedClubCard
          club={selectedClub}
          flagCount={activeCountMap[selectedClub.id] || 0}
          onClose={() => setSelectedClub(null)}
        />
      )}
    </div>
  );
}

function SelectedClubCard({
  club,
  flagCount,
  onClose,
}: {
  club: ClubMapItem;
  flagCount: number;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-3 right-3 bottom-3 bg-[#1C1C1E] rounded-2xl p-3 shadow-2xl border border-neutral-800">
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-neutral-800 text-neutral-400 text-xs flex items-center justify-center"
      >
        ✕
      </button>
      <Link href={`/clubs/${club.id}`} className="flex gap-3 items-center pr-7">
        <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0">
          {club.thumbnail_url ? (
            <Image src={club.thumbnail_url} alt={club.name} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[20px] font-black text-white/30">
              {club.name.charAt(0)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[14px] font-black truncate">{club.name}</p>
          <p className="text-neutral-500 text-[11px] font-medium truncate">{club.area || "기타"}</p>
          {flagCount > 0 && (
            <div className="mt-1 inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              <Flag className="w-3 h-3" />
              깃발 {flagCount}건
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c] as string);
}
