// MD 정산 내역 링크(2026-11-01) — 정산 문자에서 누르면 로그인 없이 그 MD의 정산만 보이는 읽기 전용 주소.
// 예약 확인서(/booking/md/{토큰})처럼 문자 → 로그인 화면에서 막히지 않게 한다.
//
// DB 토큰 대신 서명: "{md_id}.{HMAC}". 열쇠는 서버에만 있는 키(SETTLEMENT_LINK_SECRET, 없으면 service role key).
// 열쇠를 바꾸면 이미 보낸 링크가 전부 죽는다. 서버 전용 — node crypto라 클라이언트 번들(settlements.ts를
// 쓰는 SettlementsClient)에 섞이지 않게 settlements.ts와 파일을 나눴다.

import { createHmac, timingSafeEqual } from "crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  // Vercel env 값 끝에 줄바꿈이 붙어 있다(settlement-reminders 2026-10-10) — trim 필수.
  const s = (process.env.SETTLEMENT_LINK_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!s) throw new Error("settle link secret missing");
  return s;
}

function sign(mdId: string): string {
  return createHmac("sha256", secret()).update(`settle:${mdId}`).digest("base64url").slice(0, 22);
}

export function settleToken(mdId: string): string {
  return `${mdId}.${sign(mdId)}`;
}

/** 맞는 토큰이면 md_id, 아니면 null. */
export function verifySettleToken(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const mdId = token.slice(0, i);
  if (!UUID_RE.test(mdId)) return null;
  const got = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(sign(mdId));
  return got.length === want.length && timingSafeEqual(got, want) ? mdId : null;
}

export function settleLinkOf(mdId: string, month?: string): string {
  return `https://nightflow.kr/booking/settle/${settleToken(mdId)}${month ? `?month=${month}` : ""}`;
}

/** 문자 본문의 "입금:" 줄 바로 아래에 내역 링크를 끼운다. 이미 있으면 그대로. 감사 멘트는 맨 끝에 남긴다. */
export function withSettleLink(message: string, link: string): string {
  if (message.includes("/booking/settle/")) return message;
  const lines = message.split("\n");
  const at = lines.findIndex((l) => l.startsWith("입금"));
  if (at >= 0) lines.splice(at + 1, 0, `내역 보기: ${link}`);
  else lines.push(`내역 보기: ${link}`);
  return lines.join("\n");
}
