import { Button } from "@/components/ui/button";
import { ArrowLeft, ScrollText } from "lucide-react";
import Link from "next/link";

export default function TermsPage() {
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
                        <ScrollText className="w-6 h-6 text-amber-500" />
                        이용약관
                    </h1>
                </div>

                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-8 text-neutral-300 text-[15px] leading-relaxed font-medium">

                    {/* 제1조: 목적 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 1조 (목적)</h2>
                        <p>본 약관은 NightFlow 서비스(이하 "서비스")가 제공하는 클럽 테이블 경매 중개 서비스의 이용 조건 및 절차에 관한 기본적인 사항을 규정함을 목적으로 합니다.</p>
                    </section>

                    {/* 제2조: 용어 정의 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 2조 (용어의 정의)</h2>
                        <div className="space-y-2">
                            <p><span className="text-white font-bold">1. "회사"</span>란 NightFlow를 운영하는 사업자를 의미합니다.</p>
                            <p><span className="text-white font-bold">2. "회원"</span>이란 본 약관에 동의하고 서비스를 이용하는 자를 의미합니다.</p>
                            <p><span className="text-white font-bold">3. "MD"</span>란 클럽과 파트너십을 맺고 테이블 경매를 등록하는 마케팅 담당자를 의미합니다.</p>
                            <p><span className="text-white font-bold">4. "경매"</span>란 MD가 등록한 테이블에 대해 회원들이 입찰하는 방식의 거래를 의미합니다.</p>
                            <p><span className="text-white font-bold">5. "낙찰"</span>이란 경매 종료 시점에 가장 높은 금액을 입찰한 회원이 해당 테이블을 구매할 권리를 획득하는 것을 의미합니다.</p>
                            <p><span className="text-white font-bold">6. "노쇼"</span>란 낙찰 후 제한 시간 내에 MD에게 연락하지 않거나 방문하지 않은 경우를 의미합니다.</p>
                        </div>
                    </section>

                    {/* 제3조: 회원 가입 및 탈퇴 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 3조 (회원 가입 및 탈퇴)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 회원 자격</p>
                            <p className="pl-4">1. 본 서비스는 만 19세 이상만 이용할 수 있습니다.</p>
                            <p className="pl-4">2. 회원은 실명 및 실제 정보를 입력해야 하며, 허위 정보 입력 시 서비스 이용이 제한될 수 있습니다.</p>
                            <p className="pl-4">3. 카카오 계정 연동을 통한 간편 가입이 가능합니다.</p>

                            <p className="text-white font-bold mt-4">② 회원 탈퇴</p>
                            <p className="pl-4">1. 회원은 언제든지 마이페이지를 통해 탈퇴를 요청할 수 있습니다.</p>
                            <p className="pl-4">2. 탈퇴 시 개인정보는 즉시 삭제됩니다. (단, 법령에 따른 보관 의무가 있는 경우 예외)</p>
                            <p className="pl-4">3. 진행 중인 거래 또는 정산이 있는 경우, 해당 절차 완료 후 탈퇴가 처리됩니다.</p>
                            <p className="pl-4">4. 탈퇴 후 재가입 시 이전 계정의 스트라이크 및 경고 기록은 동일 카카오 계정 기준으로 승계됩니다.</p>
                        </div>
                    </section>

                    {/* 제4조: 서비스 이용 제한 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 4조 (서비스 이용 제한)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 경고 및 스트라이크 제도</p>
                            <p className="pl-4">1. 낙찰 취소 시 취소 시점에 따라 경고점이 부과됩니다.</p>
                            <p className="pl-6">- 즉시 취소 (낙찰 후 2분 이내): 패널티 없음</p>
                            <p className="pl-6">- Grace 취소 (연락 타이머 전반 50%): 경고 1점</p>
                            <p className="pl-6">- Late 취소 (연락 타이머 후반 50%): 경고 2점</p>
                            <p className="pl-6">- 노쇼 (타이머 만료 후 미연락): 즉시 스트라이크 1회</p>
                            <p className="pl-4">2. 경고 3점이 누적되면 스트라이크 1회로 자동 전환됩니다.</p>
                            <p className="pl-4">3. 스트라이크 누진 제재: 1회 3일 정지, 2회 14일 정지, 3회 60일 정지, 4회 영구 차단</p>

                            <p className="text-white font-bold mt-4">② 기타 이용 제한 사유</p>
                            <p className="pl-4">1. 허위 정보 입력, 타인 명의 도용, 부정한 방법으로 입찰한 경우 즉시 계정이 차단됩니다.</p>
                            <p className="pl-4">2. 회사 및 다른 회원에게 피해를 주는 행위를 한 경우 이용이 제한될 수 있습니다.</p>
                            <p className="pl-4">3. 법령 또는 본 약관을 위반한 경우 영구 차단될 수 있습니다.</p>

                            <p className="text-white font-bold mt-4">③ 이의 제기</p>
                            <p className="pl-4">1. 이용 제한에 대해 이의가 있는 경우 고객센터(maddawids@gmail.com)로 소명 자료를 제출할 수 있습니다.</p>
                            <p className="pl-4">2. 회사는 접수일로부터 7영업일 이내에 심사 결과를 통보합니다.</p>
                        </div>
                    </section>

                    {/* 제5조: 경매 규칙 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 5조 (경매 규칙)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 입찰 규칙</p>
                            <p className="pl-4">1. 모든 입찰은 취소가 불가능하므로 신중하게 입찰해주시기 바랍니다.</p>
                            <p className="pl-4">2. 입찰 금액은 현재가보다 높아야 하며, 최소 입찰 단위는 1만원입니다.</p>
                            <p className="pl-4">3. 경매 마감 3분 전 입찰 시 자동으로 3분 연장됩니다. (스나이핑 방지)</p>
                            <p className="pl-4">4. 경매 종료 시 최고가 입찰자가 자동으로 낙찰됩니다.</p>

                            <p className="text-white font-bold mt-4">② 낙찰 및 연락</p>
                            <p className="pl-4">1. 경매 종료 시 최고가 입찰자가 자동으로 낙찰됩니다.</p>
                            <p className="pl-4">2. 낙찰 후 제한 시간 내에 MD에게 연락해야 하며, 미연락 시 낙찰이 취소됩니다.</p>
                            <p className="pl-4">3. 미연락 시 스트라이크가 부과되며, 누적 시 서비스 이용이 제한됩니다.</p>

                            <p className="text-white font-bold mt-4">③ 테이블 이용</p>
                            <p className="pl-4">1. 클럽 현장 상황에 따라 테이블 위치 및 상세 구성은 소폭 변동될 수 있습니다.</p>
                            <p className="pl-4">2. 예약된 날짜 및 시간에 클럽에 방문하여 MD에게 예약 확인을 받아야 합니다.</p>
                            <p className="pl-4">3. 포함된 서비스(주류, 안주 등) 외 추가 주문은 현장에서 별도 결제됩니다.</p>
                        </div>
                    </section>

                    {/* 제6조: 금전 거래 및 수수료 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 6조 (금전 거래 및 수수료)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 거래 방식</p>
                            <p className="pl-4">1. NightFlow는 결제를 중개하지 않으며, 낙찰자와 MD 간의 직접 거래를 연결합니다.</p>
                            <p className="pl-4">2. 테이블 이용 금액은 낙찰자가 MD에게 직접 지불합니다.</p>
                            <p className="pl-4">3. 금전 거래에 관한 분쟁은 당사자 간에 해결하며, 회사는 분쟁 조정을 지원할 수 있습니다.</p>

                            <p className="text-white font-bold mt-4">② 플랫폼 수수료</p>
                            <p className="pl-4">1. 현재 NightFlow 이용에 별도 수수료는 없습니다.</p>
                            <p className="pl-4">2. 향후 수수료 정책 변경 시 사전에 공지합니다.</p>

                        </div>
                    </section>

                    {/* 제7조: 낙찰 취소 및 분쟁 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 7조 (낙찰 취소 및 분쟁)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 낙찰 취소</p>
                            <p className="pl-4">1. 낙찰자는 연락 타이머 만료 전까지 자발적으로 낙찰을 취소할 수 있습니다.</p>
                            <p className="pl-4">2. 취소 시점에 따라 제4조에 따른 경고점이 부과됩니다.</p>
                            <p className="pl-4">3. 취소된 낙찰은 차순위 입찰자에게 자동으로 이전됩니다.</p>
                            <p className="pl-4">4. 다음의 경우 회사 직권으로 취소됩니다:</p>
                            <p className="pl-6">- 클럽 측 귀책 사유 (폐업, 영업 중단, 예약 누락 등)</p>
                            <p className="pl-6">- 시스템 오류로 인한 잘못된 낙찰</p>
                            <p className="pl-6">- 타이머 만료 후 미연락 (자동 취소 + 즉시 스트라이크)</p>

                            <p className="text-white font-bold mt-4">② 금전 거래 분쟁</p>
                            <p className="pl-4">1. NightFlow는 결제를 중개하지 않으므로, 금전 거래에 관한 분쟁은 당사자(낙찰자-MD) 간에 해결합니다.</p>
                            <p className="pl-4">2. 단, MD의 부당한 행위(노쇼 허위 신고, 서비스 불이행 등)가 확인된 경우 회사가 조치할 수 있습니다.</p>
                            <p className="pl-4">3. 분쟁 발생 시 고객센터(maddawids@gmail.com)로 접수할 수 있습니다.</p>

                        </div>
                    </section>

                    {/* 제8조: 손해배상 및 면책 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 8조 (손해배상 및 면책)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 회사의 책임</p>
                            <p className="pl-4">1. 회사는 다음의 경우 손해배상 책임을 부담합니다:</p>
                            <p className="pl-6">- 시스템 오류로 인한 잘못된 낙찰</p>
                            <p className="pl-6">- 회사의 고의 또는 중대한 과실로 인한 개인정보 유출</p>
                            <p className="pl-6">- 회사의 귀책 사유로 인한 서비스 중단 (24시간 이상)</p>

                            <p className="text-white font-bold mt-4">② 회사의 면책</p>
                            <p className="pl-4">1. 다음의 경우 회사는 책임을 지지 않습니다:</p>
                            <p className="pl-6">- 클럽 내부 서비스 품질 (음식, 음료, 직원 응대 등은 MD 및 클럽의 책임)</p>
                            <p className="pl-6">- 회원 간 분쟁</p>
                            <p className="pl-6">- 천재지변, 전쟁, 정부 명령 등 불가항력 사유</p>
                            <p className="pl-6">- 제3자의 해킹, DDoS 공격 등 외부 침해 행위 (회사가 보안 조치를 다한 경우)</p>
                            <p className="pl-6">- 회원의 귀책 사유로 인한 손해 (허위 정보 입력, 노쇼 등)</p>

                            <p className="text-white font-bold mt-4">③ 배상 한도</p>
                            <p className="pl-4">1. 회사의 손해배상 책임은 직접 손해에 한정되며, 간접 손해 (기회 손실, 영업 손해 등)는 배상하지 않습니다.</p>
                            <p className="pl-4">2. 손해배상액은 최대 낙찰 금액의 2배를 초과하지 않습니다.</p>
                        </div>
                    </section>

                    {/* 제9조: 분쟁 해결 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 9조 (분쟁 해결)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 분쟁 조정 절차</p>
                            <p className="pl-4">1. <span className="text-amber-500 font-bold">1차: 고객센터 협의</span></p>
                            <p className="pl-6">- 고객센터(maddawids@gmail.com)로 분쟁 내용 접수</p>
                            <p className="pl-6">- 접수일로부터 7영업일 이내 답변</p>

                            <p className="pl-4 mt-2">2. <span className="text-amber-500 font-bold">2차: 소비자분쟁조정위원회</span></p>
                            <p className="pl-6">- 한국소비자원 1372 (www.ccn.go.kr)</p>
                            <p className="pl-6">- 조정 신청 후 30일 이내 결정</p>

                            <p className="pl-4 mt-2">3. <span className="text-amber-500 font-bold">3차: 소송</span></p>
                            <p className="pl-6">- 민사소송법에 따른 관할 법원 제기</p>

                            <p className="text-white font-bold mt-4">② 관할 법원</p>
                            <p className="pl-4">본 약관과 관련된 소송은 서울중앙지방법원을 전속 관할 법원으로 합니다.</p>

                            <p className="text-white font-bold mt-4">③ 준거법</p>
                            <p className="pl-4">본 약관의 해석 및 적용은 대한민국 법령을 따릅니다.</p>
                        </div>
                    </section>

                    {/* 제10조: 저작권 및 지식재산권 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 10조 (저작권 및 지식재산권)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 회사의 권리</p>
                            <p className="pl-4">1. 서비스의 UI/UX 디자인, 로고, 콘텐츠, 소스 코드 등의 저작권은 회사에 귀속됩니다.</p>
                            <p className="pl-4">2. 회원은 회사의 사전 서면 동의 없이 서비스 콘텐츠를 복제, 배포, 방송, 2차 저작물 제작 등에 이용할 수 없습니다.</p>

                            <p className="text-white font-bold mt-4">② 회원의 권리</p>
                            <p className="pl-4">1. 회원이 서비스에 게시한 콘텐츠(프로필 이미지, 리뷰 등)의 저작권은 회원에게 있습니다.</p>
                            <p className="pl-4">2. 단, 회원은 서비스 운영 및 홍보 목적으로 회사가 해당 콘텐츠를 사용하는 것에 동의합니다.</p>
                            <p className="pl-4">3. 회원은 언제든지 콘텐츠 삭제를 요청할 수 있으며, 회사는 즉시 삭제 조치합니다.</p>
                        </div>
                    </section>

                    {/* 제11조: 약관 변경 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">제 11조 (약관의 변경)</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 변경 절차</p>
                            <p className="pl-4">1. 회사는 약관규제법, 전자상거래법 등 관련 법령을 위반하지 않는 범위에서 본 약관을 변경할 수 있습니다.</p>
                            <p className="pl-4">2. 약관 변경 시 변경 사유 및 적용 일자를 명시하여 <span className="text-amber-500 font-bold">최소 7일 전</span> 홈페이지에 공지합니다.</p>
                            <p className="pl-4">3. 회원에게 불리한 중대한 변경인 경우 <span className="text-amber-500 font-bold">30일 전</span> 공지하며, 이메일로 개별 통지합니다.</p>

                            <p className="text-white font-bold mt-4">② 동의 간주</p>
                            <p className="pl-4">1. 회사가 공지한 약관 변경 적용일까지 회원이 명시적으로 거부 의사를 표시하지 않는 경우, 변경된 약관에 동의한 것으로 간주합니다.</p>
                            <p className="pl-4">2. 회원이 변경된 약관에 동의하지 않는 경우, 서비스 이용을 중단하고 탈퇴할 수 있습니다.</p>
                        </div>
                    </section>

                    {/* 부칙 */}
                    <section className="space-y-3 pt-8 border-t border-neutral-800">
                        <h2 className="text-lg font-black text-white">부칙</h2>
                        <div className="text-neutral-400 text-sm space-y-1">
                            <p><span className="text-white font-bold">제1조 (시행일)</span> 본 약관은 2026년 3월 1일부터 시행합니다.</p>
                            <p><span className="text-white font-bold">제2조 (경과 조치)</span> 본 약관 시행 전에 발생한 사항에 대해서는 종전 약관을 적용합니다.</p>
                        </div>

                        <div className="pt-6 text-neutral-500 text-sm space-y-1">
                            <p><span className="font-bold">공고일자:</span> 2026년 3월 1일</p>
                            <p><span className="font-bold">시행일자:</span> 2026년 3월 1일</p>
                        </div>

                        <div className="pt-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                            <p className="text-amber-500 text-sm font-bold">📋 고객센터</p>
                            <p className="text-neutral-300 text-sm mt-2">이용약관에 대한 문의사항은 고객센터로 연락 주시기 바랍니다.</p>
                            <p className="text-neutral-400 text-sm mt-1">이메일: maddawids@gmail.com</p>
                            <p className="text-neutral-400 text-sm">전화: 010-2205-1052 (평일 10:00-18:00)</p>
                        </div>
                    </section>

                </div>

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
