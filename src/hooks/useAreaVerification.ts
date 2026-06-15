"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import {
  AREA_AUTO_REFRESH_BEFORE_MS,
  AREA_VERIFICATION_TTL_MS,
  detectArea,
  ROOM_LABEL,
  type VerifiableArea,
} from "@/lib/chat/areas";

/** 테스트(비프로덕션) 환경에선 GPS 우회 — 어디서든 인증 통과. */
const SKIP_GPS_IN_DEV =
  process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

interface VerificationState {
  area: VerifiableArea;
  expiresAt: string;
}

/**
 * 현재 GPS 좌표 가져오기 (Capacitor 우선, 웹 fallback)
 */
async function getCurrentCoords(): Promise<{ latitude: number; longitude: number }> {
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
      if (!granted) throw new Error("위치 권한이 없습니다");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    }
  } catch (e) {
    console.warn("[useAreaVerification] capacitor fallback to web", e);
  }

  if (!("geolocation" in navigator)) {
    throw new Error("위치 기능을 지원하지 않는 환경입니다");
  }
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

export function useAreaVerification() {
  const { user } = useCurrentUser();
  const [activeAreas, setActiveAreas] = useState<VerificationState[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshingRef = useRef(false);

  const fetchVerifications = useCallback(async () => {
    if (!user) {
      setActiveAreas([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("area_verifications")
      .select("area, expires_at")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString());
    if (error) {
      console.error("[useAreaVerification] fetch error", error);
      setActiveAreas([]);
    } else {
      setActiveAreas(
        (data ?? []).map((d) => ({
          area: d.area as VerifiableArea,
          expiresAt: d.expires_at,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  const isVerified = useCallback(
    (area: VerifiableArea) =>
      activeAreas.some(
        (v) => v.area === area && new Date(v.expiresAt) > new Date()
      ),
    [activeAreas]
  );

  /**
   * 현재 위치 가져와서 area_verifications 저장.
   * 강남/홍대/이태원 안이면 해당 지역으로 저장, 그 외 지역이면 null 반환.
   *
   * 비프로덕션(SKIP_GPS_IN_DEV) 환경에선 GPS 호출 없이 강남으로 즉시 인증.
   *
   * @returns 감지된 지역 (null = 지원 지역 밖)
   */
  const verifyByCurrentLocation = useCallback(
    async (overrideArea?: VerifiableArea): Promise<VerifiableArea | null> => {
      if (!user) throw new Error("로그인이 필요합니다");
      const supabase = createClient();

      let detected: VerifiableArea | null;

      if (SKIP_GPS_IN_DEV) {
        // 테스트 환경: GPS 우회. 인자로 받으면 그 지역, 없으면 강남 기본.
        detected = overrideArea ?? "gangnam";
      } else {
        const coords = await getCurrentCoords();
        // DB RPC로 위임: 정적 영역 + 클럽 좌표 ±300m 확장 (신규 클럽 자동 반영)
        const { data: rpcArea, error: rpcErr } = await supabase.rpc(
          "detect_chat_area",
          {
            p_lat: coords.latitude,
            p_lng: coords.longitude,
          }
        );
        if (rpcErr) {
          console.warn(
            "[useAreaVerification] RPC failed, falling back to client detectArea",
            rpcErr
          );
          detected = detectArea(coords.latitude, coords.longitude);
        } else {
          detected = (rpcArea as VerifiableArea | null) ?? null;
        }
        if (!detected) {
          return null;
        }
      }

      const expiresAt = new Date(
        Date.now() + AREA_VERIFICATION_TTL_MS
      ).toISOString();

      // 새 인증 시 기존 다른 지역 인증은 모두 삭제 (한 번에 한 지역만 보장)
      const { error: delErr } = await supabase
        .from("area_verifications")
        .delete()
        .eq("user_id", user.id)
        .neq("area", detected);
      if (delErr) {
        console.warn("[useAreaVerification] cleanup error", delErr);
      }

      const { error } = await supabase.from("area_verifications").upsert(
        {
          user_id: user.id,
          area: detected,
          verified_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
        { onConflict: "user_id,area" }
      );
      if (error) {
        console.error("[useAreaVerification] upsert error", error);
        throw error;
      }
      await fetchVerifications();
      return detected;
    },
    [user, fetchVerifications]
  );

  /**
   * 만료 임박한 인증을 자동 갱신 (silent).
   * - 같은 지역이면 갱신
   * - 벗어났으면 해당 area_verifications 행 삭제 + 토스트 1회
   * - 실패해도 토스트는 띄우지 않음 (잠시 후 재시도)
   */
  const tryAutoRefresh = useCallback(async () => {
    if (!user || refreshingRef.current) return;
    const now = Date.now();
    const expiring = activeAreas.filter((v) => {
      const ms = new Date(v.expiresAt).getTime() - now;
      return ms > 0 && ms <= AREA_AUTO_REFRESH_BEFORE_MS;
    });
    if (expiring.length === 0) return;

    refreshingRef.current = true;
    try {
      const supabase = createClient();
      let detected: VerifiableArea | null;
      if (SKIP_GPS_IN_DEV) {
        // 테스트 환경: GPS 호출 없이 현재 활성 인증을 그대로 연장
        // (각 expiring 항목의 area를 그대로 매칭되게 처리)
        detected = expiring[0]?.area ?? null;
      } else {
        const coords = await getCurrentCoords();
        const { data: rpcArea, error: rpcErr } = await supabase.rpc(
          "detect_chat_area",
          {
            p_lat: coords.latitude,
            p_lng: coords.longitude,
          }
        );
        if (rpcErr) {
          console.warn(
            "[useAreaVerification] auto refresh RPC failed, falling back",
            rpcErr
          );
          detected = detectArea(coords.latitude, coords.longitude);
        } else {
          detected = (rpcArea as VerifiableArea | null) ?? null;
        }
      }

      for (const v of expiring) {
        // dev 환경에선 모든 활성 인증을 그대로 연장
        const shouldExtend = SKIP_GPS_IN_DEV ? true : detected === v.area;
        if (shouldExtend) {
          // silent 갱신
          const newExpiry = new Date(
            Date.now() + AREA_VERIFICATION_TTL_MS
          ).toISOString();
          await supabase
            .from("area_verifications")
            .update({
              verified_at: new Date().toISOString(),
              expires_at: newExpiry,
            })
            .eq("user_id", user.id)
            .eq("area", v.area);
        } else {
          // 지역 벗어남 (detected=null 포함) → 무효화
          await supabase
            .from("area_verifications")
            .delete()
            .eq("user_id", user.id)
            .eq("area", v.area);
          toast.message(
            `${ROOM_LABEL[v.area]} 지역을 벗어나 인증이 해제되었어요`,
            { description: "그 지역에 다시 가시면 재인증이 필요해요" }
          );
        }
      }
      await fetchVerifications();
    } catch (e) {
      // GPS 실패 시 silent (배터리/실내 음영 등 정상 케이스)
      console.warn("[useAreaVerification] auto refresh failed", e);
    } finally {
      refreshingRef.current = false;
    }
  }, [user, activeAreas, fetchVerifications]);

  // 1분마다 만료 임박 체크
  useEffect(() => {
    if (!user || activeAreas.length === 0) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }
    refreshTimerRef.current = setInterval(() => {
      tryAutoRefresh();
    }, 60 * 1000);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [user, activeAreas, tryAutoRefresh]);

  // 만료 자연 도래 시 UI 갱신용 (1분마다 재렌더)
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return {
    activeAreas,
    isVerified,
    verifyByCurrentLocation,
    loading,
    refresh: fetchVerifications,
  };
}
