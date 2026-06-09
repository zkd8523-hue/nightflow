/* eslint-disable react/no-unescaped-entities */
import { Button } from "@/components/ui/button";
import { ArrowLeft, HelpCircle, User, Store, Shield, Phone, AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "나플 FAQ - 자주 묻는 질문 (나이트플로우)",
  description:
    "나플(나이트플로우) 이용 가이드. 나플이 뭔지, 클럽 게스트·무료입장이 뭔지, 입찰 방법, 낙찰 후 MD 연락 절차, 노쇼 정책, 본인인증 등 자주 묻는 질문을 한 곳에서 확인하세요.",
  alternates: { canonical: "https://nightflow.kr/faq" },
};

// FAQPage JSON-LD — Google 리치 결과(검색 결과 내 Q&A 직접 노출) 가능성.
// 본문 Accordion과 동일한 Q&A로 작성해 신뢰성 확보.
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "나플이 뭔가요?",
    a: "나플은 나이트플로우(NightFlow)의 줄임말입니다. 강남·홍대 클럽 MD가 잔여 테이블을 올리면, 회원들이 입찰로 가격을 정해서 예약하는 서비스예요.",
  },
  {
    q: "퍼즐(클럽 조각)이 뭔가요?",
    a: "퍼즐은 나이트플로우의 일행 모집 기능입니다. 흔히 '클럽 조각', '클럽 합석'이라고 부르는 기능으로, 같은 클럽에 갈 일행을 모집하거나 합류할 수 있습니다.",
  },
  {
    q: "클럽 게스트 / 무료입장이 뭔가요?",
    a: "클럽 게스트는 클럽 MD가 운영하는 게스트 명단에 등록되어 무료입장 또는 할인 입장이 가능한 방식입니다. 나플의 게스트 간판은 매주 월요일 오후 6시에 갱신되며, 클럽×요일별로 무료입장·여성 무료·프리드링크 등 혜택이 다르게 적용됩니다.",
  },
  {
    q: "게스트 명단은 어떻게 등록하나요?",
    a: "원하는 클럽의 게스트 간판을 운영하는 MD에게 직접 연락하면 게스트 명단에 올려줍니다. 나플 클럽 상세 페이지에서 이번 주 게스트 간판 MD를 확인하고 인스타그램 DM 또는 카카오톡 오픈채팅으로 연락하세요.",
  },
  {
    q: "클럽 부킹이 뭔가요?",
    a: "클럽 부킹은 전통적인 한국 클럽 문화로 MD가 테이블에 합석할 사람을 안내해주는 방식을 말합니다. 나플에서는 부킹 대신 테이블 경매·조각(합석)·게스트 간판 등 더 투명한 방식으로 같은 목적(테이블·일행 매칭)을 해결합니다.",
  },
  {
    q: "여성무료는 어떻게 받나요?",
    a: "여성무료는 클럽이 특정 요일/시간대에 여성 게스트에게 무료입장을 제공하는 혜택입니다. 나플의 게스트 간판에서 해당 클럽이 여성 무료를 운영하는 요일을 확인하고, 표시된 MD에게 인스타 DM 또는 카카오톡 오픈채팅으로 게스트 명단 등록을 요청하면 됩니다.",
  },
  {
    q: "경매는 어떻게 진행되나요?",
    a: "MD가 클럽 테이블을 등록하면 경매가 시작됩니다. 회원들이 원하는 금액을 입찰하고, 마감 시간에 가장 높은 금액을 제시한 회원이 낙찰받습니다.",
  },
  {
    q: "낙찰 후 어떻게 진행되나요?",
    a: "낙찰자는 정해진 시간 안에 MD에게 직접 연락(인스타그램 DM 또는 전화)해서 예약을 확정합니다. 미연락 시 차순위 입찰자에게 기회가 넘어가고 노쇼 스트라이크가 부여됩니다.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default function FAQPage() {
    return (
        <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            <div className="max-w-3xl w-full space-y-8">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/">
                        <Button variant="ghost" size="icon" className="rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        <HelpCircle className="w-6 h-6 text-blue-500" />
                        자주 묻는 질문 (FAQ)
                    </h1>
                </div>

                {/* 일반 사용자 FAQ */}
                <section className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-500" />
                        </div>
                        <h2 className="text-xl font-black text-white">일반 사용자</h2>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                        <AccordionItem value="item-0" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                나플이 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>
                                    <strong className="text-white">나플</strong>은 <strong className="text-white">나이트플로우(NightFlow)</strong>의 줄임말입니다.
                                </p>
                                <p className="mt-2">
                                    강남·홍대 클럽 MD가 잔여 테이블을 올리면, 회원들이 입찰로 가격을 정해서 예약하는 서비스예요.
                                    "나플에서 잡는다"처럼 편하게 부르시면 됩니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0a" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                퍼즐(클럽 조각)이 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>
                                    <strong className="text-white">퍼즐</strong>은 나이트플로우의 일행 모집 기능입니다.
                                    흔히 <strong className="text-white">"클럽 조각"</strong>,{" "}
                                    <strong className="text-white">"클럽 합석"</strong>이라고 부르는 그 기능이에요.
                                </p>
                                <p className="mt-2">
                                    인원이 부족할 때 같은 클럽에 갈 일행을 모집하거나, 다른 사람이
                                    모집 중인 퍼즐에 합류할 수 있습니다. 강남 클럽 조각, 홍대 클럽
                                    합석을 안전하게 찾는 가장 빠른 방법입니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0b" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                클럽 게스트 / 무료입장이 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>
                                    <strong className="text-white">클럽 게스트</strong>는 클럽 MD가 운영하는 게스트 명단에
                                    등록되어 <strong className="text-white">무료입장</strong> 또는 할인 입장이 가능한
                                    방식입니다.
                                </p>
                                <p className="mt-2">
                                    나플(나이트플로우)의 <strong className="text-white">게스트 간판</strong>은 매주 월요일
                                    오후 6시에 갱신됩니다. 각 클럽 × 요일별로 게스트 입장 혜택
                                    (여성 무료, 프리드링크, 신청곡 등)이 다르게 적용됩니다.
                                </p>
                                <p className="mt-2">
                                    강남 클럽 무료입장, 홍대 클럽 게스트, 이태원 무료입장 정보는
                                    클럽 상세 페이지에서 요일별로 확인할 수 있고, 지역별 게스트
                                    모음(/guest/지역명)에서도 한눈에 볼 수 있어요.
                                </p>
                                <p className="mt-2 text-neutral-500">
                                    홍대 클럽 드레스코드·입장료·무료입장 받는 법 등 더 자세한 가이드는{" "}
                                    <a
                                        href="https://blog.naver.com/dance_dna"
                                        target="_blank"
                                        rel="noopener"
                                        className="text-neutral-400 underline hover:text-white transition-colors"
                                    >
                                        나플 운영자 블로그
                                    </a>
                                    에서 확인할 수 있습니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0c" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                게스트 명단은 어떻게 등록하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>
                                    원하는 클럽의 게스트 간판을 운영하는 MD에게 직접 연락하면
                                    게스트 명단에 올려줍니다.
                                </p>
                                <p className="mt-2">
                                    나플(나이트플로우)에서 클럽 상세 페이지에 들어가면 이번 주
                                    게스트 간판 MD가 표시되며, 인스타그램 DM 또는 카카오톡
                                    오픈채팅으로 직접 연락해 무료입장·게스트 입장 정보를 받을 수
                                    있습니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0d" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                클럽 부킹이 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>
                                    <strong className="text-white">클럽 부킹</strong>은 전통적인 한국 클럽 문화로
                                    MD가 테이블에 합석할 사람을 안내해주는 방식을 말합니다.
                                </p>
                                <p className="mt-2">
                                    나플(나이트플로우)에서는 부킹 대신 <strong className="text-white">테이블 경매</strong>,{" "}
                                    <strong className="text-white">조각(합석)</strong>,{" "}
                                    <strong className="text-white">게스트 간판</strong> 등 더 투명한 방식으로
                                    같은 목적(테이블·일행 매칭)을 해결합니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0e" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                여성무료는 어떻게 받나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>
                                    <strong className="text-white">여성무료</strong>는 클럽이 특정 요일·시간대에
                                    여성 게스트에게 무료입장을 제공하는 혜택입니다.
                                </p>
                                <p className="mt-2">
                                    나플의 <strong className="text-white">게스트 간판</strong>에서 해당 클럽이
                                    여성 무료를 운영하는 요일을 확인하고, 표시된 MD에게 인스타 DM
                                    또는 카카오톡 오픈채팅으로 게스트 명단 등록을 요청하면 됩니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-1" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                경매는 어떻게 진행되나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. MD가 클럽 테이블을 등록하면 경매가 시작됩니다.</p>
                                <p>2. 회원들이 원하는 금액을 입찰합니다.</p>
                                <p>3. 경매 종료 시점에 가장 높은 금액을 입찰한 분이 낙찰됩니다.</p>
                                <p>4. 마감 3분 전 입찰 시 자동으로 3분 연장됩니다. (스나이핑 방지)</p>
                                <p>5. 경매 종료 시 최고가 입찰자가 자동으로 낙찰됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-2" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                입찰은 어떻게 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. 원하는 경매를 클릭하여 상세 페이지로 이동합니다.</p>
                                <p>2. 현재가보다 높은 금액을 입력합니다. (최소 5,000원 단위)</p>
                                <p>3. "입찰하기" 버튼을 누르면 확인 팝업이 표시됩니다.</p>
                                <p>4. "확인"을 누르면 입찰이 완료됩니다.</p>
                                <p className="mt-2 text-amber-500 font-bold">⚠️ 입찰 후에는 취소가 불가능하니 신중하게 입찰해주세요!</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-3" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                낙찰 후 어떻게 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. 낙찰되면 제한 시간 내에 MD에게 연락해야 합니다.</p>
                                <p>2. 경매 상세 페이지에서 MD의 연락처(인스타그램 DM/전화)를 확인할 수 있습니다.</p>
                                <p>3. MD에게 직접 연락하여 방문 일정을 확인합니다.</p>
                                <p>4. 테이블 이용 금액은 MD에게 직접 결제합니다.</p>
                                <p className="mt-2 text-red-500 font-bold">⚠️ 제한 시간 내 미연락 시 낙찰이 취소되며, 스트라이크가 부과됩니다!</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-4" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                금액은 어떻게 결제하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>NightFlow는 결제를 중개하지 않습니다. 낙찰 후 MD에게 직접 결제합니다.</p>
                                <p className="mt-2">• 현장에서 MD에게 직접 금액을 지불합니다.</p>
                                <p>• 결제 방식은 MD와 협의하여 결정합니다. (현금, 계좌이체 등)</p>
                                <p>• NightFlow는 경매 연결만 담당하며, 금전 거래에는 관여하지 않습니다.</p>
                                <p className="mt-3 text-green-500">💡 금액 관련 분쟁은 MD와 직접 해결해주세요. 문제 발생 시 고객센터로 신고할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-5" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                낙찰 취소하면 어떻게 되나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>취소 시점에 따라 경고점이 다르게 부과됩니다:</p>
                                <p className="mt-2">• <span className="text-green-500 font-bold">즉시 취소 (2분 이내):</span> 패널티 없음</p>
                                <p>• <span className="text-amber-500 font-bold">Grace 취소 (타이머 전반):</span> 경고 1점</p>
                                <p>• <span className="text-red-500 font-bold">Late 취소 (타이머 후반):</span> 경고 2점</p>
                                <p className="mt-2">경고 3점이 누적되면 스트라이크 1회로 자동 전환됩니다.</p>
                                <p>취소 시 차순위 입찰자에게 낙찰이 자동으로 넘어갑니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-5b" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                미연락·노쇼 시 불이익이 있나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p><span className="text-white font-bold">미연락</span> (연락 타이머 만료 시): <span className="text-red-500 font-bold">즉시 스트라이크 1회</span> 부과</p>
                                <p className="mt-1"><span className="text-white font-bold">노쇼</span> (연락 후 방문하지 않은 경우): MD 신고 시 <span className="text-red-500 font-bold">즉시 스트라이크 1회</span> 부과</p>
                                <p className="mt-2 font-bold text-white">스트라이크 제재:</p>
                                <p>• <span className="text-amber-500 font-bold">1회:</span> 3일간 서비스 이용 정지</p>
                                <p>• <span className="text-amber-500 font-bold">2회:</span> 14일간 서비스 이용 정지</p>
                                <p>• <span className="text-red-500 font-bold">3회:</span> 60일간 서비스 이용 정지</p>
                                <p>• <span className="text-red-500 font-bold">4회:</span> 영구 차단</p>
                                <p className="mt-2 text-neutral-500">취소 경고(3점)로도 스트라이크가 누적될 수 있으니 주의하세요.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-6" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                클럽 입장은 어떻게 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. 예약된 날짜와 시간에 클럽에 방문합니다.</p>
                                <p>2. 입구에서 MD 또는 직원에게 <span className="text-green-500 font-bold">예약자 이름과 전화번호</span>를 알려주세요.</p>
                                <p>3. MD가 예약을 확인하고 테이블로 안내합니다.</p>
                                <p>4. 포함된 서비스(주류, 안주 등)를 확인하세요.</p>
                                <p className="mt-3 text-amber-500">💡 추가 주문은 현장에서 별도 결제됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* MD FAQ */}
                <section className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <Store className="w-5 h-5 text-green-500" />
                        </div>
                        <h2 className="text-xl font-black text-white">MD (마케팅 담당자)</h2>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                        <AccordionItem value="md-1" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                MD가 되려면 어떻게 해야 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. 카카오톡으로 회원가입 시 "MD로 가입하기"를 선택합니다.</p>
                                <p>2. 소속 클럽, 활동 지역, 은행 계좌 정보를 입력합니다.</p>
                                <p>3. 관리자 승인 대기 (영업일 기준 1-2일 소요)</p>
                                <p>4. 승인 완료 시 카카오톡 알림톡으로 안내됩니다.</p>
                                <p className="mt-3 text-green-500 font-bold">💡 클럽과 정식 계약이 체결된 MD만 승인됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-2" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                조각은 어떻게 등록하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. MD 대시보드 → "조각 등록하기" 클릭</p>
                                <p>2. 클럽, 테이블 타입, 인원, 포함 서비스, 이벤트 날짜를 입력합니다.</p>
                                <p>3. 인당 가격을 설정합니다.</p>
                                <p>4. 방문일과 마감 시각을 설정합니다.</p>
                                <p>5. "조각 등록하기" 클릭 시 매물이 노출됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-3" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                수수료는 얼마인가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p className="font-bold text-white mb-2">플랫폼 수수료:</p>
                                <p>• <span className="text-green-500 font-bold">베타 기간:</span> 수수료 0% (무료)</p>
                                <p>• <span className="text-neutral-400">정식 오픈 후:</span> 별도 공지 예정</p>

                                <p className="mt-3 text-neutral-400">예시: 낙찰가 20만원인 경우</p>
                                <p>• 플랫폼 수수료: 0원 (0%)</p>
                                <p>• MD 정산 금액: 200,000원 (전액)</p>

                                <p className="mt-3 text-green-500">베타 기간 동안 MD 수수료가 무료입니다!</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-4" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                정산은 언제 되나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>NightFlow는 결제를 중개하지 않으므로 별도 정산 과정이 없습니다. 낙찰자가 MD에게 직접 결제합니다.</p>

                                <p className="mt-3 font-bold text-white">매출 확인:</p>
                                <p>• MD 대시보드에서 낙찰 내역을 실시간으로 확인할 수 있습니다.</p>
                                <p>• 낙찰자가 MD에게 연락 → 현장 방문 확인 순으로 거래가 완료됩니다.</p>

                                <p className="mt-3 text-amber-500">💡 MD 대시보드 → 매출/정산에서 거래 현황을 확인할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-5" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                VIP 고객 관리는 어떻게 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. MD 대시보드 → "VIP 고객" 메뉴 접근</p>
                                <p>2. 경매 상세 페이지에서 입찰자를 클릭하면 신뢰도 프로필이 표시됩니다.</p>
                                <p>3. "VIP 등록" 버튼을 누르고 메모를 추가합니다.</p>
                                <p>4. VIP 고객은 입찰 목록에 ⭐ 배지로 표시됩니다.</p>

                                <p className="mt-3 font-bold text-white">신뢰도 지표:</p>
                                <p>• 총 입찰 횟수</p>
                                <p>• 낙찰률 (%)</p>
                                <p>• 평균 입찰 금액</p>
                                <p>• 방문 완료 횟수</p>
                                <p>• 노쇼 횟수</p>

                                <p className="mt-3 text-green-500">💡 VIP 고객에게 우선 연락하거나 특별 혜택을 제공할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* 기술/보안 FAQ */}
                <section className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-purple-500" />
                        </div>
                        <h2 className="text-xl font-black text-white">기술 및 보안</h2>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                        <AccordionItem value="tech-1" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                회원가입은 어떻게 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>NightFlow는 카카오톡 간편 로그인만 지원합니다.</p>
                                <p className="mt-2">1. "카카오로 시작하기" 버튼 클릭</p>
                                <p>2. 카카오 계정으로 로그인</p>
                                <p>3. 이름, 전화번호 입력 (본인 확인용)</p>
                                <p>4. 가입 완료!</p>

                                <p className="mt-3 text-green-500">💡 별도 비밀번호 설정이 필요 없어 편리합니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="tech-3" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                개인정보는 안전한가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p className="font-bold text-white mb-2">개인정보 보호 조치:</p>
                                <p>• <span className="text-green-500 font-bold">암호화:</span> AES-256, TLS 1.3 적용</p>
                                <p>• <span className="text-green-500 font-bold">접근 제어:</span> 최소 권한 원칙</p>
                                <p>• <span className="text-green-500 font-bold">로그 기록:</span> 모든 접근 기록 보관</p>
                                <p>• <span className="text-green-500 font-bold">정기 감사:</span> 보안 취약점 점검</p>

                                <p className="mt-3 text-neutral-400">개인정보처리방침은 <Link href="/privacy" className="text-green-500 underline">여기</Link>에서 확인할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="tech-4" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                계정을 탈퇴하려면?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. 마이페이지 → 설정 → 계정 관리</p>
                                <p>2. "회원 탈퇴" 클릭</p>
                                <p>3. 탈퇴 사유 선택 (선택사항)</p>
                                <p>4. "탈퇴하기" 확인</p>

                                <p className="mt-3 text-amber-500 font-bold">⚠️ 주의사항:</p>
                                <p>• 진행 중인 거래나 정산이 있으면 완료 후 탈퇴 가능</p>
                                <p>• 탈퇴 시 개인정보는 즉시 삭제 (법령 보관 의무 제외)</p>
                                <p>• 재가입 시 이전 노쇼 기록은 승계되지 않음</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* 문제 발생 시 */}
                <section className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                        </div>
                        <h2 className="text-xl font-black text-white">문제 발생 시</h2>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                        <AccordionItem value="dispute-1" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                MD가 연락을 받지 않아요
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>낙찰 후 MD가 응답하지 않는 경우:</p>
                                <p className="mt-2">1. 경매 상세 페이지 하단의 <span className="text-red-400 font-bold">"MD가 답하지 않아요"</span> 버튼을 눌러주세요.</p>
                                <p>2. 신고 접수 시 연락 타이머가 <span className="text-green-400 font-bold">15분 연장</span>되고, MD에게 긴급 알림이 전송됩니다.</p>
                                <p>3. 연장된 시간 내에도 연락이 되지 않으면 낙찰이 자동 취소되며, <span className="text-amber-400 font-bold">귀하에게는 패널티가 부과되지 않습니다.</span></p>
                                <p className="mt-2 text-neutral-500">해당 MD에게는 운영팀에서 별도 조치합니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-2" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                현장에서 테이블/서비스가 달라요
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>경매에 표시된 내용과 현장 서비스가 다른 경우:</p>
                                <p className="mt-2">1. <span className="text-white font-bold">현장에서 먼저 MD에게 직접 확인</span>해주세요. 대부분의 경우 즉시 해결됩니다.</p>
                                <p>2. 해결되지 않으면 고객센터로 연락해주세요.</p>
                                <p className="pl-4 mt-1 text-sm">- 이메일: <span className="text-blue-400">maddawids@gmail.com</span></p>
                                <p className="pl-4 text-sm">- 전화: <span className="text-blue-400">070-5236-4647</span></p>
                                <p className="mt-2">3. 운영팀이 MD와 사실 확인 후 <span className="text-green-400 font-bold">24시간 내</span> 조치 결과를 안내드립니다.</p>
                                <p className="mt-2 text-amber-500 font-bold">신고 내역은 해당 MD의 신뢰도 평가에 반영됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-3" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                금액 관련 분쟁이 발생했어요
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>NightFlow는 결제를 중개하지 않으므로, 금액 관련 분쟁은 MD와 직접 해결이 원칙입니다.</p>
                                <p className="mt-2 text-white font-bold">그러나 다음 경우 운영팀이 개입합니다:</p>
                                <p className="pl-4 mt-1">- 경매 표시 금액과 현장 요구 금액이 다른 경우</p>
                                <p className="pl-4">- MD가 추가 비용을 부당하게 요구하는 경우</p>
                                <p className="pl-4">- 서비스 미제공 등 명백한 피해가 발생한 경우</p>
                                <p className="mt-3">고객센터로 <span className="text-white font-bold">상황 설명 + 증빙(채팅 캡처 등)</span>을 보내주시면 확인 후 조치합니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-4" className="border border-neutral-800 rounded-xl px-6 bg-neutral-900/30">
                            <AccordionTrigger className="text-white font-bold hover:no-underline">
                                부적절한 MD를 신고하고 싶어요
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>다음과 같은 경우 MD를 신고할 수 있습니다:</p>
                                <p className="pl-4 mt-2">- 반복적 미응답 또는 무단 취소</p>
                                <p className="pl-4">- 허위 조각 등록 (존재하지 않는 테이블 등)</p>
                                <p className="pl-4">- 불친절하거나 부적절한 언행</p>
                                <p className="pl-4">- 플랫폼 외 결제 강요</p>
                                <p className="mt-3">고객센터(maddawids@gmail.com)로 신고해주시면 <span className="text-white font-bold">운영팀이 조사 후 경고, 활동 정지, 영구 차단</span> 등의 조치를 취합니다.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* 고객센터 안내 */}
                <section className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-3xl p-8 text-center space-y-4">
                    <Phone className="w-12 h-12 text-blue-500 mx-auto" />
                    <h3 className="text-xl font-black text-white">
                        더 궁금한 점이 있으신가요?
                    </h3>
                    <p className="text-neutral-400">
                        FAQ에서 답변을 찾지 못하셨다면 고객센터로 문의해주세요.
                        <br />
                        평일 10:00-18:00, 영업일 기준 24시간 내 답변드립니다.
                    </p>
                    <div className="flex flex-col gap-2 text-sm">
                        <p className="text-neutral-300">
                            📸 인스타 DM:{" "}
                            <a
                                href="https://www.instagram.com/nightflow.kr"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-pink-400 font-bold hover:underline"
                            >
                                @nightflow.kr
                            </a>
                        </p>
                        <p className="text-neutral-300">
                            📧 이메일: <span className="text-blue-500 font-bold">maddawids@gmail.com</span>
                        </p>
                        <p className="text-neutral-300">
                            📞 전화: <span className="text-blue-500 font-bold">070-5236-4647</span>
                        </p>
                    </div>
                </section>

                <div className="text-center pt-8">
                    <Link href="/">
                        <Button variant="link" className="text-neutral-500 hover:text-white transition-colors">
                            홈으로 돌아가기
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
