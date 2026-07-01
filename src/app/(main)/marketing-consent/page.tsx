/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";

export const metadata: Metadata = {
  title: "마케팅 정보 수신 동의",
  description: "나플 마케팅 정보 수신 동의 안내. 수신 채널, 발송 내용, 철회 방법을 안내합니다.",
  alternates: { canonical: "https://nightflow.kr/marketing-consent" },
};

export default function MarketingConsentPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
      <div className="max-w-3xl w-full space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <BackButton />
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-amber-500" />
            마케팅 정보 수신 동의
          </h1>
        </div>

        <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-8 text-neutral-300 text-[15px] leading-relaxed font-medium">
          <section className="space-y-3">
            <p className="text-neutral-400">
              NightFlow(이하 "회사")는 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 제50조에 따라
              회원의 마케팅 정보 수신 동의를 받아 아래와 같이 활용합니다. 본 동의는 선택사항이며,
              동의하지 않아도 서비스 이용에 제한이 없습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">1. 수신 채널</h2>
            <ul className="list-disc list-inside space-y-1 text-neutral-300">
              <li>카카오 알림톡 / 카카오톡 친구톡</li>
              <li>문자 메시지 (SMS / LMS / MMS)</li>
              <li>앱 푸시 알림</li>
              <li>이메일</li>
            </ul>
            <p className="text-[13px] text-neutral-500">
              발송은 알림톡을 우선으로 하며, 발송 실패 또는 미수신 시 SMS 등 다른 채널로 대체 발송될 수 있습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">2. 발송 내용</h2>
            <ul className="list-disc list-inside space-y-1 text-neutral-300">
              <li>신규 경매·깃발·조각 등 서비스 내 거래 기회 안내</li>
              <li>관심 지역·요일의 신규 등록 알림</li>
              <li>이벤트, 프로모션, 혜택 안내</li>
              <li>제휴 클럽 및 파트너 소식</li>
              <li>맞춤형 추천 콘텐츠</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">3. 수신 시간</h2>
            <p>
              광고성 정보는 원칙적으로 <strong className="text-white">오전 8시 ~ 오후 9시</strong>에 발송합니다.
            </p>
            <p className="text-[13px] text-neutral-500">
              야간(21시 ~ 익일 08시) 발송이 필요한 경우 별도 동의를 받으며, 별도 동의가 없는 경우 야간 발송하지 않습니다.
              단, 거래·결제·계정 보안 등 서비스 운영을 위한 정보성 알림은 시간과 무관하게 발송됩니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">4. 보유 및 이용 기간</h2>
            <p>
              회원 탈퇴 시 또는 마케팅 수신 동의 철회 시까지 보유·이용합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">5. 동의 철회 방법</h2>
            <p>아래 방법 중 하나로 언제든지 철회할 수 있습니다.</p>
            <ul className="list-disc list-inside space-y-1 text-neutral-300">
              <li>앱 내 <strong className="text-white">설정 → 알림 설정</strong>에서 마케팅 수신 동의 해제</li>
              <li>수신한 문자 메시지 내 무료 수신거부 번호 또는 링크 이용</li>
              <li>이메일: <strong className="text-white">support@nightflow.kr</strong></li>
            </ul>
            <p className="text-[13px] text-neutral-500">
              철회 요청은 접수일로부터 14일 이내에 처리됩니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black text-white">6. 동의 거부 시 불이익</h2>
            <p>
              마케팅 정보 수신 동의는 선택사항으로, 동의하지 않아도 회원가입 및 서비스 이용에 제한이 없습니다.
              다만, 신규 거래 기회·이벤트·혜택 등의 알림은 받지 못할 수 있습니다.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-neutral-800">
            <p className="text-[13px] text-neutral-500">
              본 동의 내용은 관련 법령 및 회사 정책에 따라 변경될 수 있으며, 변경 시 앱 내 공지사항을 통해 안내드립니다.
            </p>
            <p className="text-[13px] text-neutral-500">
              시행일자: 2026년 5월 23일
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
