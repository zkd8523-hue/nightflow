"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MapPin, Loader2, X, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { loadNaverMap } from "@/lib/naver/load-map";
import { getErrorMessage, logError } from "@/lib/utils/error";
import { logger } from "@/lib/utils/logger";

// Naver Maps API 타입은 src/types/database.ts에서 전역 선언됨

interface AddressResult {
  address: string;
  addressDetail: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

interface AddressSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAddress: (result: AddressResult) => void;
}

export function AddressSearchModal({ isOpen, onClose, onSelectAddress }: AddressSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      return;
    }
    // 지도 SDK 사전 로드 (렌더링은 검색 결과 후)
    loadNaverMap().then(() => setMapReady(true)).catch(() => {});
  }, [isOpen]);

  // 검색 결과가 생기면 지도 초기화
  const initMap = useCallback(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;
    if (!window.naver?.maps) return;

    try {
      mapRef.current = new (window.naver.maps.Map as unknown as new (
        element: HTMLElement,
        options: Record<string, unknown>
      ) => unknown)(mapContainerRef.current, {
        center: new (window.naver.maps.LatLng as unknown as new (
          lat: number,
          lng: number
        ) => unknown)(37.5665, 126.978),
        zoom: 13,
        scaleControl: false,
        logoControl: false,
        mapTypeControl: false,
        logoControlOptions: { position: window.naver.maps.Position?.BOTTOM_RIGHT },
      });
      setMapVisible(true);
    } catch (error) {
      logger.error("Map initialization error:", error);
    }
  }, [mapReady]);

  useEffect(() => {
    if (searchResults.length > 0) {
      // DOM에 mapContainer가 마운트된 후 초기화
      requestAnimationFrame(initMap);
    }
  }, [searchResults, initMap]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("검색어를 입력해주세요.");
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchAddresses(searchQuery);
      if (results.length === 0) {
        toast.error("검색 결과가 없습니다.");
        setSearchResults([]);
      } else {
        setSearchResults(results);
      }
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logError(error, 'AddressSearchModal.handleSearch');
      toast.error(msg || "주소 검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectAddress = async (result: any) => {
    try {
      setIsGeocoding(true);

      const lat = result.y;
      const lng = result.x;

      if (mapRef.current && window.naver?.maps) {
        mapRef.current.setCenter(new window.naver.maps.LatLng(lat, lng));
        mapRef.current.setZoom(15);

        if (markerRef.current) {
          markerRef.current.setMap(null);
        }

        markerRef.current = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(lat, lng),
          map: mapRef.current,
          title: result.address,
        });
      }

      onSelectAddress({
        address: result.roadAddress || result.address || "",
        addressDetail: "",
        postalCode: result.zipcode || "",
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
      });

      toast.success("주소가 선택되었습니다.");
      onClose();
    } catch (error: unknown) {
      logError(error, 'AddressSearchModal.handleSelectAddress');
      toast.error("주소 선택 중 오류가 발생했습니다.");
    } finally {
      setIsGeocoding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end">
      <div className="w-full bg-[#0A0A0A] rounded-t-3xl border border-neutral-800/50 max-h-[90vh] min-h-[70vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800/50 flex items-center justify-between sticky top-0 bg-[#0A0A0A] z-20">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-500" />
            <h2 className="font-black text-white">주소 검색</h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-4 border-b border-neutral-800/50 bg-[#0A0A0A] sticky top-[60px] z-10">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="주소, 건물명, 장소명 검색"
              autoFocus
              className="bg-[#1C1C1E] border-neutral-800 h-11 text-white placeholder-neutral-600 rounded-lg flex-1"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 h-11 rounded-lg bg-green-500 text-black hover:bg-green-400 disabled:bg-neutral-700 font-bold transition-all flex items-center gap-1"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              검색
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isGeocoding ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
              <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
              <p className="text-neutral-400 text-sm">주소를 저장하는 중...</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="flex flex-col">
              {/* Map — 검색 결과 있을 때만 렌더링 */}
              <div
                ref={mapContainerRef}
                className="w-full bg-neutral-900 transition-[height] duration-300"
                style={{ height: mapVisible ? "200px" : "0px", overflow: "hidden" }}
              />

              {/* Results List */}
              <div className="flex-1 overflow-y-auto max-h-[300px] border-t border-neutral-800/50">
                {searchResults.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectAddress(result)}
                    className="w-full px-4 py-3 border-b border-neutral-800/50 text-left hover:bg-neutral-900/50 transition-colors flex items-start gap-3 border-l-2 border-l-transparent hover:border-l-green-500"
                  >
                    <MapPin className="w-4 h-4 text-neutral-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-bold break-words">{result.address}</p>
                      {result.roadAddress && result.roadAddress !== result.address && (
                        <p className="text-neutral-500 text-xs mt-1">{result.roadAddress}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 검색 전 안내 — 지도 없이 깔끔하게 */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 px-6">
              <div className="w-12 h-12 bg-neutral-800 rounded-2xl flex items-center justify-center">
                <Search className="w-6 h-6 text-neutral-500" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-neutral-400 text-sm font-bold">주소 또는 장소명을 검색해주세요</p>
                <p className="text-neutral-600 text-xs">예: 강남역, 서울시 강남구 테헤란로, 옥타곤</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 서버사이드 API를 통해 주소 검색 (Kakao Local API)
 */
async function searchAddresses(query: string): Promise<any[]> {
  const response = await fetch("/api/naver/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error("주소 검색에 실패했습니다.");
  }

  const data = await response.json();

  return data.map((item: any) => ({
    address: item.address,
    roadAddress: item.roadAddress,
    zipcode: item.zipcode,
    x: item.x,
    y: item.y,
  }));
}
