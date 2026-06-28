import { BUSINESS_INFO } from "@/lib/business-info";
import { type Lang, makeT } from "@/lib/i18n";

/**
 * 사업자 정보 노출 블록 (PG/카드사 심사 요건 + 전자상거래법 표시 의무).
 * 라벨(상호/대표 등)만 lang에 따라 번역, 값(등록번호·주소 등)은 법적 데이터라 그대로.
 */
export function BusinessInfo({ className = "", lang = "ko" }: { className?: string; lang?: Lang }) {
  const {
    companyName,
    ceo,
    businessNumber,
    mailOrderSalesNumber,
    address,
    tel,
    email,
  } = BUSINESS_INFO;
  const t = makeT(lang);

  return (
    <div
      className={`text-center text-xs text-neutral-600 leading-relaxed space-y-1 ${className}`}
    >
      <p>
        {t("상호", "Company", "商号", "公司名称")}: {companyName} · {t("대표", "CEO", "代表者", "法人代表")}: {ceo} · {t("사업자등록번호", "Business reg. no.", "事業者登録番号", "营业执照号")}: {businessNumber}
      </p>
      {mailOrderSalesNumber && (
        <p>{t("통신판매업신고번호", "E-commerce reg. no.", "通信販売業申告番号", "电子商务备案号")}: {mailOrderSalesNumber}</p>
      )}
      <p>
        {t("주소", "Address", "住所", "地址")}: {address} · {t("전화", "Tel", "電話", "电话")}: {tel} · {t("이메일", "Email", "メール", "邮箱")}: {email}
      </p>
      <p className="text-neutral-700 mt-2">
        {t(
          "매드다윗은 통신판매중개자로서, 클럽 테이블 예약에 관한 의무와 책임은 MD(판매자)에게 있습니다.",
          "MadDawid is an online sales intermediary; obligations and liability for club table bookings rest with the MD (seller).",
          "MadDawidは通信販売仲介者であり、クラブテーブル予約に関する義務と責任はMD（販売者）にあります。",
          "MadDawid为电子商务中介，俱乐部桌位预订的义务与责任由MD（卖家）承担。",
        )}
      </p>
    </div>
  );
}
