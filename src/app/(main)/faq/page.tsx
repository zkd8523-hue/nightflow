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
    "나플 이용 가이드. 나플이 뭔지, 클럽 게스트·무료입장·프리드링크가 뭔지, 게스트 명단 등록 방법, 파티(합석) 이용법, 노쇼 정책, 본인인증 등 자주 묻는 질문을 한 곳에서 확인하세요.",
  alternates: { canonical: "https://nightflow.kr/faq" },
};

// FAQPage JSON-LD — Google 리치 결과(검색 결과 내 Q&A 직접 노출) 가능성.
// 본문 Accordion과 동일한 Q&A로 작성해 신뢰성 확보.
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "나플이 뭔가요?",
    a: "나플은 나이트플로우(NightFlow)의 줄임말입니다. 강남·홍대·이태원 클럽의 테이블 가격·주대·영업시간 정보와 무료입장·프리드링크 게스트 간판 혜택을 모아 보여주고, 같이 갈 일행을 모으는 파티(합석)까지 한 곳에서 해결하는 클럽 플랫폼이에요.",
  },
  {
    q: "클럽 파티(합석)가 뭔가요?",
    a: "파티는 나이트플로우의 일행 모집 기능입니다. 흔히 '클럽 파티', '클럽 합석'이라고 부르는 기능으로, 같은 클럽에 갈 일행을 모집하거나 이미 모집 중인 파티에 합류할 수 있습니다.",
  },
  {
    q: "클럽 게스트 / 무료입장이 뭔가요?",
    a: "클럽 게스트는 클럽 파트너가 운영하는 게스트 명단에 등록되어 무료입장 또는 할인 입장이 가능한 방식입니다. 나플의 게스트 간판은 매주 월요일 오후 6시에 갱신되며, 클럽×요일별로 무료입장·여성 무료·프리드링크 등 혜택이 다르게 적용됩니다.",
  },
  {
    q: "게스트 명단은 어떻게 등록하나요?",
    a: "원하는 클럽의 게스트 간판을 운영하는 파트너에게 직접 연락하면 게스트 명단에 올려줍니다. 나플 클럽 상세 페이지에서 이번 주 게스트 간판 파트너를 확인하고 인스타그램 DM 또는 카카오톡 오픈채팅으로 연락하세요.",
  },
  {
    q: "클럽 부킹이 뭔가요?",
    a: "클럽 부킹은 전통적인 한국 클럽 문화로 파트너가 테이블에 합석할 사람을 안내해주는 방식을 말합니다. 나플에서는 부킹 대신 게스트 간판(무료입장·프리드링크), 파티(합석), 테이블 예약 등 더 투명한 방식으로 같은 목적(테이블·일행 매칭)을 해결합니다.",
  },
  {
    q: "나플 쿠폰은 어떻게 받고 사용하나요?",
    a: "클럽 상세 페이지나 쿠폰 목록에서 무료입장·프리드링크·서비스 주류 등의 쿠폰을 받을 수 있습니다. 받은 쿠폰은 '내 쿠폰'에서 확인하고, 현장에서 파트너에게 보여준 뒤 파트너가 승인 비밀번호 4자리를 입력하면 사용 처리됩니다. 수량이 한정된 쿠폰은 조기 마감될 수 있습니다.",
  },
  {
    q: "게스트 간판이 뭔가요?",
    a: "게스트 간판은 클럽 파트너가 한 주 동안 요일별 무료입장·프리드링크 등의 혜택을 나플 홈에 노출하는 홍보 자리입니다. 매주 월요일 오후 6시에 갱신되며 클럽당 파트너 1명이 선착순으로 차지합니다. 표시된 파트너에게 연락해 게스트 명단에 등록하면 됩니다.",
  },
  {
    q: "클럽 파티는 어떻게 참여하나요?",
    a: "파티는 클럽 파트너가 인당 가격으로 테이블 자리를 열어두면 유저가 참여하는 방식입니다. 원하는 파티를 골라 신청하고, 파트너와 연락해 방문 일정을 확정한 뒤 현장에서 직접 결제합니다. 나플은 결제를 중개하지 않습니다.",
  },
  {
    q: "나플에서 미리 결제하거나 예약금을 보내야 하나요?",
    a: "아니요. 나플은 결제를 중개하지 않습니다. 파티든 게스트 간판이든 앱에서 미리 결제하거나 예약금을 송금하는 절차가 없으며, 비용은 당일 현장에서 파트너에게 직접 결제합니다. 나플을 사칭해 선입금을 요구하는 경우 응하지 마세요.",
  },
  {
    q: "여성무료는 어떻게 받나요?",
    a: "여성무료는 클럽이 특정 요일/시간대에 여성 게스트에게 무료입장을 제공하는 혜택입니다. 나플의 게스트 간판에서 해당 클럽이 여성 무료를 운영하는 요일을 확인하고, 표시된 파트너에게 인스타 DM 또는 카카오톡 오픈채팅으로 게스트 명단 등록을 요청하면 됩니다.",
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
        <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-20 px-4 pb-20">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            <div className="max-w-3xl w-full space-y-8">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/">
                        <Button variant="ghost" size="icon" className="rounded-full bg-card border border-border text-muted-foreground">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                        <HelpCircle className="w-6 h-6 text-blue-500" />
                        자주 묻는 질문 (FAQ)
                    </h1>
                </div>

                {/* 일반 사용자 FAQ */}
                <section className="bg-card border border-border rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-500" />
                        </div>
                        <h2 className="text-xl font-black text-foreground">일반 사용자</h2>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                        <AccordionItem value="item-0" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                나플이 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>
                                    <strong className="text-foreground">나플</strong>은 <strong className="text-foreground">나이트플로우(NightFlow)</strong>의 줄임말입니다.
                                </p>
                                <p className="mt-2">
                                    강남·홍대·이태원 클럽의 테이블 가격·주대·영업시간 정보와 무료입장·프리드링크
                                    게스트 간판 혜택을 모아 보여주고, 같이 갈 일행을 모으는 파티(합석)까지
                                    한 곳에서 해결하는 클럽 플랫폼이에요.
                                    "나플에서 잡는다"처럼 편하게 부르시면 됩니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0a" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                클럽 파티(합석)가 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>
                                    <strong className="text-foreground">파티</strong>는 나이트플로우의 일행 모집 기능입니다.
                                    흔히 <strong className="text-foreground">"클럽 파티"</strong>,{" "}
                                    <strong className="text-foreground">"클럽 합석"</strong>이라고 부르는 그 기능이에요.
                                </p>
                                <p className="mt-2">
                                    인원이 부족할 때 같은 클럽에 갈 일행을 모집하거나, 다른 사람이
                                    모집 중인 파티에 합류할 수 있습니다. 강남 클럽 파티, 홍대 클럽
                                    합석을 안전하게 찾는 가장 빠른 방법입니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0b" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                클럽 게스트 / 무료입장이 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>
                                    <strong className="text-foreground">클럽 게스트</strong>는 클럽 파트너가 운영하는 게스트 명단에
                                    등록되어 <strong className="text-foreground">무료입장</strong> 또는 할인 입장이 가능한
                                    방식입니다.
                                </p>
                                <p className="mt-2">
                                    나플의 <strong className="text-foreground">게스트 간판</strong>은 매주 월요일
                                    오후 6시에 갱신됩니다. 각 클럽 × 요일별로 게스트 입장 혜택
                                    (여성 무료, 프리드링크, 신청곡 등)이 다르게 적용됩니다.
                                </p>
                                <p className="mt-2">
                                    강남 클럽 무료입장, 홍대 클럽 게스트, 이태원 무료입장 정보는
                                    클럽 상세 페이지에서 요일별로 확인할 수 있고, 지역별 게스트
                                    모음(/guest/지역명)에서도 한눈에 볼 수 있어요.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0c" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                게스트 명단은 어떻게 등록하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>
                                    원하는 클럽의 게스트 간판을 운영하는 파트너에게 직접 연락하면
                                    게스트 명단에 올려줍니다.
                                </p>
                                <p className="mt-2">
                                    나플에서 클럽 상세 페이지에 들어가면 이번 주
                                    게스트 간판 파트너가 표시되며, 인스타그램 DM 또는 카카오톡
                                    오픈채팅으로 직접 연락해 무료입장·게스트 입장 정보를 받을 수
                                    있습니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0d" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                클럽 부킹이 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>
                                    <strong className="text-foreground">클럽 부킹</strong>은 전통적인 한국 클럽 문화로
                                    파트너가 테이블에 합석할 사람을 안내해주는 방식을 말합니다.
                                </p>
                                <p className="mt-2">
                                    나플에서는 부킹 대신 <strong className="text-foreground">게스트 간판(무료입장·프리드링크)</strong>,{" "}
                                    <strong className="text-foreground">파티(합석)</strong>,{" "}
                                    <strong className="text-foreground">테이블 예약</strong> 등 더 투명한 방식으로
                                    같은 목적(테이블·일행 매칭)을 해결합니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0e" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                여성무료는 어떻게 받나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>
                                    <strong className="text-foreground">여성무료</strong>는 클럽이 특정 요일·시간대에
                                    여성 게스트에게 무료입장을 제공하는 혜택입니다.
                                </p>
                                <p className="mt-2">
                                    나플의 <strong className="text-foreground">게스트 간판</strong>에서 해당 클럽이
                                    여성 무료를 운영하는 요일을 확인하고, 표시된 파트너에게 인스타 DM
                                    또는 카카오톡 오픈채팅으로 게스트 명단 등록을 요청하면 됩니다.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0g" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                파티는 어떻게 참여하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>1. 홈이나 파티 목록에서 원하는 파티를 고릅니다.</p>
                                <p>2. 날짜, 클럽, 인당 가격, 포함 주류를 확인하고 참여합니다.</p>
                                <p>3. 파티 채팅방에서 파트너·일행과 일정을 맞춥니다.</p>
                                <p>4. 당일 클럽에 방문해 현장에서 직접 결제합니다.</p>
                                <p className="mt-3 text-brand-amber">💡 나플은 결제를 중개하지 않습니다. 앱에서 미리 결제하거나 예약금을 보내는 절차는 없습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0h" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                파티에 참여하면 어떤 정보가 공개되나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>파티에 참여하면 <span className="text-money font-bold">닉네임·나이·성별</span>이 같은 파티원에게 공개됩니다. 참여자 목록에서 서로 확인할 수 있습니다.</p>
                                <p className="mt-3">• 전화번호와 카카오 계정 정보는 공개되지 않습니다.</p>
                                <p>• 나이·성별 조건이 걸린 파티는 조건에 맞는 사람만 참여할 수 있습니다.</p>
                                <p className="mt-3 text-brand-amber">💡 공개 범위가 부담스럽다면 참여 전에 안내 문구를 확인하고 결정하세요.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0i" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                참여를 취소하고 싶어요
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>"내 파티"에서 참여를 취소할 수 있습니다. 미리 결제한 금액이 없으므로 환불 절차도 없습니다.</p>
                                <p className="mt-3">• 일정이 바뀌었다면 <span className="text-foreground font-bold">가능한 한 빨리</span> 취소해주세요. 자리가 비어야 다른 사람이 들어올 수 있습니다.</p>
                                <p>• 파티원과 파트너가 기다리고 있으니 채팅방에도 알려주는 것이 좋습니다.</p>
                                <p className="mt-3 text-brand-amber">💡 연락 없이 나타나지 않는 일이 반복되면 이용이 제한될 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-0f" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                쿠폰은 어떻게 받고 쓰나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>1. 클럽 상세 페이지나 쿠폰 목록에서 원하는 쿠폰을 받습니다.</p>
                                <p>2. 받은 쿠폰은 "내 쿠폰"에서 확인할 수 있습니다.</p>
                                <p>3. 현장에서 파트너에게 쿠폰 화면을 보여주고 사용 버튼을 누릅니다.</p>
                                <p>4. 파트너가 <span className="text-money font-bold">승인 비밀번호 4자리</span>를 입력하면 사용 처리됩니다.</p>
                                <p className="mt-3 text-brand-amber">💡 수량이 한정된 쿠폰은 조기 마감될 수 있고, 마감 시각이 지나면 자동으로 만료됩니다.</p>
                                <p className="mt-2">💡 비밀번호는 파트너만 알고 있습니다. 직접 입력을 요구받으면 사용하지 마세요.</p>
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-6" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                클럽 입장은 어떻게 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>1. 예약된 날짜와 시간에 클럽에 방문합니다.</p>
                                <p>2. 입구에서 파트너 또는 직원에게 <span className="text-money font-bold">예약자 이름과 전화번호</span>를 알려주세요.</p>
                                <p>3. 파트너가 예약을 확인하고 테이블로 안내합니다.</p>
                                <p>4. 포함된 서비스(주류, 안주 등)를 확인하세요.</p>
                                <p className="mt-3 text-brand-amber">💡 추가 주문은 현장에서 별도 결제됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* MD FAQ */}
                <section className="bg-card border border-border rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <Store className="w-5 h-5 text-money" />
                        </div>
                        <h2 className="text-xl font-black text-foreground">파트너 (마케팅 담당자)</h2>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                        <AccordionItem value="md-1" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                파트너가 되려면 어떻게 해야 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>1. 카카오톡으로 회원가입 시 "파트너로 가입하기"를 선택합니다.</p>
                                <p>2. 소속 클럽과 활동 지역을 입력합니다.</p>
                                <p>3. 관리자 승인 대기 (영업일 기준 1-2일 소요)</p>
                                <p>4. 승인 완료 시 알림으로 안내됩니다.</p>
                                <p className="mt-3 text-money font-bold">💡 클럽과 정식 계약이 체결된 파트너만 승인됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-1a" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                파트너는 어떤 기능을 쓸 수 있나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>파트너 대시보드에서 크게 세 가지를 운영합니다.</p>
                                <p className="mt-3">• <span className="text-foreground font-bold">파티</span> — 인당 가격으로 테이블 자리를 열어 손님을 모으는 기능</p>
                                <p>• <span className="text-foreground font-bold">게스트 간판</span> — 요일별 무료입장·프리드링크 혜택을 홈에 노출하는 홍보 자리</p>
                                <p>• <span className="text-foreground font-bold">쿠폰</span> — 혜택을 쿠폰으로 발행해 유저가 직접 받아가게 하는 기능</p>
                                <p className="mt-3">이 밖에 VIP 고객 관리, 클럽 정보 관리, 플로어 배치도 설정을 지원합니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-2" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                파티는 어떻게 등록하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>파티는 <span className="text-foreground font-bold">자리 선점 → 옵션 세팅 → 요일표 배치</span> 순서로 운영합니다.</p>
                                <p className="mt-3">1. 파트너 대시보드 → "이번주 파티 일정"에서 클럽 자리를 선점합니다.</p>
                                <p>2. 파티 옵션(테이블 타입, 정원, 인당 가격, 포함 주류)을 만듭니다.</p>
                                <p>3. 요일표에서 원하는 요일에 옵션을 배치합니다.</p>
                                <p>4. 배치해 둔 요일이 되면 파티가 자동으로 올라갑니다.</p>
                                <p className="mt-3 text-brand-amber">💡 한 번 세팅해두면 그 주 파티가 매일 자동 등록돼요. 매일 등록할 필요가 없습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-2a" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                파티 자리(슬롯)는 어떻게 잡나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>• 파티 자리는 <span className="text-money font-bold">매주 월요일 오후 6시</span>에 오픈됩니다.</p>
                                <p>• <span className="text-foreground font-bold">클럽당 한 주에 파트너 1명</span>만 자리를 가질 수 있는 선착순입니다.</p>
                                <p>• 자리를 가진 파트너만 그 클럽의 파티를 올릴 수 있습니다.</p>
                                <p>• 본인도 한 주에 한 자리만 선점할 수 있습니다.</p>
                                <p className="mt-3 font-bold text-foreground">다음 주 미리 선점:</p>
                                <p>이번 주 요일표를 <span className="text-money font-bold">2일 이상</span> 세팅해두면, 같은 클럽의 다음 주 자리를 미리 잡을 수 있습니다. 이번 주 세팅이 그대로 다음 주에 적용됩니다.</p>
                                <p className="mt-3 text-brand-amber">💡 자리를 해제하면 그 클럽에 올라가 있던 파티가 모두 내려갑니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-2b" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                파티 옵션은 몇 개까지 만들 수 있나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>• 파티 옵션은 <span className="text-money font-bold">클럽당 최대 6개</span>까지 저장할 수 있습니다.</p>
                                <p>• 한 파티(테이블)의 정원은 <span className="text-money font-bold">최대 6명</span>입니다.</p>
                                <p>• 옵션에는 테이블 타입, 인원, 인당 가격, 포함 주류·구성을 담습니다.</p>
                                <p className="mt-3 text-brand-amber">💡 자주 쓰는 세팅을 옵션으로 만들어두면 요일표에 배치만 하면 됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-6" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                게스트 간판이 뭔가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>게스트 간판은 요일별 무료입장·프리드링크 등의 혜택을 홈 "오늘 어디갈래?"에 노출하는 홍보 자리입니다.</p>
                                <p className="mt-3">1. 파트너 대시보드 → "게스트 간판"에서 클럽 간판을 차지합니다.</p>
                                <p>2. 요일별로 혜택을 입력합니다. (예: 여성 무료입장, 프리드링크 1잔)</p>
                                <p>3. 입력한 혜택이 홈 화면에 요일에 맞춰 노출됩니다.</p>
                                <p>4. 손님이 표시된 파트너에게 연락해 게스트 명단에 등록합니다.</p>
                                <p className="mt-3 text-brand-amber">💡 게스트 간판은 홍보 노출 자리이고, 파티는 자리 판매 기능입니다. 둘은 별개로 운영됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-6a" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                게스트 간판 자리는 어떻게 차지하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>• 간판 자리는 <span className="text-money font-bold">매주 월요일 오후 6시</span>에 오픈됩니다.</p>
                                <p>• <span className="text-foreground font-bold">한 주를 통째로 점유</span>하며, 클럽당 파트너 1명 선착순입니다.</p>
                                <p>• 차지한 뒤 요일별 혜택을 입력해야 홈에 노출됩니다.</p>
                                <p className="mt-3 font-bold text-foreground">다음 주 미리 선점:</p>
                                <p>이번 주 혜택을 <span className="text-money font-bold">2일 이상</span> 입력해두면 다음 주 자리를 미리 잡을 수 있습니다.</p>
                                <p className="mt-3">자주 쓰는 혜택 문구는 <span className="text-foreground font-bold">고정 혜택으로 최대 12개</span>까지 저장해두고 재사용할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-7" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                쿠폰은 어떻게 발행하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>무료입장·프리드링크·서비스 주류 같은 혜택을 쿠폰으로 만들어 유저가 직접 받아가게 하는 기능입니다.</p>
                                <p className="mt-3">1. 파트너 대시보드 → "쿠폰 발행"으로 이동합니다.</p>
                                <p>2. 처음이라면 <span className="text-foreground font-bold">승인 비밀번호 4자리</span>를 먼저 설정합니다.</p>
                                <p>3. 클럽과 혜택 종류를 고릅니다. (무료입장, 프리드링크, 서비스 주류, 데낄라 샷, 직접입력 등)</p>
                                <p>4. 필요하면 할인 조건(최소 주대·할인율/할인 금액)을 설정합니다.</p>
                                <p>5. 수량과 마감 시각을 정하고 발행합니다.</p>
                                <p className="mt-3 text-brand-amber">💡 지난 쿠폰은 "다시 발행"으로 설정을 그대로 복사할 수 있습니다. 마감 시각만 새로 잡으면 돼요.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-7a" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                쿠폰 승인 비밀번호는 왜 필요한가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>손님이 현장에서 쿠폰 사용 버튼을 누르면, 파트너가 <span className="text-money font-bold">4자리 승인 비밀번호</span>를 입력해야 사용 처리됩니다. 손님이 혼자 임의로 쿠폰을 소진하는 것을 막기 위한 장치입니다.</p>
                                <p className="mt-3">• 비밀번호를 설정하지 않으면 쿠폰 발행이 차단됩니다.</p>
                                <p>• 비밀번호는 암호화되어 저장되며 화면에 다시 표시되지 않습니다.</p>
                                <p>• 5회 넘게 틀리면 해당 쿠폰의 사용 시도가 잠깁니다.</p>
                                <p className="mt-3 text-brand-amber">💡 비밀번호는 파트너 계정 단위로 하나이며, 쿠폰 발행 화면에서 언제든 변경할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-7b" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                쿠폰 수량과 취소는 어떻게 되나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>• 수량은 <span className="text-money font-bold">1~30장</span> 중에서 정하거나 <span className="text-money font-bold">무제한</span>으로 발행할 수 있습니다.</p>
                                <p>• 발행한 쿠폰은 마감 시각이 지나면 자동으로 만료됩니다.</p>
                                <p>• 발행을 취소하면 아직 사용하지 않은 보유분이 모두 무효화됩니다.</p>
                                <p className="mt-3 text-brand-amber">💡 이미 사용 처리된 쿠폰은 취소해도 되돌아가지 않습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-3" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                수수료는 얼마인가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p className="font-bold text-foreground mb-2">플랫폼 수수료:</p>
                                <p>• <span className="text-money font-bold">베타 기간:</span> 수수료 0% (무료)</p>
                                <p>• <span className="text-muted-foreground">정식 오픈 후:</span> 별도 공지 예정</p>
                                <p className="mt-3">파티 자리 선점, 게스트 간판, 쿠폰 발행 모두 베타 기간 동안 추가 비용 없이 이용할 수 있습니다.</p>
                                <p className="mt-3 text-money">손님이 낸 금액은 전액 파트너가 직접 받습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-4" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                정산은 언제 되나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>NightFlow는 결제를 중개하지 않으므로 별도 정산 과정이 없습니다. 손님이 파트너에게 직접 결제합니다.</p>

                                <p className="mt-3 font-bold text-foreground">거래 확인:</p>
                                <p>• 파트너 대시보드에서 신청·매칭 내역을 실시간으로 확인할 수 있습니다.</p>
                                <p>• 손님이 파트너에게 연락 → 현장 방문 확인 순으로 거래가 완료됩니다.</p>

                                <p className="mt-3 text-brand-amber">💡 파트너 대시보드에서 거래 현황을 확인할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="md-5" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                VIP 고객 관리는 어떻게 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>1. 파트너 대시보드 → "VIP 고객" 메뉴에 접근합니다.</p>
                                <p>2. 손님 프로필에서 신뢰도 지표를 확인합니다.</p>
                                <p>3. "VIP 등록" 버튼을 누르고 메모를 추가합니다.</p>
                                <p>4. VIP 고객은 목록에 ⭐ 배지로 표시됩니다.</p>

                                <p className="mt-3 font-bold text-foreground">신뢰도 지표:</p>
                                <p>• 참여 횟수</p>
                                <p>• 매칭 성사율 (%)</p>
                                <p>• 평균 이용 금액</p>
                                <p>• 방문 완료 횟수</p>

                                <p className="mt-3 text-money">💡 VIP 고객에게 우선 연락하거나 특별 혜택을 제공할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* 기술/보안 FAQ */}
                <section className="bg-card border border-border rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-purple-500" />
                        </div>
                        <h2 className="text-xl font-black text-foreground">기술 및 보안</h2>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                        <AccordionItem value="tech-1" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                회원가입은 어떻게 하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>NightFlow는 카카오톡 간편 로그인만 지원합니다.</p>
                                <p className="mt-2">1. "카카오로 시작하기" 버튼 클릭</p>
                                <p>2. 카카오 계정으로 로그인</p>
                                <p>3. 이름, 전화번호 입력 (본인 확인용)</p>
                                <p>4. 가입 완료!</p>

                                <p className="mt-3 text-money">💡 별도 비밀번호 설정이 필요 없어 편리합니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="tech-3" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                개인정보는 안전한가요?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p className="font-bold text-foreground mb-2">개인정보 보호 조치:</p>
                                <p>• <span className="text-money font-bold">암호화:</span> AES-256, TLS 1.3 적용</p>
                                <p>• <span className="text-money font-bold">접근 제어:</span> 최소 권한 원칙</p>
                                <p>• <span className="text-money font-bold">로그 기록:</span> 모든 접근 기록 보관</p>
                                <p>• <span className="text-money font-bold">정기 감사:</span> 보안 취약점 점검</p>

                                <p className="mt-3 text-muted-foreground">개인정보처리방침은 <Link href="/privacy" className="text-money underline">여기</Link>에서 확인할 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="tech-4" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                계정을 탈퇴하려면?
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>1. 마이페이지 → 설정 → 계정 관리</p>
                                <p>2. "회원 탈퇴" 클릭</p>
                                <p>3. 탈퇴 사유 선택 (선택사항)</p>
                                <p>4. "탈퇴하기" 확인</p>

                                <p className="mt-3 text-brand-amber font-bold">⚠️ 주의사항:</p>
                                <p>• 진행 중인 거래가 있으면 완료 후 탈퇴 가능</p>
                                <p>• 탈퇴 후 <span className="text-money font-bold">30일 이내</span>에는 같은 카카오 계정으로 로그인해 계정을 복구할 수 있습니다.</p>
                                <p>• 30일이 지나면 개인정보가 영구 삭제됩니다. (법령 보관 의무 제외)</p>
                                <p>• <span className="text-foreground font-bold">이용 제한 기록은 탈퇴해도 사라지지 않습니다.</span> 제재 중 탈퇴 후 재가입하면 남은 제재가 그대로 이어집니다.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* 문제 발생 시 */}
                <section className="bg-card border border-border rounded-3xl p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                        </div>
                        <h2 className="text-xl font-black text-foreground">문제 발생 시</h2>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                        <AccordionItem value="dispute-1" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                파트너가 연락을 받지 않아요
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>낙찰 후 파트너가 응답하지 않는 경우:</p>
                                <p className="mt-2">1. 경매 상세 페이지 하단의 <span className="text-red-400 font-bold">"파트너가 답하지 않아요"</span> 버튼을 눌러주세요.</p>
                                <p>2. 신고 접수 시 연락 타이머가 <span className="text-money font-bold">15분 연장</span>되고, 파트너에게 긴급 알림이 전송됩니다.</p>
                                <p>3. 연장된 시간 내에도 연락이 되지 않으면 낙찰이 자동 취소되며, <span className="text-brand-amber font-bold">귀하에게는 패널티가 부과되지 않습니다.</span></p>
                                <p className="mt-2 text-muted-foreground">해당 파트너에게는 운영팀에서 별도 조치합니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-2" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                현장에서 테이블/서비스가 달라요
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>경매에 표시된 내용과 현장 서비스가 다른 경우:</p>
                                <p className="mt-2">1. <span className="text-foreground font-bold">현장에서 먼저 파트너에게 직접 확인</span>해주세요. 대부분의 경우 즉시 해결됩니다.</p>
                                <p>2. 해결되지 않으면 고객센터로 연락해주세요.</p>
                                <p className="pl-4 mt-1 text-sm">- 이메일: <span className="text-blue-400">maddawids@gmail.com</span></p>
                                <p className="pl-4 text-sm">- 전화: <span className="text-blue-400">070-5236-4647</span></p>
                                <p className="mt-2">3. 운영팀이 파트너와 사실 확인 후 <span className="text-money font-bold">24시간 내</span> 조치 결과를 안내드립니다.</p>
                                <p className="mt-2 text-brand-amber font-bold">신고 내역은 해당 파트너의 신뢰도 평가에 반영됩니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-3" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                금액 관련 분쟁이 발생했어요
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>NightFlow는 결제를 중개하지 않으므로, 금액 관련 분쟁은 파트너와 직접 해결이 원칙입니다.</p>
                                <p className="mt-2 text-foreground font-bold">그러나 다음 경우 운영팀이 개입합니다:</p>
                                <p className="pl-4 mt-1">- 경매 표시 금액과 현장 요구 금액이 다른 경우</p>
                                <p className="pl-4">- 파트너가 추가 비용을 부당하게 요구하는 경우</p>
                                <p className="pl-4">- 서비스 미제공 등 명백한 피해가 발생한 경우</p>
                                <p className="mt-3">고객센터로 <span className="text-foreground font-bold">상황 설명 + 증빙(채팅 캡처 등)</span>을 보내주시면 확인 후 조치합니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-5" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                계정이 이용 정지됐어요
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>마이페이지 → <span className="text-foreground font-bold">패널티 내역</span>에서 제재 사유와 해제 시각을 확인할 수 있습니다.</p>
                                <p className="mt-3 font-bold text-foreground">제재 단계:</p>
                                <p>• 경고 3회가 쌓이면 이용 정지로 이어집니다.</p>
                                <p>• 정지는 사안에 따라 <span className="text-money font-bold">3일 → 14일 → 60일 → 영구 차단</span> 순으로 무거워집니다.</p>
                                <p className="mt-3 font-bold text-foreground">이의제기:</p>
                                <p>제재가 부당하다고 판단되면 패널티 내역에서 이의제기를 제출할 수 있습니다. 영업일 3일 내 검토 후 결과를 알림으로 안내합니다.</p>
                                <p className="mt-3 text-brand-amber">⚠️ 허위 이의제기 시 추가 패널티가 부과될 수 있습니다.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-6" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                불쾌한 사용자를 차단하고 싶어요
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>프로필이나 게시글의 더보기 메뉴에서 <span className="text-foreground font-bold">차단</span>할 수 있습니다.</p>
                                <p className="mt-3">• 차단 즉시 해당 사용자의 모든 게시글이 피드에서 사라집니다.</p>
                                <p>• 차단 사유는 관리자에게 전달되어 24시간 내 검토됩니다.</p>
                                <p>• 차단은 언제든 해제할 수 있습니다.</p>
                                <p className="mt-3 text-brand-amber">💡 범죄 피해가 우려되는 상황이라면 차단과 함께 즉시 112에 신고하세요.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-7" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                쿠폰을 쓰려는데 사용 처리가 안 돼요
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>먼저 아래를 확인해주세요.</p>
                                <p className="mt-3">• <span className="text-foreground font-bold">마감 시각이 지났는지</span> — 만료된 쿠폰은 사용할 수 없습니다.</p>
                                <p>• <span className="text-foreground font-bold">발행이 취소됐는지</span> — 파트너가 발행을 취소하면 미사용분이 무효화됩니다.</p>
                                <p>• <span className="text-foreground font-bold">비밀번호 오입력</span> — 5회 넘게 틀리면 사용 시도가 잠깁니다.</p>
                                <p className="mt-3">승인 비밀번호는 <span className="text-money font-bold">파트너가 직접 입력</span>해야 합니다. 손님에게 비밀번호를 알려주며 직접 입력하라고 요구받았다면 사용하지 말고 신고해주세요.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="dispute-4" className="border border-border rounded-xl px-6 bg-card/30">
                            <AccordionTrigger className="text-foreground font-bold hover:no-underline">
                                부적절한 파트너를 신고하고 싶어요
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground leading-relaxed">
                                <p>다음과 같은 경우 파트너를 신고할 수 있습니다:</p>
                                <p className="pl-4 mt-2">- 반복적 미응답 또는 무단 취소</p>
                                <p className="pl-4">- 허위 파티 등록 (존재하지 않는 테이블 등)</p>
                                <p className="pl-4">- 불친절하거나 부적절한 언행</p>
                                <p className="pl-4">- 플랫폼 외 결제 강요</p>
                                <p className="mt-3">고객센터(maddawids@gmail.com)로 신고해주시면 <span className="text-foreground font-bold">운영팀이 조사 후 경고, 활동 정지, 영구 차단</span> 등의 조치를 취합니다.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>

                {/* 고객센터 안내 */}
                <section className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-3xl p-8 text-center space-y-4">
                    <Phone className="w-12 h-12 text-blue-500 mx-auto" />
                    <h3 className="text-xl font-black text-foreground">
                        더 궁금한 점이 있으신가요?
                    </h3>
                    <p className="text-muted-foreground">
                        FAQ에서 답변을 찾지 못하셨다면 고객센터로 문의해주세요.
                        <br />
                        평일 10:00-18:00, 영업일 기준 24시간 내 답변드립니다.
                    </p>
                    <div className="flex flex-col gap-2 text-sm">
                        <p className="text-foreground/80">
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
                        <p className="text-foreground/80">
                            📧 이메일: <span className="text-blue-500 font-bold">maddawids@gmail.com</span>
                        </p>
                        <p className="text-foreground/80">
                            📞 전화: <span className="text-blue-500 font-bold">070-5236-4647</span>
                        </p>
                    </div>
                </section>

                <div className="text-center pt-8">
                    <Link href="/">
                        <Button variant="link" className="text-muted-foreground hover:text-foreground transition-colors">
                            홈으로 돌아가기
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
