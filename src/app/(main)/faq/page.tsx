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

export default function FAQPage() {
    return (
        <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-start pt-20 px-4 pb-20">
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
                                경매는 어떻게 등록하나요?
                            </AccordionTrigger>
                            <AccordionContent className="text-neutral-400 leading-relaxed">
                                <p>1. MD 대시보드 → "경매 등록하기" 클릭</p>
                                <p>2. 클럽, 테이블 타입, 인원, 포함 서비스, 이벤트 날짜를 입력합니다.</p>
                                <p>3. 시작가를 설정합니다.</p>
                                <p>4. 경매 시작/종료 시간을 설정합니다.</p>
                                <p>5. "등록하기" 클릭 시 경매가 시작됩니다.</p>
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
                                <p className="pl-4 text-sm">- 전화: <span className="text-blue-400">070-7954-7464</span></p>
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
                                <p className="pl-4">- 허위 경매 등록 (존재하지 않는 테이블 등)</p>
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
                            📧 이메일: <span className="text-blue-500 font-bold">maddawids@gmail.com</span>
                        </p>
                        <p className="text-neutral-300">
                            📞 전화: <span className="text-blue-500 font-bold">070-7954-7464</span>
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
