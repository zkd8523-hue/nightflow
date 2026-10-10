"use client";

import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics/events";
import { Check, Loader2 } from "lucide-react";

/**
 * localStorage 의 anon_id 를 읽는다. userEvents.ts 가 쓰는 것과 같은 키라
 * 구독자를 user_events 의 세션과 이어 붙여 "세션 → 구독" 전환율을 볼 수 있다.
 * 그쪽이 내부 함수라 export 가 없어 키를 직접 읽는다.
 */
function readAnonId(): string | null {
  try {
    return localStorage.getItem("nf_anon_id");
  } catch {
    return null;   // 사생활 보호 모드 등에서 막힐 수 있다. 구독 자체는 계속돼야 한다.
  }
}

/**
 * 뉴스레터 구독 폼 — 발행 전 수요 검증용.
 *
 * 지금은 **수집만 한다.** 아직 한 호도 보내지 않았다.
 * 판정(Migration 689): 4주 안에 200명이면 발행 시작, 50명 미만이면 접는다.
 *
 * 동의를 둘로 나눠 받는다. 근거 법이 다르기 때문이다 —
 * 개인정보 수집·이용은 개인정보보호법, 광고성 정보 수신은 정보통신망법 제50조다.
 * 하나로 묶으면 포괄동의가 되어 둘 다 무효가 될 수 있다.
 *
 * 둘 다 필수인 이유: 이 서비스가 제공하는 것 자체가 "메일로 보내주는 것"이라
 * 수신 동의 없이는 줄 게 없다. 부가 혜택에 끼워파는 마케팅 동의와는 다르다.
 *
 * 전환율을 보려면 노출도 세야 한다 — 폼이 그려지는 순간이 아니라 사람이
 * 입력을 시작한 시점(focus)을 센다. 스크롤만 지나간 노출까지 분모에 넣으면
 * 전환율이 의미 없이 낮게 나온다.
 */
export function NewsletterSignup({
  source = "home",
  headline = "아티클 구독",
  subline = "주말 제일 핫한 곳, 매주 깔끔하게 정리해드릴게요",
  showArticleLink = false,
}: {
  source?: string;
  /**
   * 맥락별 헤드라인. 클럽 상세에서는 "핫플 정보", 아티스트에서는 "DJ들"처럼
   * 그 화면에서 보고 있던 것을 그대로 받아야 광고가 아니라 이어지는 말이 된다.
   * 줄바꿈은 \n 으로 넣는다 — whitespace-pre-line 이라 그 자리에서 끊긴다
   * (자동 줄바꿈에 맡기면 마지막 한 단어만 떨어져 나간다).
   */
  headline?: string;
  subline?: string;
  /**
   * "아티클 보러가기" 링크. 폼만 있으면 뭘 받는지 모르는 채로 이메일을 내야 한다.
   * /weekly 본문 하단에서는 이미 한 호를 읽은 뒤라 끈다.
   */
  showArticleLink?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [agreedMarketing, setAgreedMarketing] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  const onFocus = () => {
    if (focused) return;
    setFocused(true);
    trackEvent("newsletter_form_focus", { source });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;

    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError("이메일 주소를 다시 확인해 주세요.");
      return;
    }
    if (!agreedPrivacy) {
      setError("개인정보 수집·이용 동의가 필요합니다.");
      return;
    }
    if (!agreedMarketing) {
      setError("광고성 정보 수신 동의가 필요합니다.");
      return;
    }

    setState("sending");
    setError("");

    // 예전엔 여기서 Supabase 에 직접 INSERT 했다. 신청 확인 메일을 보내려면
    // 서버가 필요해서(RESEND_API_KEY 는 서버 전용) 저장까지 통째로 API 로 옮겼다.
    // 화면·동의 구조는 그대로고, 보내는 값만 같은 모양으로 넘긴다.
    let duplicate = false;
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: value,
          source,
          anon_id: readAnonId(),
          agreed_marketing: agreedMarketing,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; duplicate?: boolean };

      // 이미 구독한 주소는 실패가 아니다. 같은 화면을 보여준다.
      if (!res.ok || !json.ok) {
        setState("error");
        setError("잠시 후 다시 시도해 주세요.");
        return;
      }
      duplicate = Boolean(json.duplicate);
    } catch {
      setState("error");
      setError("잠시 후 다시 시도해 주세요.");
      return;
    }

    // 구독한 사람에게는 홈 팝업을 더 띄우지 않는다 — 메일로 받을 사람에게
    // 매주 같은 안내가 뜨면 성가시다. WeeklyPromoSheet 가 이 키를 읽는다.
    try {
      localStorage.setItem("nightflow_weekly_subscribed", "1");
    } catch {
      // 프라이빗 모드 등 — 표시를 못 남겨도 구독 자체는 끝났으니 넘어간다
    }

    trackEvent("newsletter_subscribe", {
      source,
      duplicate,
      marketing: agreedMarketing,
    });
    setState("done");
  };

  if (state === "done") {
    return (
      <section className="rounded-2xl bg-[#DFFF00] text-[#0A0A0A] px-5 py-6">
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 mt-0.5 flex-shrink-0" strokeWidth={3} />
          <div className="space-y-1.5">
            <p className="text-[15px] font-black tracking-tight">신청됐습니다</p>
            <p className="text-[13px] leading-relaxed text-[#2E3300] font-semibold">
              매주 목요일 저녁에 한 통씩 보내드려요.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-[#DFFF00] text-[#0A0A0A] px-[15px] py-[18px] space-y-3">
      <div className="space-y-1.5">
        <h2 className="text-[19px] font-black tracking-tight leading-[1.3] whitespace-pre-line">
          {headline}
        </h2>
        <p className="text-[13px] leading-[1.55] text-[#2E3300] font-semibold">
          {subline}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-2.5">
        <label htmlFor="nl-email" className="sr-only">이메일 주소</label>
        {/* 라임 배경 위에서는 반투명 글자가 그대로 묻힌다. 입력칸은 흰 바탕 + 진한 테두리. */}
        <input
          id="nl-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }}
          onFocus={onFocus}
          placeholder="name@example.com"
          className="w-full rounded-[9px] bg-white border-[1.5px] border-[#1A1C00] px-3 py-3
                     text-[13.5px] text-[#0A0A0A] placeholder:text-[#6E7357] outline-none
                     focus:ring-2 focus:ring-[#1A1C00]/30 transition-shadow"
        />

        <div className="space-y-[7px]">
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreedPrivacy}
              onChange={(e) => { setAgreedPrivacy(e.target.checked); setError(""); }}
              className="mt-[2px] w-[14px] h-[14px] flex-shrink-0 accent-[#0A0A0A] cursor-pointer"
            />
            <span className="text-[11.5px] leading-[1.45] text-[#2E3300] font-semibold">
              <strong className="font-extrabold text-[#0A0A0A]">[필수]</strong>{" "}
              개인정보 수집·이용에 동의합니다{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                className="text-[#4A5000] underline underline-offset-2 whitespace-nowrap"
              >
                보기
              </a>
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreedMarketing}
              onChange={(e) => { setAgreedMarketing(e.target.checked); setError(""); }}
              className="mt-[2px] w-[14px] h-[14px] flex-shrink-0 accent-[#0A0A0A] cursor-pointer"
            />
            <span className="text-[11.5px] leading-[1.45] text-[#2E3300] font-semibold">
              <strong className="font-extrabold text-[#0A0A0A]">[필수]</strong>{" "}
              광고성 정보 수신에 동의합니다{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                className="text-[#4A5000] underline underline-offset-2 whitespace-nowrap"
              >
                보기
              </a>
            </span>
          </label>
        </div>

        {error && (
          <p className="text-[12px] font-bold text-[#8B1A00]">{error}</p>
        )}

        <button
          type="submit"
          disabled={state === "sending"}
          className="w-full rounded-[9px] bg-[#0A0A0A] text-[#DFFF00] py-3 text-[13.5px] font-black
                     tracking-tight disabled:opacity-50 active:scale-[0.99] transition-transform
                     inline-flex items-center justify-center gap-2"
        >
          {state === "sending" && <Loader2 className="w-4 h-4 animate-spin" />}
          구독 신청
        </button>
      </form>

      {/* 수신거부 안내는 여기 두지 않는다 — 정보통신망법 제50조가 요구하는 자리는
          실제로 발송되는 광고성 메일이고, 그쪽은 unsubscribe_token(Migration 690)과
          /newsletter/unsubscribe 로 이미 갖춰져 있다. 폼에서는 그 자리를
          "뭘 받는지 먼저 본다"는 길에 쓰는 쪽이 낫다. */}
      {showArticleLink && (
        <Link
          href="/weekly"
          className="block text-center text-[12.5px] font-extrabold text-[#1A1C00] underline underline-offset-[3px]"
        >
          아티클 보러가기 →
        </Link>
      )}
    </section>
  );
}
