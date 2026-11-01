// MD 정산 내역 링크(2026-11-01) — 정산 문자·푸시에 붙는 주소.
//
// /booking/* 는 앱 링크로 등록돼 있다(AndroidManifest App Links + apple-app-site-association) — 앱이 깔려 있으면
// 문자에서 눌렀을 때 앱이 열리고, 앱은 그 경로로 웹뷰를 보낸다(deepLink.ts openWebLink).
// /booking/settle은 로그인이 필요한 /md/settlements로 넘길 뿐이다 — 로그인 없이 열리는 화면은 두지 않는다
// (운영자 결정 2026-11-01: 문자가 전달돼도 매출·손님 이름이 보이면 안 된다).

export function settleLinkOf(month?: string): string {
  return `https://nightflow.kr/booking/settle${month ? `?month=${month}` : ""}`;
}

/** 문자 본문의 "입금:" 줄 바로 아래에 내역 링크를 끼운다. 이미 있으면 그대로. 감사 멘트는 맨 끝에 남긴다. */
export function withSettleLink(message: string, link: string): string {
  if (message.includes("/booking/settle")) return message;
  const lines = message.split("\n");
  const at = lines.findIndex((l) => l.startsWith("입금"));
  if (at >= 0) lines.splice(at + 1, 0, `내역 보기: ${link}`);
  else lines.push(`내역 보기: ${link}`);
  return lines.join("\n");
}
