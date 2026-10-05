// 비로그인 예약조회 — 접수번호(NF-XXXXXX) + 이메일로 내 요청 상태를 되찾는다.
//
// 외국인 트랙은 로그인을 요구하지 않는다(Model B · 관광객 마찰 최소화). 그래서
// 손님이 받는 유일한 링크는 접수확인 메일과 예약 패스(/booking/{token})뿐이고,
// 그걸 잃어버리면 되찾을 방법이 없었다. 이 페이지가 그 입구다.
//
// 조회는 lookup_foreign_request RPC(Migration 691)가 한다 — 접수번호와 이메일이
// 둘 다 맞을 때만 1행을 돌려준다. 여기서 service role을 쓰지 않는 이유: 입력값
// 검증과 레이트리밋을 DB 한 곳에 모아두면 클라이언트에서 직접 호출해도 안전하다.
//
// 접수확인 메일의 "예약조회" 버튼이 ?ref=&email= 를 채워 보내므로, 손님은 보통
// 아무것도 입력하지 않고 결과만 본다.

import { getLang } from "@/lib/i18n";
import { BookingLookup } from "@/components/booking/BookingLookup";

export const dynamic = "force-dynamic";

// 검색엔진에 올릴 페이지가 아니다 — 손님이 메일·접수완료 화면에서만 들어온다.
// (/booking/{token} 패스 페이지와 같은 원칙.)
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function BookingLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; email?: string; lang?: string }>;
}) {
  const sp = await searchParams;
  // 메일에서 온 손님은 ?lang=en 등이 붙어 있다. 없으면 한국어.
  const lang = getLang(sp.lang);

  return (
    <BookingLookup
      lang={lang}
      initialRef={sp.ref ?? ""}
      initialEmail={sp.email ?? ""}
    />
  );
}
