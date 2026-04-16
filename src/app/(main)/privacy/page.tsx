/* eslint-disable react/no-unescaped-entities */
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function PrivacyPage() {
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
                        <ShieldCheck className="w-6 h-6 text-green-500" />
                        개인정보처리방침
                    </h1>
                </div>

                <div className="bg-[#1C1C1E] border border-neutral-800 rounded-3xl p-8 space-y-8 text-neutral-300 text-[15px] leading-relaxed font-medium">

                    {/* 전문 */}
                    <section className="space-y-3">
                        <p className="text-neutral-400">
                            NightFlow(이하 "회사")는 「개인정보 보호법」 제30조에 따라 정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보 처리방침을 수립·공개합니다.
                        </p>
                    </section>

                    {/* 1. 수집하는 개인정보 항목 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">1. 수집하는 개인정보의 항목</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 회원 가입 시</p>
                            <p className="pl-4">- <span className="text-green-500 font-bold">필수:</span> 이름, 휴대전화번호, 카카오 계정 정보(ID, 프로필 이미지)</p>
                            <p className="pl-4">- <span className="text-neutral-500 font-bold">선택:</span> 없음</p>

                            <p className="text-white font-bold mt-4">② 경매 낙찰 시</p>
                            <p className="pl-4">- 낙찰 내역, 낙찰 금액, 낙찰 일시</p>
                            <p className="pl-4">- MD 연락 기록 (연락 시간, 방문 확인 여부)</p>

                            <p className="text-white font-bold mt-4">③ MD 가입 시 (추가)</p>
                            <p className="pl-4">- 인스타그램 아이디 (필수, 본인 인증 및 연락 수단)</p>
                            <p className="pl-4">- 활동 지역, 소속 클럽 정보</p>
                            <p className="pl-4">- 은행 계좌 정보 (선택)</p>
                            <p className="pl-4">- 명함 사진 (선택, 본인 인증 보조)</p>

                            <p className="text-white font-bold mt-4">④ 자동 수집 정보</p>
                            <p className="pl-4">- 접속 IP 주소, 브라우저 종류 및 버전, 운영체제</p>
                            <p className="pl-4">- 서비스 이용 기록, 접속 로그, 쿠키</p>
                            <p className="pl-4">- 기기 정보 (모바일 기종, 고유 식별자)</p>
                        </div>
                    </section>

                    {/* 2. 개인정보의 수집 및 이용 목적 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">2. 개인정보의 수집 및 이용 목적</h2>
                        <div className="space-y-2">
                            <p className="pl-4">1. <span className="text-white font-bold">회원 관리:</span> 본인 확인, 서비스 부정 이용 방지, 고객 문의 응대</p>
                            <p className="pl-4">2. <span className="text-white font-bold">서비스 제공:</span> 경매 낙찰 안내, MD 연락 연결, 예약 확인 문자 발송</p>
                            <p className="pl-4">3. <span className="text-white font-bold">마케팅 및 광고:</span> 신규 경매 알림, 이벤트 안내 (선택 동의 시)</p>
                            <p className="pl-4">4. <span className="text-white font-bold">서비스 개선:</span> 통계 분석, 서비스 품질 향상, 맞춤형 서비스 제공</p>
                            <p className="pl-4">5. <span className="text-white font-bold">MD 관리:</span> 낙찰 현황 집계, 거래 기록 관리</p>
                        </div>
                    </section>

                    {/* 3. 개인정보의 제3자 제공 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">3. 개인정보의 제3자 제공</h2>
                        <p>회사는 원칙적으로 정보주체의 개인정보를 제1조에서 명시한 범위 내에서 처리하며, 다음의 경우에만 제3자에게 제공합니다:</p>

                        <div className="overflow-x-auto mt-4">
                            <table className="w-full text-sm border border-neutral-700 rounded-lg overflow-hidden">
                                <thead className="bg-neutral-900">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-white font-bold border-b border-neutral-700">제공받는 자</th>
                                        <th className="px-4 py-3 text-left text-white font-bold border-b border-neutral-700">제공 항목</th>
                                        <th className="px-4 py-3 text-left text-white font-bold border-b border-neutral-700">이용 목적</th>
                                        <th className="px-4 py-3 text-left text-white font-bold border-b border-neutral-700">보유 기간</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-neutral-800">
                                        <td className="px-4 py-3 text-green-500 font-bold">SOLAPI</td>
                                        <td className="px-4 py-3">전화번호</td>
                                        <td className="px-4 py-3">알림톡 발송</td>
                                        <td className="px-4 py-3">발송 후 즉시 삭제</td>
                                    </tr>
                                    <tr className="border-b border-neutral-800">
                                        <td className="px-4 py-3 text-green-500 font-bold">해당 클럽 MD</td>
                                        <td className="px-4 py-3">이름, 전화번호</td>
                                        <td className="px-4 py-3">현장 예약 확인</td>
                                        <td className="px-4 py-3">이벤트 종료 후 7일</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 text-green-500 font-bold">Supabase (AWS)</td>
                                        <td className="px-4 py-3">전체 데이터</td>
                                        <td className="px-4 py-3">서버 호스팅</td>
                                        <td className="px-4 py-3">회원 탈퇴 시 삭제</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <p className="mt-4 text-sm text-neutral-400">
                            ※ 위 제3자 제공은 서비스 제공에 필수적이며, 동의를 거부할 경우 서비스 이용이 제한될 수 있습니다.
                        </p>
                    </section>

                    {/* 4. 개인정보의 보유 및 이용 기간 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">4. 개인정보의 보유 및 이용 기간</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 원칙</p>
                            <p className="pl-4">회원 탈퇴 시 지체 없이 파기합니다. 단, 다음의 경우 명시한 기간 동안 보관합니다:</p>

                            <p className="text-white font-bold mt-4">② 법령에 따른 보관 (전자상거래법)</p>
                            <p className="pl-4">- <span className="text-amber-500 font-bold">계약 또는 청약철회 기록:</span> 5년</p>
                            <p className="pl-4">- <span className="text-amber-500 font-bold">소비자 불만 또는 분쟁 처리 기록:</span> 3년</p>
                            <p className="pl-4">- <span className="text-amber-500 font-bold">표시·광고 기록:</span> 6개월</p>

                            <p className="text-white font-bold mt-4">③ 내부 정책에 따른 보관</p>
                            <p className="pl-4">- <span className="text-amber-500 font-bold">부정 이용 기록:</span> 영구 보관 (재발 방지 목적)</p>
                            <p className="pl-4">- <span className="text-amber-500 font-bold">노쇼 기록:</span> 1년 (서비스 품질 유지 목적)</p>
                            <p className="pl-4">- <span className="text-amber-500 font-bold">접속 로그:</span> 3개월 (통신비밀보호법)</p>
                        </div>
                    </section>

                    {/* 5. 개인정보의 파기 절차 및 방법 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">5. 개인정보의 파기 절차 및 방법</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 파기 절차</p>
                            <p className="pl-4">1. 회원 탈퇴 또는 보유 기간 만료 시 개인정보보호책임자의 승인 하에 파기합니다.</p>
                            <p className="pl-4">2. 법령에 따라 보관해야 하는 정보는 별도 DB로 이관하여 관리합니다.</p>

                            <p className="text-white font-bold mt-4">② 파기 방법</p>
                            <p className="pl-4">- <span className="text-green-500 font-bold">전자 파일:</span> 복구 불가능한 방법으로 영구 삭제 (Low Level Format)</p>
                            <p className="pl-4">- <span className="text-green-500 font-bold">종이 문서:</span> 분쇄기로 분쇄 또는 소각</p>
                        </div>
                    </section>

                    {/* 6. 정보주체의 권리·의무 및 행사 방법 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">6. 정보주체의 권리·의무 및 행사 방법</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 권리</p>
                            <p className="pl-4">정보주체(회원)는 언제든지 다음의 권리를 행사할 수 있습니다:</p>
                            <p className="pl-6">1. 개인정보 열람 요구</p>
                            <p className="pl-6">2. 개인정보 정정·삭제 요구 (단, 법령에 따라 보관해야 하는 정보는 삭제 불가)</p>
                            <p className="pl-6">3. 개인정보 처리 정지 요구</p>

                            <p className="text-white font-bold mt-4">② 행사 방법</p>
                            <p className="pl-4">- <span className="text-green-500 font-bold">웹사이트:</span> 마이페이지 → 개인정보 관리</p>
                            <p className="pl-4">- <span className="text-green-500 font-bold">이메일:</span> maddawids@gmail.com</p>
                            <p className="pl-4">- <span className="text-green-500 font-bold">전화:</span> 070-7954-7464 (평일 10:00-18:00)</p>

                            <p className="text-white font-bold mt-4">③ 처리 기한</p>
                            <p className="pl-4">회사는 정보주체의 요청을 받은 날로부터 <span className="text-amber-500 font-bold">10일 이내</span>에 조치하고 그 결과를 통지합니다.</p>

                            <p className="text-white font-bold mt-4">④ 대리인 행사</p>
                            <p className="pl-4">법정대리인 또는 위임받은 자를 통해 권리를 행사할 수 있으며, 이 경우 위임장 및 신분증 사본을 제출해야 합니다.</p>
                        </div>
                    </section>

                    {/* 7. 개인정보의 안전성 확보 조치 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">7. 개인정보의 안전성 확보 조치</h2>
                        <div className="space-y-2">
                            <p className="pl-4">회사는 개인정보 보호법 제29조에 따라 다음과 같이 안전성 확보에 필요한 기술적·관리적 조치를 하고 있습니다:</p>

                            <p className="text-white font-bold mt-4">① 기술적 조치</p>
                            <p className="pl-4">1. 개인정보 암호화 (AES-256, TLS 1.3)</p>
                            <p className="pl-4">2. 해킹 등 외부 침입 방지 (방화벽, IDS)</p>
                            <p className="pl-4">3. 백신 프로그램 설치 및 주기적 업데이트</p>
                            <p className="pl-4">4. 개인정보 접근 통제 및 로그 기록 (최소 6개월 보관)</p>

                            <p className="text-white font-bold mt-4">② 관리적 조치</p>
                            <p className="pl-4">1. 개인정보 취급 직원 최소화 및 정기 교육</p>
                            <p className="pl-4">2. 개인정보보호책임자 지정 및 운영</p>
                            <p className="pl-4">3. 내부 관리 계획 수립 및 시행</p>
                        </div>
                    </section>

                    {/* 8. 개인정보보호책임자 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">8. 개인정보보호책임자</h2>
                        <div className="space-y-2">
                            <p>회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 정보주체의 불만 처리 및 피해구제 등을 위하여 아래와 같이 개인정보보호책임자를 지정하고 있습니다.</p>

                            <div className="mt-4 bg-green-500/10 border border-green-500/20 rounded-xl p-6 space-y-3">
                                <div>
                                    <p className="text-green-500 font-bold text-sm">개인정보보호책임자</p>
                                    <p className="text-white font-bold mt-1">김민기</p>
                                    <p className="text-neutral-400 text-sm">직책: 대표 (CEO)</p>
                                </div>
                                <div className="pt-3 border-t border-neutral-700">
                                    <p className="text-neutral-400 text-sm">📧 이메일: maddawids@gmail.com</p>
                                    <p className="text-neutral-400 text-sm mt-1">📞 전화: 070-7954-7464 (평일 10:00-18:00)</p>
                                    <p className="text-neutral-400 text-sm mt-1">📍 주소: 부산광역시 연제구 쌍미천로 129번길 21, 4층</p>
                                </div>
                            </div>

                            <p className="text-white font-bold mt-6">개인정보 침해 신고 및 상담</p>
                            <p className="pl-4 text-neutral-400 text-sm">개인정보 침해에 대한 신고나 상담이 필요하신 경우 아래 기관에 문의하실 수 있습니다:</p>
                            <div className="pl-4 mt-2 space-y-1 text-sm">
                                <p>1. <span className="text-green-500 font-bold">개인정보침해신고센터</span> (한국인터넷진흥원)</p>
                                <p className="pl-4 text-neutral-400">- 전화: (국번없이) 118</p>
                                <p className="pl-4 text-neutral-400">- 웹사이트: privacy.kisa.or.kr</p>

                                <p className="mt-3">2. <span className="text-green-500 font-bold">개인정보분쟁조정위원회</span></p>
                                <p className="pl-4 text-neutral-400">- 전화: 1833-6972</p>
                                <p className="pl-4 text-neutral-400">- 웹사이트: www.kopico.go.kr</p>

                                <p className="mt-3">3. <span className="text-green-500 font-bold">대검찰청 사이버범죄수사단</span></p>
                                <p className="pl-4 text-neutral-400">- 전화: (국번없이) 1301</p>
                                <p className="pl-4 text-neutral-400">- 웹사이트: cybercid.spo.go.kr</p>

                                <p className="mt-3">4. <span className="text-green-500 font-bold">경찰청 사이버안전국</span></p>
                                <p className="pl-4 text-neutral-400">- 전화: (국번없이) 182</p>
                                <p className="pl-4 text-neutral-400">- 웹사이트: cyberbureau.police.go.kr</p>
                            </div>
                        </div>
                    </section>

                    {/* 9. 쿠키 및 자동 수집 장치 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">9. 쿠키(Cookie) 및 자동 수집 장치</h2>
                        <div className="space-y-2">
                            <p className="text-white font-bold">① 쿠키란?</p>
                            <p className="pl-4">쿠키는 웹사이트가 귀하의 브라우저로 전송하는 소량의 텍스트 파일로, 귀하의 컴퓨터 하드디스크에 저장됩니다.</p>

                            <p className="text-white font-bold mt-4">② 쿠키 사용 목적</p>
                            <p className="pl-4">1. 로그인 상태 유지 (세션 쿠키)</p>
                            <p className="pl-4">2. 서비스 이용 패턴 분석 및 맞춤형 서비스 제공</p>
                            <p className="pl-4">3. 방문 빈도 파악 및 마케팅 활용</p>

                            <p className="text-white font-bold mt-4">③ 쿠키 거부 방법</p>
                            <p className="pl-4">브라우저 설정에서 쿠키를 차단할 수 있습니다:</p>
                            <p className="pl-6 text-sm text-neutral-400">- Chrome: 설정 → 개인정보 및 보안 → 쿠키 및 기타 사이트 데이터</p>
                            <p className="pl-6 text-sm text-neutral-400">- Safari: 환경설정 → 개인정보 보호 → 쿠키 차단</p>
                            <p className="pl-6 text-sm text-neutral-400">- Firefox: 설정 → 개인정보 및 보안 → 쿠키 및 사이트 데이터</p>

                            <p className="pl-4 mt-2 text-sm text-amber-500">※ 쿠키 차단 시 로그인 유지 등 일부 기능이 제한될 수 있습니다.</p>

                            <p className="text-white font-bold mt-4">④ 추적 방지 (Do Not Track)</p>
                            <p className="pl-4">Google Analytics 사용 시 IP 익명화 및 추적 방지 옵션을 적용합니다.</p>
                        </div>
                    </section>

                    {/* 10. 만 14세 미만 아동의 개인정보 보호 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">10. 만 14세 미만 아동의 개인정보 보호</h2>
                        <div className="space-y-2">
                            <p className="pl-4">1. 본 서비스는 <span className="text-amber-500 font-bold">만 19세 이상</span>만 이용할 수 있으며, 만 14세 미만 아동의 개인정보는 원칙적으로 수집하지 않습니다.</p>
                            <p className="pl-4">2. 부득이하게 만 14세 미만 아동의 개인정보를 수집해야 하는 경우, 법정대리인의 동의를 받아 처리합니다.</p>
                            <p className="pl-4">3. 만 14세 미만 아동의 개인정보를 수집한 사실을 인지한 경우 즉시 해당 정보를 삭제합니다.</p>
                        </div>
                    </section>

                    {/* 11. 개인정보처리방침의 변경 */}
                    <section className="space-y-3">
                        <h2 className="text-lg font-black text-white">11. 개인정보처리방침의 변경</h2>
                        <div className="space-y-2">
                            <p className="pl-4">1. 본 개인정보처리방침은 법령·정책 또는 보안기술의 변경에 따라 내용이 추가·삭제 및 수정될 수 있습니다.</p>
                            <p className="pl-4">2. 개인정보처리방침 변경 시 변경 사항을 <span className="text-amber-500 font-bold">최소 7일 전</span> 홈페이지를 통해 공지합니다.</p>
                            <p className="pl-4">3. 회원에게 불리한 중대한 변경인 경우 <span className="text-amber-500 font-bold">30일 전</span> 공지하며, 이메일로 개별 통지합니다.</p>
                        </div>
                    </section>

                    {/* 시행일 */}
                    <section className="space-y-3 pt-8 border-t border-neutral-800">
                        <div className="text-neutral-500 text-sm space-y-1">
                            <p><span className="text-white font-bold">공고일자:</span> 2026년 3월 1일</p>
                            <p><span className="text-white font-bold">시행일자:</span> 2026년 3월 1일</p>
                        </div>

                        <div className="pt-6 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                            <p className="text-green-500 text-sm font-bold">🔒 개인정보보호 문의</p>
                            <p className="text-neutral-300 text-sm mt-2">개인정보 처리에 대한 문의사항은 개인정보보호책임자에게 연락 주시기 바랍니다.</p>
                            <p className="text-neutral-400 text-sm mt-1">이메일: maddawids@gmail.com</p>
                            <p className="text-neutral-400 text-sm">전화: 070-7954-7464 (평일 10:00-18:00)</p>
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
