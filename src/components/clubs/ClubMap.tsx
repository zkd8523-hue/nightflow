"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MapPin, LocateFixed, Loader2 } from "lucide-react";
import { ClubMapSheet, type ClubMapSheetHandle } from "./ClubMapSheet";

interface ClubMapItem {
  id: string;
  name: string;
  area: string | null;
  thumbnail_url: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tags?: string[];
  drink_menu_url?: string | null;
  operating_hours?: string | null;
  entry_fee_detail?: string | null;
}

interface Props {
  clubs: ClubMapItem[];
  activeCountMap: Record<string, number>;
  hotdealMap?: Record<string, string>;
  initialCenter?: { lat: number; lng: number };
  /** 좌표 미등록으로 지도에 표시 못한 클럽 수 (있으면 시트 상단에 작게 안내) */
  unmappedCount?: number;
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
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.async = true;
    s.onload = onReady;
    s.onerror = () => reject(new Error("kakao SDK 네트워크 오류"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export function ClubMap({ clubs, activeCountMap, hotdealMap = {}, initialCenter, unmappedCount = 0 }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [selectedClub, setSelectedClub] = useState<ClubMapItem | null>(null);
  const [locating, setLocating] = useState(false);
  const [sheetRatio, setSheetRatio] = useState(0.5);
  const userPinRef = useRef<any>(null);
  const sheetRef = useRef<ClubMapSheetHandle | null>(null);

  const handleLocate = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!mapInstanceRef.current) return;

    const applyPosition = (lat: number, lng: number) => {
      const map = mapInstanceRef.current;
      const latlng = new window.kakao.maps.LatLng(lat, lng);
      map.setLevel(5);
      map.panTo(latlng);

      if (userPinRef.current) userPinRef.current.setMap(null);
      const dot = document.createElement("div");
      dot.innerHTML = `
        <div class="relative">
          <div class="absolute -inset-2 rounded-full bg-blue-500/30 animate-ping"></div>
          <div class="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow-lg"></div>
        </div>
      `;
      const overlay = new window.kakao.maps.CustomOverlay({
        position: latlng,
        content: dot,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 100,
      });
      overlay.setMap(map);
      userPinRef.current = overlay;
      sheetRef.current?.setSnap("minimized");
    };

    const showPermissionToast = async () => {
      if (opts.silent) return;
      const { Capacitor } = await import("@capacitor/core");
      const isNative = Capacitor.isNativePlatform();
      toast.error("위치 권한이 필요해요", {
        description: isNative
          ? "설정에서 위치 권한을 허용해주세요"
          : "브라우저 설정에서 위치 권한을 허용해주세요",
        action: {
          label: "설정 열기",
          onClick: () => {
            if (!isNative) return;
            try {
              const platform = Capacitor.getPlatform();
              const url =
                platform === "ios"
                  ? "app-settings:"
                  : "intent://settings#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;package=kr.nightflow.app;end";
              window.open(url, "_system");
            } catch {
              toast.error("설정 앱을 열 수 없어요");
            }
          },
        },
      });
    };

    setLocating(true);
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import("@capacitor/geolocation");
        const perm = await Geolocation.checkPermissions();
        let granted =
          perm.location === "granted" || perm.coarseLocation === "granted";
        if (!granted) {
          const req = await Geolocation.requestPermissions({
            permissions: ["location"],
          });
          granted =
            req.location === "granted" || req.coarseLocation === "granted";
        }
        if (!granted) {
          setLocating(false);
          await showPermissionToast();
          return;
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000,
        });
        applyPosition(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
        return;
      }
    } catch (e) {
      // Capacitor 로드 실패 시 웹 fallback으로 진행
    }

    if (!("geolocation" in navigator)) {
      setLocating(false);
      if (!opts.silent) toast.error("이 브라우저는 위치 기능을 지원하지 않아요");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      async (err) => {
        setLocating(false);
        if (opts.silent) return;
        if (err.code === err.PERMISSION_DENIED) {
          await showPermissionToast();
        } else {
          toast.error("위치를 가져올 수 없어요");
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // 페이지 진입 시 권한이 이미 허용된 경우만 자동으로 내 위치 이동
  useEffect(() => {
    if (status !== "ready") return;
    if (typeof navigator === "undefined" || !navigator.permissions) return;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        if (result.state === "granted") {
          handleLocate({ silent: true });
        }
      })
      .catch(() => { /* permissions API 미지원 브라우저는 무시 */ });
  }, [status, handleLocate]);

  // ClubList에서 검색·필터가 적용된 clubs를 받음
  const filtered = useMemo(
    () => clubs.filter((c) => c.latitude != null && c.longitude != null),
    [clubs]
  );
  const withCoords = filtered;

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

    filtered.forEach((c) => {
      const pos = new window.kakao.maps.LatLng(c.latitude!, c.longitude!);
      const isSelected = selectedClub?.id === c.id;
      const hasHotdeal = !!hotdealMap[c.id];

      const el = document.createElement("div");
      el.className = "cursor-pointer transition-transform hover:scale-110 active:scale-95";
      el.style.transform = "translate(-50%, -100%)";
      const fireBadge = hasHotdeal
        ? `<span class="inline-block mr-0.5">🔥</span>`
        : "";
      el.innerHTML = `
        <div class="px-2.5 py-1 rounded-full shadow-lg text-[11px] font-black whitespace-nowrap ${
          isSelected
            ? "bg-white text-black ring-2 ring-amber-400 scale-110"
            : hasHotdeal
            ? "bg-amber-500 text-black ring-1 ring-amber-300"
            : "bg-amber-500 text-black"
        }">
          ${fireBadge}${escapeHtml(c.name)}
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
        zIndex: isSelected ? 50 : 1,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

  }, [status, filtered, activeCountMap, hotdealMap, selectedClub]);

  // 필터/검색 결과가 바뀌면 지도 시야를 결과 클럽들에 맞춤
  // (지역 칩, 장르 칩, 검색어 변경 시 즉시 해당 영역으로 이동)
  const fingerprint = useMemo(
    () => filtered.map((c) => c.id).sort().join(","),
    [filtered]
  );
  useEffect(() => {
    if (status !== "ready" || !mapInstanceRef.current) return;
    if (filtered.length === 0) return;
    const map = mapInstanceRef.current;
    if (filtered.length === 1) {
      const c = filtered[0];
      map.setLevel(4);
      map.panTo(new window.kakao.maps.LatLng(c.latitude!, c.longitude!));
      return;
    }
    const bounds = new window.kakao.maps.LatLngBounds();
    filtered.forEach((c) => {
      bounds.extend(new window.kakao.maps.LatLng(c.latitude!, c.longitude!));
    });
    map.setBounds(bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, fingerprint]);

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

  const handleCardClick = (clubId: string) => {
    const c = filtered.find((x) => x.id === clubId);
    if (!c || !mapInstanceRef.current) return;
    setSelectedClub(c);
    const pos = new window.kakao.maps.LatLng(c.latitude!, c.longitude!);
    mapInstanceRef.current.panTo(pos);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-900 z-10">
      <div
        ref={mapRef}
        data-no-pull-refresh
        className="w-full h-full"
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

      {/* 내 위치 버튼 (시트 위에 떠 있음) */}
      {status === "ready" && (
        <button
          type="button"
          onClick={() => handleLocate()}
          disabled={locating}
          aria-label="내 위치로 이동"
          style={{ bottom: `calc(${sheetRatio * 100}vh + 12px)` }}
          className="absolute right-3 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-neutral-100 active:scale-95 transition-all disabled:opacity-60 z-30"
        >
          {locating ? (
            <Loader2 className="w-5 h-5 text-neutral-700 animate-spin" />
          ) : (
            <LocateFixed className="w-5 h-5 text-neutral-700" />
          )}
        </button>
      )}

      {status === "ready" && (
        <ClubMapSheet
          ref={sheetRef}
          clubs={filtered}
          activeCountMap={activeCountMap}
          hotdealMap={hotdealMap}
          selectedClubId={selectedClub?.id ?? null}
          onCardClick={handleCardClick}
          onHeightChange={setSheetRatio}
          unmappedCount={unmappedCount}
        />
      )}
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
