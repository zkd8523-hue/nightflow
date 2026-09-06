"use client";

import { useEffect } from "react";

/**
 * 루트 레이아웃 자체가 죽었을 때의 최후 방어선.
 *
 * error.tsx는 Providers 안쪽에서 터진 에러만 잡는다. 앱 최초 부팅에 필요한 청크가
 * 404면 레이아웃이 마운트되기 전에 무너져서 error.tsx조차 뜨지 않고 흰 화면이 된다.
 * 이 경우가 바로 "앱을 오래 안 쓰다가 켰을 때" — WebView가 들고 있던 옛 빌드의
 * /_next/static/... 이 새 배포로 사라진 상황이다.
 *
 * global-error는 <html>/<body>를 직접 그려야 하고, 여기서 터지면 잡아줄 곳이 더는
 * 없으므로 Providers·디자인 토큰·아이콘 등 외부 의존을 일절 쓰지 않는다.
 * (그것들을 import하는 순간 같은 청크 문제에 다시 걸린다 — 인라인 스타일만 사용)
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const isStaleBuildError =
        /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i.test(
            `${error?.name ?? ""} ${error?.message ?? ""}`
        );

    // 낡은 빌드면 유저를 기다리게 하지 않고 곧장 새 빌드로 갈아탄다.
    // reset()은 여전히 없는 청크를 다시 요청하므로 소용없다 — 하드 리로드만이 복구 수단.
    // 무한 리로드 방지로 세션당 1회만. (error.tsx와 같은 키를 공유해
    //  두 경계가 번갈아 리로드를 반복하는 상황도 함께 막는다)
    useEffect(() => {
        if (!isStaleBuildError) return;
        const KEY = "nf_stale_build_reloaded";
        try {
            if (sessionStorage.getItem(KEY)) return;
            sessionStorage.setItem(KEY, "1");
        } catch {
            return;
        }
        window.location.reload();
    }, [isStaleBuildError]);

    return (
        <html lang="ko">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#0A0A0A",
                    color: "#fff",
                    fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
                    padding: "0 24px",
                    textAlign: "center",
                }}
            >
                <div style={{ maxWidth: 420, width: "100%" }}>
                    <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 12px" }}>
                        앱을 새로 불러올게요
                    </h1>
                    <p style={{ color: "#A1A1AA", fontSize: 15, lineHeight: 1.6, margin: "0 0 28px" }}>
                        업데이트된 버전이 있어 화면을 다시 불러와야 해요.
                    </p>

                    <button
                        onClick={() => {
                            // 낡은 빌드는 reset()으로 절대 복구되지 않으므로 하드 리로드.
                            if (isStaleBuildError) {
                                window.location.reload();
                                return;
                            }
                            reset();
                        }}
                        style={{
                            width: "100%",
                            height: 56,
                            border: "none",
                            borderRadius: 16,
                            background: "#fff",
                            color: "#000",
                            fontSize: 16,
                            fontWeight: 900,
                            cursor: "pointer",
                        }}
                    >
                        새로고침
                    </button>

                    <button
                        onClick={() => {
                            window.location.href = "/";
                        }}
                        style={{
                            width: "100%",
                            height: 52,
                            marginTop: 10,
                            borderRadius: 16,
                            background: "transparent",
                            border: "1px solid #27272A",
                            color: "#A1A1AA",
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                    >
                        홈으로 이동
                    </button>

                    {error?.digest && (
                        <p style={{ marginTop: 20, fontSize: 10, color: "#52525B", fontFamily: "monospace" }}>
                            Error ID: {error.digest}
                        </p>
                    )}
                </div>
            </body>
        </html>
    );
}
