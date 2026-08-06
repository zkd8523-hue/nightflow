"use client";

// 로컬 프리뷰 전용 — 파티/깃발 안내 문구가 "누구에게 · 어디서 · 언제" 뜨는지 한 곳에 모았다.
// 실제 노출은 "첫 진입 1회" 같은 조건이 걸려 있어 한 번 보면 다시 못 띄운다.
// 여기서 여는 시트는 계정 플래그(share_join_guide_seen 등)를 소모하지 않는다.
// 홈 인라인 가이드 문구는 HomeContent에서 그대로 import 한다 (복사하면 갈라진다).
// /preview-guides 로 접속.

import { useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { ShareJoinGuideSheet } from "@/components/puzzles/ShareJoinGuideSheet";
import { PartyOnboardingSheet } from "@/components/home/PartyOnboardingSheet";
import { FlagOnboardingSheet } from "@/components/home/FlagOnboardingSheet";
import { OfferCreditGuideSheet } from "@/components/md/OfferCreditGuideSheet";
import {
  PUZZLE_ONBOARDING_STEPS,
  PUZZLE_ONBOARDING_STEPS_MD,
  SHARE_ONBOARDING_STEPS,
  SHARE_ONBOARDING_STEPS_MD,
} from "@/components/home/HomeContent";

type SheetKey =
  | "join-party"
  | "join-direct"
  | "party-onboarding"
  | "flag-onboarding"
  | "credit-party"
  | "credit-flag";

/* ────────────────────────────────────────────────────────────────────────── */
/* 공통 블록                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/** 한 항목의 머리말 — 어디서 / 언제 / 누가 */
function Meta({ where, when, who }: { where: string; when: string; who: string }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 mt-1.5">
      {[
        ["어디서", where],
        ["언제", when],
        ["누가", who],
      ].map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[10.5px] font-black text-muted-foreground pt-[1px]">{k}</dt>
          <dd className="text-[11.5px] font-semibold text-foreground/85 leading-snug break-keep">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Card({
  title,
  where,
  when,
  who,
  onOpen,
  children,
}: {
  title: string;
  where: string;
  when: string;
  who: string;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-black text-foreground leading-snug">{title}</p>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 h-8 px-3 rounded-full bg-amber-500 text-black text-[12px] font-black active:scale-95 transition-transform"
          >
            열어보기
          </button>
        )}
      </div>
      <Meta where={where} when={when} who={who} />
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** 상세 페이지 오퍼 안내 아코디언 — 시트가 아니라 인라인이라 그대로 옮겨 그린다 */
function OfferNotice({ summary, body }: { summary: string; body: string }) {
  return (
    <details className="group rounded-xl bg-card/50 border border-border overflow-hidden" open>
      <summary className="flex items-center gap-1.5 px-3 py-2 cursor-pointer list-none select-none text-[12px] font-bold text-brand-amber">
        ⓘ {summary}
        <span className="ml-auto text-muted-foreground group-open:rotate-180 transition-transform text-[16px] leading-none">
          ▾
        </span>
      </summary>
      <p className="px-3 pb-3 text-[12px] text-muted-foreground leading-relaxed break-keep whitespace-pre-line">
        {body}
      </p>
    </details>
  );
}

/** 홈 인라인 가이드 — 실제 렌더와 같은 카드 3장 */
function InlineSteps({
  steps,
}: {
  steps: { title: string; desc: string; icon: React.ReactNode; color: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, i) => (
        <div
          key={i}
          className="bg-muted/60 border border-border rounded-2xl p-3 flex flex-row items-center gap-3"
        >
          <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center shrink-0`}>
            {step.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-black text-foreground">{step.title}</p>
            <p className="text-[11.5px] text-muted-foreground font-semibold mt-0.5 whitespace-pre-line leading-snug">
              {step.desc}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div>
      <h2 className="text-[15px] font-black text-brand-amber">{children}</h2>
      {note && (
        <p className="text-[11.5px] text-muted-foreground font-semibold mt-0.5 leading-relaxed break-keep">
          {note}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

export default function PreviewGuidesPage() {
  const [openSheet, setOpenSheet] = useState<SheetKey | null>(null);
  const close = () => setOpenSheet(null);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-28 space-y-8">
        <header>
          <h1 className="text-[21px] font-black text-foreground tracking-tight">
            파티·깃발 안내 문구 전체 지도
          </h1>
          <p className="text-[12px] text-muted-foreground font-semibold mt-1.5 leading-relaxed break-keep">
            어떤 문구가 <span className="text-foreground font-bold">누구에게 · 어디서 · 언제</span> 뜨는지
            모았습니다. 실제로는 &ldquo;첫 진입 1회&rdquo; 조건이 걸려 한 번 보면 다시 안 뜨는데, 여기서
            여는 건 계정 기록을 남기지 않으니 몇 번이든 확인하세요.
          </p>
        </header>

        {/* ══ 1. 일반 유저 ═══════════════════════════════════════ */}
        <section className="space-y-3">
          <SectionTitle note="파티에 합류하는 쪽이 보는 문구입니다.">1. 일반 유저</SectionTitle>

          <Card
            title="파티 합류 안내 — 유저가 연 파티"
            where="파티 상세 화면"
            when="첫 진입 1회 (계정당, share_join_guide_seen)"
            who="파트너·관리자·파티장이 아닌 사람"
            onOpen={() => setOpenSheet("join-party")}
          >
            <p className="text-[11.5px] text-muted-foreground font-semibold leading-relaxed break-keep">
              오퍼가 오가는 흐름이라 4단계입니다. 이게 없으면 합류자는 어느 날 갑자기 모르는 파트너가
              단톡방에 들어온 걸 보게 됩니다.
            </p>
          </Card>

          <Card
            title="파티 합류 안내 — 파트너가 연 파티"
            where="파티 상세 · 클럽 페이지 「ⓘ 파티란?」"
            when="첫 진입 1회 (계정당) · 「ⓘ 파티란?」은 누를 때마다"
            who="파트너·관리자·파티장이 아닌 사람"
            onOpen={() => setOpenSheet("join-direct")}
          >
            <p className="text-[11.5px] text-muted-foreground font-semibold leading-relaxed break-keep">
              파트너가 직접 연 자리라 오퍼가 없습니다. 그래서 3단계로 끝납니다.
            </p>
          </Card>

          <Card
            title="파티 이용방법 (시트)"
            where="더보기 화면 파티 탭 오른쪽 「이용방법」"
            when="누를 때만"
            who="누구나"
            onOpen={() => setOpenSheet("party-onboarding")}
          />

          <Card
            title="깃발 이용방법 (시트)"
            where="더보기 화면 깃발 탭 오른쪽 「이용방법」"
            when="누를 때만"
            who="누구나"
            onOpen={() => setOpenSheet("flag-onboarding")}
          />

          <Card
            title="홈 인라인 가이드 — 유저용"
            where="홈 깃발 섹션 팁 박스 오른쪽 「이용방법」"
            when="누를 때만 (토글)"
            who="파트너·관리자가 아닌 사람"
          >
            <InlineSteps steps={PUZZLE_ONBOARDING_STEPS} />
          </Card>

          <Card
            title="홈 인라인 가이드 — 파티 탭 유저용"
            where="더보기 화면 파티 탭 가이드"
            when="누를 때만"
            who="파트너·관리자가 아닌 사람"
          >
            <InlineSteps steps={SHARE_ONBOARDING_STEPS} />
          </Card>
        </section>

        {/* ══ 2. 파트너 ══════════════════════════════════════════ */}
        <section className="space-y-3">
          <SectionTitle note="오퍼를 보내는 쪽이 보는 문구입니다.">2. 파트너</SectionTitle>

          <Card
            title="파트너 안내 — 파티"
            where="파티 상세 화면"
            when="첫 진입 1회 (계정당, offer_credit_guide_seen)"
            who="파트너·관리자 (남의 직통 파티에선 안 뜸)"
            onOpen={() => setOpenSheet("credit-party")}
          >
            <p className="text-[11.5px] text-muted-foreground font-semibold leading-relaxed break-keep">
              파티는 깃발과 상담 구조가 다릅니다. 1:1이 아니라 파티원 전원이 보는 단톡방이고, 파티당
              파트너는 한 명뿐입니다. 크레딧은 파티 것(10)만 보여줍니다.
            </p>
          </Card>

          <Card
            title="파트너 안내 — 깃발"
            where="깃발 상세 화면"
            when="첫 진입 1회 (계정당, 위와 같은 플래그)"
            who="파트너·관리자"
            onOpen={() => setOpenSheet("credit-flag")}
          >
            <p className="text-[11.5px] text-brand-amber font-bold leading-relaxed break-keep">
              ⚠ 플래그가 하나라 파티·깃발 중 먼저 본 쪽만 뜹니다. 나누려면 컬럼 추가가 필요합니다.
            </p>
          </Card>

          <Card
            title="홈 인라인 가이드 — 파트너용"
            where="홈 깃발 섹션 팁 박스 오른쪽 「이용방법」 (유저용과 같은 버튼)"
            when="누를 때만 (토글)"
            who="파트너·관리자로 로그인했을 때"
          >
            <InlineSteps steps={PUZZLE_ONBOARDING_STEPS_MD} />
          </Card>

          <Card
            title="홈 인라인 가이드 — 파티 탭 파트너용"
            where="더보기 화면 파티 탭 가이드"
            when="누를 때만"
            who="파트너·관리자"
          >
            <InlineSteps steps={SHARE_ONBOARDING_STEPS_MD} />
          </Card>

          <Card
            title="오퍼 시트 안 크레딧 안내"
            where="오퍼 작성 시트 하단"
            when="시트를 열 때마다"
            who="파트너·관리자"
          >
            <div className="rounded-xl bg-card/50 border border-border px-3 py-2.5 text-[12px] text-muted-foreground leading-relaxed">
              ✓ 뽑히면{" "}
              <strong className="text-brand-amber">파티원 전원이 있는 단톡방</strong>에서 상담해요.
              <br />
              ✓ 오퍼 전송은 무료입니다.
              <p className="text-[10.5px] text-brand-amber font-bold mt-1.5">
                첫 줄은 파티일 때만 나옵니다
              </p>
            </div>
          </Card>
        </section>

        {/* ══ 3. 상세 페이지 인라인 ═════════════════════════════ */}
        <section className="space-y-3">
          <SectionTitle note="흐린 오퍼 카드 위에 붙는 아코디언. 보는 사람에 따라 셋으로 갈립니다.">
            3. 오퍼 안내 (상세 페이지 인라인)
          </SectionTitle>

          <Card
            title="합류한 파티원이 볼 때"
            where="파티 상세, 오퍼 목록 위"
            when="항상 (접힌 상태)"
            who="합류했고 파티장이 아닌 사람"
          >
            <OfferNotice
              summary="오퍼는 채팅방에서 볼 수 있어요!"
              body={
                "여기서는 가려두지만, 채팅방에서는 클럽·금액·구성까지 전부 볼 수 있어요.\n파티원끼리 투표해서 마음에 드는 오퍼를 고를 수 있어요.\n오퍼는 이 파티 사람들만 봐요 — 다른 파트너에겐 공개되지 않아요."
              }
            />
          </Card>

          <Card
            title="아직 합류 안 한 사람이 볼 때"
            where="파티 상세, 오퍼 목록 위"
            when="항상 (접힌 상태)"
            who="합류하지 않은 사람"
          >
            <OfferNotice
              summary="오퍼는 파티원만 볼 수 있어요!"
              body={
                "오퍼는 이 파티 사람들만 봐요. 합류하면 파티원끼리 보고 투표할 수 있어요.\n파트너끼리는 서로 뭘 냈는지 몰라서, 눈치보지 않고 당일 최선의 조건이 나와요."
              }
            />
          </Card>

          <Card
            title="깃발에서 볼 때"
            where="깃발 상세, 오퍼 목록 위"
            when="항상 (접힌 상태)"
            who="깃발 주인이 아닌 사람"
          >
            <OfferNotice
              summary="오퍼는 방장님에게만 공개!"
              body={
                "다른 유저·파트너는 오퍼를 볼 수 없어요.\n클럽과 MD가 서로 눈치보지 않고, 당일 최선의 패키지를 구성합니다.\n최고의 밤을 골라보세요!"
              }
            />
            <p className="text-[11px] text-muted-foreground font-semibold mt-2 leading-relaxed break-keep">
              깃발은 1인이라 참가자가 없습니다. 그래서 여기만 &ldquo;방장&rdquo; 용어를 그대로 씁니다.
            </p>
          </Card>
        </section>

        {/* ══ 4. 파티 단톡방 ═════════════════════════════════════ */}
        <section className="space-y-3">
          <SectionTitle>4. 파티 단톡방</SectionTitle>

          <Card
            title="신규 오퍼 도착 시스템 메시지"
            where="파티 단톡방"
            when="오퍼가 들어올 때마다 (Migration 530)"
            who="단톡방에 있는 전원"
          >
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-3 space-y-2">
              <div className="rounded-xl bg-background border border-border px-3 py-2.5 flex items-center justify-between">
                <span className="text-[13px] font-bold text-foreground">
                  받은 오퍼 <span className="text-brand-amber">2</span>건
                  <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                    마음에 드는 오퍼에 투표해보세요
                  </span>
                </span>
                <span className="text-muted-foreground text-[12px]">▾</span>
              </div>
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-center">
                  <span className="text-[11px] text-muted-foreground bg-card/60 rounded-full px-3 py-1">
                    민수님이 합류했어요
                  </span>
                </div>
                <div className="flex justify-start">
                  <span className="bg-neutral-300 text-neutral-900 text-[13px] font-bold rounded-2xl rounded-tl-sm px-3 py-1.5 max-w-[82%]">
                    몇 시에 만날까요?
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground bg-card/60 rounded-full px-3 py-1">
                    🎉 신규 오퍼가 도착했어요!
                  </span>
                  {/* 기존 "이거 어때요?" 공유 카드와 같은 모양 */}
                  <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 w-[240px]">
                    <p className="text-[13px] font-bold truncate text-foreground">클럽 아레나</p>
                    <p className="text-[13px] font-black mt-0.5 text-money">
                      ₩250,000
                      <span className="ml-1.5 text-[11px] font-medium opacity-70">일반석</span>
                    </p>
                  </div>
                  <span className="text-[10.5px] text-brand-amber font-bold">
                    파트너에게는 &ldquo;오퍼가 공유됐어요&rdquo;로만 보입니다
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground font-semibold mt-2 leading-relaxed break-keep">
              카드 렌더는 기존 &ldquo;이거 어때요?&rdquo; 공유 카드를 그대로 씁니다. 그쪽이 이미
              파트너에게는 마스킹돼 있어 경쟁 오퍼가 새지 않습니다. 그리고 시스템 메시지는 안읽음
              카운트에서 빠지므로,{" "}
              <span className="text-foreground font-bold">첫 오퍼 1건에만</span> 파티원 전원에게 별도
              알림이 갑니다.
            </p>
          </Card>

          <Card
            title="채팅방으로 이동하기 버튼"
            where="파티 상세 하단 고정"
            when="항상"
            who="파티 인원 전원 — 파티장 + 합류한 파티원 (파트너 제외)"
          >
            <span className="flex items-center justify-center gap-2 w-full h-13 bg-inverse text-inverse-foreground font-black text-[15px] rounded-2xl shadow-lg">
              <MessageCircle className="w-4 h-4" />
              채팅방으로 이동하기
            </span>
            <p className="text-[11px] text-muted-foreground font-semibold mt-2 leading-relaxed break-keep">
              오퍼를 일부러 흐려두고 채팅방에서 보게 하는 구조인데, 채팅방으로 가는 길이 &ldquo;파티장 +
              오퍼 1건 이상&rdquo;일 때만 있었습니다. 파티원은 메시지 탭까지 스스로 찾아가야 했고,
              파티장도 오퍼가 아직 없으면 들어갈 길이 없었습니다.
            </p>
          </Card>
        </section>

        {/* ══ 5. 안 뜨는 것 ══════════════════════════════════════ */}
        <section className="space-y-3">
          <SectionTitle note="코드에는 있는데 화면에는 한 번도 안 나오는 것들입니다.">
            5. 죽어 있는 안내
          </SectionTitle>

          <div className="bg-card border border-border rounded-2xl p-3.5 space-y-3">
            <div>
              <p className="text-[13.5px] font-black text-foreground">SECRET_OFFER_INTRO_USER</p>
              <p className="text-[11.5px] text-muted-foreground font-semibold mt-1 leading-relaxed break-keep">
                유저용 &ldquo;시크릿오퍼란?&rdquo; 3포인트 설명. 정의만 있고 참조가 0건입니다.
                &ldquo;오퍼는 방장에게만 공개돼요&rdquo;라는 지금은 사실이 아닌 문구가 들어 있습니다.
              </p>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-[13.5px] font-black text-foreground">showTopGuide 블록</p>
              <p className="text-[11.5px] text-muted-foreground font-semibold mt-1 leading-relaxed break-keep">
                &ldquo;첫 방문 시 깃발 캐러셀 위에 뜨고 닫으면 영구 숨김&rdquo;이라고 주석에 적혀 있지만,
                상태를 <code className="text-brand-amber">true</code>로 바꾸는 코드가 어디에도 없어 렌더되지
                않습니다.
              </p>
            </div>
          </div>
        </section>

        <Link
          href="/"
          className="block text-center text-[12px] font-bold text-muted-foreground underline underline-offset-2"
        >
          홈으로
        </Link>
      </div>

      {/* 시트들 — 열릴 때만 마운트해야 manualOpen useEffect가 매번 걸린다 */}
      {openSheet === "join-party" && (
        <ShareJoinGuideSheet variant="party" manualOpen onManualClose={close} />
      )}
      {openSheet === "join-direct" && (
        <ShareJoinGuideSheet variant="direct" manualOpen onManualClose={close} />
      )}
      {openSheet === "party-onboarding" && <PartyOnboardingSheet manualOpen onManualClose={close} />}
      {openSheet === "flag-onboarding" && (
        <FlagOnboardingSheet autoShow={false} manualOpen onManualClose={close} />
      )}
      {openSheet === "credit-party" && (
        <OfferCreditGuideSheet isParty manualOpen onManualClose={close} />
      )}
      {openSheet === "credit-flag" && <OfferCreditGuideSheet manualOpen onManualClose={close} />}
    </div>
  );
}
