"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { initPushNotifications } from "@/lib/native/pushNotifications";

interface Props {
  userId: string;
}

export function PushPermissionPrompt({ userId }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // requestIfNeeded=false — 권한을 아직 안 물어본(prompt) 유저에게 설명 없이
    // OS 팝업을 띄우지 않는다. 그 역할은 LoginNotifyPromptSheet가 대신한다.
    // 여기서는 "이미 허용된" 유저의 토큰만 조용히 갱신한다.
    const tryRegister = async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      await initPushNotifications(userId, false);
    };

    // 앱 마운트 시 1회 (userId가 바뀔 때 = 계정 전환 포함).
    const timer = setTimeout(tryRegister, 3000);

    // + 로그인 이벤트를 직접 구독해 한 번 더 시도한다(2026-09-30). userId prop이
    // 이미 로그인된 상태로 이 컴포넌트가 처음 마운트되는 경우(앱 재실행 등)와
    // 달리, "로그인 직후"는 반드시 확실하게 걸려야 하는 지점이라 이 컴포넌트의
    // 마운트/언마운트 타이밍에만 기대지 않고 SIGNED_IN 이벤트로 명시적으로 건다 —
    // register()가 OS/네트워크 타이밍으로 조용히 실패해도 다음 로그인 때 다시 걸린다.
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") tryRegister();
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [userId]);

  return null;
}
