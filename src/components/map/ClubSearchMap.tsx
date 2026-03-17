"use client";

import { useState, useRef, useEffect } from "react";
import { searchClub, loadNaverMap } from "@/lib/naver/load-map";
import { Search, MapPin, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { logger } from "@/lib/utils/logger";

// Naver Maps API 타입은 src/types/database.ts에서 전역 선언됨

interface ClubLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface ClubSearchMapProps {
  onSelect: (location: ClubLocation) => void;
  selectedLocation?: ClubLocation;
}

export function ClubSearchMap({
  onSelect,
  selectedLocation,
}: ClubSearchMapProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<ClubLocation | null>(
    selectedLocation || null
  );
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // 검색 함수
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) {
      setError("클럽 이름을 입력해주세요.");
      return;
    }

    try {
      setIsSearching(true);
      setError(null);

      const data = await searchClub(query);

      if (!data) {
        setError("검색 결과가 없습니다. 정확한 클럽 이름을 입력해주세요.");
        setResult(null);
        return;
      }

      setResult(data);
      onSelect(data);

      // 지도 업데이트
      if (mapInstanceRef.current && window.naver?.maps) {
        mapInstanceRef.current.setCenter(
          new window.naver.maps.LatLng(data.lat, data.lng)
        );

        // 기존 마커 제거
        if (markerRef.current) {
          markerRef.current.setMap(null);
        }

        // 새 마커 추가
        markerRef.current = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(data.lat, data.lng),
          map: mapInstanceRef.current,
          title: data.name,
        });
      }
    } catch (err) {
      logger.error("Search error:", err);
      setError("검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  // 지도 초기화
  useEffect(() => {
    const initMap = async () => {
      try {
        await loadNaverMap();

        if (mapRef.current && !mapInstanceRef.current && window.naver?.maps) {
          const defaultLat = selectedLocation?.lat || 37.4979;
          const defaultLng = selectedLocation?.lng || 127.0276;

          const map = new window.naver.maps.Map(mapRef.current, {
            center: new window.naver.maps.LatLng(defaultLat, defaultLng),
            zoom: 15,
            zoomControl: true,
            zoomControlOptions: {
              position: window.naver?.maps?.Position?.TOP_RIGHT || 2,
            },
          });

          mapInstanceRef.current = map;

          // 초기 마커
          if (selectedLocation) {
            markerRef.current = new window.naver.maps.Marker({
              position: new window.naver.maps.LatLng(
                selectedLocation.lat,
                selectedLocation.lng
              ),
              map: map,
              title: selectedLocation.name,
            });
          }
        }
      } catch (err) {
        logger.error("Map init error:", err);
        setError("지도 로드 실패");
      }
    };

    initMap();
  }, [selectedLocation]);

  return (
    <div className="space-y-4">
      {/* 검색 입력 */}
      <form onSubmit={handleSearch} className="space-y-2">
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="클럽 이름으로 검색 (예: 강남 클럽 XYZ)"
            className="bg-neutral-900 border-neutral-800 h-11 text-white pl-10"
            disabled={isSearching}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
        </div>

        <button
          type="submit"
          disabled={isSearching}
          className="w-full h-10 bg-green-500 hover:bg-green-600 text-black font-bold rounded-lg transition-colors disabled:opacity-50"
        >
          {isSearching ? "검색 중..." : "검색"}
        </button>
      </form>

      {/* 에러 메시지 */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {/* 검색 결과 표시 */}
      {result && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
          <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white truncate">{result.name}</p>
            <p className="text-neutral-400 text-xs truncate">{result.address}</p>
            <p className="text-neutral-500 text-[10px] mt-1">
              위도: {result.lat.toFixed(4)}, 경도: {result.lng.toFixed(4)}
            </p>
          </div>
        </div>
      )}

      {/* 지도 */}
      <div className="space-y-2">
        <label className="text-neutral-400 text-xs font-bold uppercase">
          <MapPin className="w-3 h-3 inline mr-1" />
          위치 확인
        </label>
        <div
          ref={mapRef}
          className="w-full h-64 rounded-xl bg-neutral-900 border border-neutral-800"
        />
      </div>
    </div>
  );
}
