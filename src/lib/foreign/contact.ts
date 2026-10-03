// 외국인 "문의하기" 채널 값(2026-10-02, 운영자 지정). 서버 컴포넌트(AdLanding)와 클라이언트
// 컴포넌트(ContactButtons·예약 폼)가 같이 읽는다 — "use client" 파일에 두면 서버에서 import할 때
// 값 대신 클라이언트 참조(함수)가 와서 링크가 "wa.me/function()…"으로 깨진다(2026-10-04 실제 발생).
//
// WhatsApp은 env(NEXT_PUBLIC_WHATSAPP_NUMBER)가 아니라 이 상수를 쓴다 — env를 채우면 접수 완료 화면
// "이어가기"와 홈 가격 카드까지 WhatsApp으로 바뀌므로 그건 따로 결정한다.
export const CONTACT_INSTAGRAM = "nightflow.kr";
export const CONTACT_EMAIL = "maddawids@gmail.com";
export const CONTACT_WHATSAPP = "821022051052";
