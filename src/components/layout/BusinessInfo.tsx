"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BUSINESS_INFO } from "@/lib/business-info";
import { type Lang, makeT } from "@/lib/i18n";

/**
 * 사업자 정보 노출 블록 (PG/카드사 심사 요건 + 전자상거래법 표시 의무).
 * 라벨(상호/대표 등)만 lang에 따라 번역, 값(등록번호·주소 등)은 법적 데이터라 그대로.
 *
 * collapsible: 푸터처럼 항상 붙어다니는 자리에서 세로 길이를 줄이기 위한 접기 옵션.
 *   기본값 false — 결제/크레딧 충전 페이지는 PG 심사가 상시 노출을 보므로 펼친 채 유지할 것.
 *   접어도 DOM에는 항상 렌더되므로(hidden 토글) 크롤러·심사 스크래핑에는 그대로 잡힌다.
 */
export function BusinessInfo({
  className = "",
  lang = "ko",
  collapsible = false,
}: {
  className?: string;
  lang?: Lang;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);
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

  const details = (
    <div
      id="business-info-details"
      hidden={collapsible && !open}
      className="text-center text-xs text-muted-foreground leading-relaxed space-y-1"
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
    </div>
  );

  const disclaimer = (
    <p className="text-center text-xs text-muted-foreground leading-relaxed">
      {t(
        "매드다윗은 통신판매중개자로서, 클럽 테이블 예약에 관한 의무와 책임은 파트너(판매자)에게 있습니다.",
        "MadDawid is an online sales intermediary; obligations and liability for club table bookings rest with the MD (seller).",
        "MadDawidは通信販売仲介者であり、クラブテーブル予約に関する義務と責任はMD（販売者）にあります。",
        "MadDawid为电子商务中介，俱乐部桌位预订的义务与责任由MD（卖家）承担。",
      )}
    </p>
  );

  // 접기 모드: 중개자 고지는 면책 효력상 항상 노출, 등록번호·주소만 토글 안으로.
  if (collapsible) {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        {disclaimer}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="business-info-details"
          className="inline-flex items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("사업자정보", "Business info", "事業者情報", "企业信息")}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {details}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {details}
      {disclaimer}
    </div>
  );
}
