"use client";

import { useEffect, useState } from "react";

export function NetworkOverlay() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0A0A0A",
      zIndex: 99999, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px", textAlign: "center", color: "#fff",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>📡</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        인터넷 연결을 확인해주세요
      </h1>
      <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6, marginBottom: 32 }}>
        NightFlow를 사용하려면<br />인터넷 연결이 필요합니다.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "#fff", color: "#000", border: "none",
          borderRadius: 999, padding: "14px 32px",
          fontSize: 16, fontWeight: 700, cursor: "pointer",
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
