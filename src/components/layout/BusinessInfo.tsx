import { BUSINESS_INFO } from "@/lib/business-info";

/**
 * 사업자 정보 노출 블록 (PG/카드사 심사 요건).
 * 푸터와 결제페이지에서 공유. 통신판매업번호는 발급된 경우에만 표시.
 */
export function BusinessInfo({ className = "" }: { className?: string }) {
  const {
    companyName,
    ceo,
    businessNumber,
    mailOrderSalesNumber,
    address,
    tel,
    email,
  } = BUSINESS_INFO;

  return (
    <div
      className={`text-center text-xs text-neutral-600 leading-relaxed space-y-1 ${className}`}
    >
      <p>
        상호: {companyName} · 대표: {ceo} · 사업자등록번호: {businessNumber}
      </p>
      {mailOrderSalesNumber && (
        <p>통신판매업신고번호: {mailOrderSalesNumber}</p>
      )}
      <p>
        주소: {address} · 전화: {tel} · 이메일: {email}
      </p>
      <p className="text-neutral-700 mt-2">
        매드다윗은 통신판매중개자로서, 클럽 테이블 예약에 관한 의무와 책임은
        MD(판매자)에게 있습니다.
      </p>
    </div>
  );
}
