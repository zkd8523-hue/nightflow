/**
 * 현재 GPS 좌표 (Capacitor 네이티브 우선, 웹 fallback)
 *   - 네이티브: @capacitor/geolocation — 런타임 권한 요청 팝업 자동
 *   - 웹: navigator.geolocation — 브라우저 권한 팝업
 *
 * useAreaVerification, ClubMap, ClubList, ShotCaptureSheet 등에서 공용 사용.
 */
export async function getCurrentCoords(): Promise<{
  latitude: number;
  longitude: number;
}> {
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
        // coarse(Wi-Fi/셀) 위치 — 실내·도심에서 GPS 위성 fix보다 훨씬 빠르고 안정적.
        // 클럽 근접 정렬엔 이 정도 정확도면 충분. (highAccuracy는 실내 타임아웃 잦음)
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
    }
  } catch (e) {
    console.warn("[getCurrentCoords] capacitor fallback to web", e);
  }

  if (!("geolocation" in navigator)) {
    throw new Error("위치 기능을 지원하지 않는 환경입니다");
  }
  return new Promise<{ latitude: number; longitude: number }>(
    (resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        (err) => reject(err),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    }
  );
}
