"use client";

import { useState, useTransition } from "react";
import { TrendingDown, Target, BarChart3, Globe2, ArrowRight, ChevronDown, Users } from "lucide-react";
import { fetchVisitorJourney, type JourneyEvent } from "./actions";

// event_name → 한국어 라벨 매핑. 없으면 원본 반환.
const EVENT_LABELS: Record<string, string> = {
  // 홈·랜딩
  home_view: "홈 진입",
  en_home_view: "🌍 /en 홈 진입",
  ja_home_view: "🌍 /ja 홈 진입",
  zh_home_view: "🌍 /zh 홈 진입",
  // 클럽·리스트
  foreign_clubs_view: "🌍 클럽 목록 조회",
  foreign_club_card_click: "🌍 클럽 카드 클릭",
  foreign_book_at_club_click: "🌍 클럽 예약 CTA",
  foreign_plant_flag_click: "🌍 깃발 등록 CTA",
  foreign_login_view: "🌍 로그인 페이지",
  foreign_login_success: "🌍 로그인 성공",
  // 로그인
  login_view: "로그인 페이지",
  login_click_kakao: "카카오 로그인 클릭",
  login_click_google: "구글 로그인 클릭",
  login_click_apple: "애플 로그인 클릭",
  login_success: "로그인 성공",
  // 회원가입
  signup_start: "회원가입 시작",
  signup_agree: "약관 동의",
  signup_phone_verified: "폰 인증 완료",
  signup_completed: "회원가입 완료",
  // 깃발
  flag_form_view: "깃발 폼 진입",
  flag_created: "깃발 등록 완료",
  puzzle_form_view: "깃발 폼 진입",
  puzzle_created: "깃발 등록 완료",
  // 홈 CTA
  home_cta_click: "홈 CTA 클릭",
};

function labelEvent(name: string): string {
  return EVENT_LABELS[name] || name;
}

// 언어 코드 → 국기·이름
const LANG_LABELS: Record<string, string> = {
  ko: "🇰🇷 한국어",
  en: "🇺🇸 English",
  ja: "🇯🇵 日本語",
  zh: "🇨🇳 中文",
  "zh-tw": "🇹🇼 繁體",
  "zh-TW": "🇹🇼 繁體",
  unknown: "❓ 미확인",
};

interface Props {
  hotspots: {
    last_event: string;
    session_count: number;
    unique_users: number;
    pct: number;
    avg_duration_sec: number;
    avg_event_count: number;
  }[];
  funnel: {
    step1_start: number;
    step2_agree: number;
    step3_completed: number;
    agree_rate: number | null;
    complete_rate: number | null;
    overall_rate: number | null;
  } | null;
  acquisition: {
    source: string;
    session_count: number;
    unique_users: number;
    avg_duration_sec: number;
    avg_events: number;
    login_count: number;
    flag_count: number;
    login_rate: number | null;
    flag_rate: number | null;
    bounce_rate: number | null;
  }[];
  byLang: {
    lang: string;
    last_event: string;
    session_count: number;
    total_sessions: number;
    pct: number;
  }[];
  // Migration 658 — 외국인 전환 대시보드. 비율은 전부 "랜딩 대비"다.
  foreignFunnel: {
    lang: string;
    landed: number;
    cta_clicked: number;
    form_viewed: number;
    gate_passed: number;
    submitted: number;
    cta_rate: number | null;
    form_rate: number | null;
    gate_rate: number | null;
    submit_rate: number | null;
  }[];
  foreignExits: {
    path: string;
    lang: string;
    page_kind: string | null;
    exits: number;
    avg_scroll_depth: number | null;
    avg_time_sec: number | null;
  }[];
  // Migration 660 — 사람(anon_id) 단위. 폼 이상 도달한 사람만.
  foreignVisitors: {
    anon_id: string;
    lang: string;
    stage: number;
    stage_label: string;
    visits: number;
    events: number;
    first_seen: string;
    last_seen: string;
    utm_source: string | null;
    landing_path: string | null;
  }[];
}

/** 방문자 한 줄 — 누르면 저니가 펼쳐진다. 저니는 클릭 시점에 그 사람 것만 조회. */
function VisitorRow({
  v,
  color,
}: {
  v: Props["foreignVisitors"][number];
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const [journey, setJourney] = useState<JourneyEvent[] | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // 처음 펼칠 때만 조회. 다시 접었다 펴면 캐시된 걸 쓴다.
    if (next && journey === null) {
      start(async () => setJourney(await fetchVisitorJourney(v.anon_id)));
    }
  };

  const stageColor =
    v.stage >= 5 ? "text-emerald-400" : v.stage === 4 ? "text-brand-amber" : "text-muted-foreground";

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full grid grid-cols-[16px_60px_56px_1fr_64px_88px] gap-2 items-center py-2.5 text-xs text-left hover:bg-muted/40 transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        <span className="font-bold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
          {v.lang}
        </span>
        <span className={`font-black ${stageColor}`}>{v.stage_label}</span>
        <span className="text-muted-foreground truncate">
          {v.landing_path ?? "—"}
          {v.utm_source && v.utm_source !== "direct" && (
            <span className="ml-2 text-brand-amber">· {v.utm_source}</span>
          )}
        </span>
        <span className="text-muted-foreground tabular-nums text-right">
          {v.visits}회 · {v.events}건
        </span>
        <span className="text-muted-foreground tabular-nums text-right">
          {v.last_seen.slice(5, 16).replace("T", " ")}
        </span>
      </button>

      {open && (
        <div className="pb-3 pl-6 pr-2">
          {pending || journey === null ? (
            <p className="text-[11px] text-muted-foreground py-2">저니 불러오는 중…</p>
          ) : journey.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">이벤트가 없습니다.</p>
          ) : (
            <ol className="space-y-0.5 border-l border-border pl-3">
              {journey.map((e, i) => {
                // 세션이 바뀌는 지점에 구분선 — "다른 날 다시 왔다"가 보이게
                const newSession = i > 0 && e.session_id !== journey[i - 1].session_id;
                const isSubmit = e.event_name === "foreign_request_submitted";
                const isExit = e.event_name === "foreign_page_exit";
                const depth = isExit ? e.properties?.scroll_depth : undefined;
                const sec = isExit ? e.properties?.time_on_page_sec : undefined;
                return (
                  <li key={i}>
                    {newSession && (
                      <div className="text-[10px] text-brand-amber font-bold py-1 -ml-3 pl-3 border-t border-dashed border-border mt-1">
                        ↻ 재방문 · {e.created_at.slice(5, 16).replace("T", " ")}
                      </div>
                    )}
                    <div className={`grid grid-cols-[52px_1fr] gap-2 text-[11px] py-0.5 ${isSubmit ? "text-emerald-400 font-bold" : "text-muted-foreground"}`}>
                      <span className="tabular-nums">{e.created_at.slice(11, 19)}</span>
                      <span className="truncate">
                        <span className={isSubmit ? "" : "text-foreground"}>{labelEvent(e.event_name)}</span>
                        {e.path && <span className="ml-2 opacity-70">{e.path}</span>}
                        {isExit && (
                          <span className="ml-2 opacity-70">
                            깊이 {String(depth)}% · {String(sec)}초
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// 언어별 고정색 — 어느 차트에서든 같은 색 = 같은 언어로 읽히게.
const LANG_COLOR: Record<string, string> = {
  en: "#f2a2c0",
  ja: "#6fd7f5",
  zh: "#a99cf0",
  "zh-tw": "#8ee9b8",
  "zh-TW": "#8ee9b8",
};
const langColor = (lang: string) => LANG_COLOR[lang] ?? "#9aa0d0";

/** 도넛 게이지 — stroke-dasharray로 그린다(차트 라이브러리 불필요). */
function Donut({
  pct,
  color,
  label,
  sub,
}: {
  pct: number;
  color: string;
  label: string;
  sub: string;
}) {
  const R = 47;
  const C = 2 * Math.PI * R; // 295.3
  // 값이 0이면 링을 아예 안 그린다 — 0%인데 점이 찍혀 있으면 오해를 부른다.
  const offset = pct > 0 ? C - (C * Math.min(pct, 100)) / 100 : C;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="116" height="116" viewBox="0 0 116 116" role="img" aria-label={`${label} ${pct}%`}>
        <circle cx="58" cy="58" r={R} fill="none" stroke="currentColor" strokeWidth="11" className="text-muted" />
        {pct > 0 && (
          <circle
            cx="58" cy="58" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 58 58)"
          />
        )}
        <text x="58" y="55" textAnchor="middle" fontSize="20" fontWeight="800"
              fill={pct > 0 ? "currentColor" : "#ff6b8a"} className={pct > 0 ? "text-foreground" : ""}>
          {pct > 0 ? `${pct}%` : "0%"}
        </text>
        <text x="58" y="72" textAnchor="middle" fontSize="10" fill="currentColor" className="text-muted-foreground">
          {sub}
        </text>
      </svg>
      <span className="text-[13px] font-bold flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
        {label}
      </span>
    </div>
  );
}

export function InsightsClient({
  hotspots, funnel, acquisition, byLang, foreignFunnel, foreignExits, foreignVisitors,
}: Props) {
  // 방문자 목록 언어 필터. null = 전체.
  const [visitorLang, setVisitorLang] = useState<string | null>(null);
  const visibleVisitors = visitorLang
    ? foreignVisitors.filter((v) => v.lang === visitorLang)
    : foreignVisitors;
  // 필터 칩에 쓸 언어 목록 — 목록에 실제로 있는 것만
  const visitorLangs = Array.from(new Set(foreignVisitors.map((v) => v.lang)));
  const maxHotspot = Math.max(...hotspots.map((h) => h.session_count), 1);

  // 언어별로 그룹핑
  const langGroups: Record<string, typeof byLang> = {};
  for (const row of byLang) {
    if (!langGroups[row.lang]) langGroups[row.lang] = [];
    langGroups[row.lang].push(row);
  }

  return (
    <div className="space-y-10">
      {/* ============================================ */}
      {/* Section 1: 이탈 지점 TOP 10 (막대 그래프) */}
      {/* ============================================ */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <h2 className="text-xl font-black tracking-tight">이탈 지점 TOP 10</h2>
            <span className="text-xs text-muted-foreground font-medium">
              (세션의 마지막 이벤트 기준)
            </span>
          </div>
          {hotspots.length > 0 && (
            <span className="text-xs text-muted-foreground">
              총 <b className="text-foreground">{hotspots.reduce((sum, h) => sum + h.session_count, 0)}</b>개 세션
            </span>
          )}
        </div>
        {hotspots.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">최근 7일 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {hotspots.map((h, idx) => (
              <div key={h.last_event} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-muted-foreground font-bold w-6 shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="text-foreground font-bold truncate" title={h.last_event}>
                      {labelEvent(h.last_event)}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                      {h.last_event}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>
                      <b className="text-foreground">{h.session_count}</b>세션
                    </span>
                    <span>{h.unique_users}명</span>
                    <span className="font-bold text-red-400 w-12 text-right">
                      {h.pct}%
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-card rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all"
                    style={{ width: `${(h.session_count / maxHotspot) * 100}%` }}
                  />
                </div>
                <div className="flex gap-4 text-[10px] text-muted-foreground ml-8">
                  <span>평균 {Math.round(h.avg_duration_sec)}초</span>
                  <span>평균 {h.avg_event_count}개 이벤트</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* Section 2: 회원가입 퍼널 시각화 */}
      {/* ============================================ */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-black tracking-tight">회원가입 퍼널</h2>
            <span className="text-xs text-muted-foreground font-medium">
              (세션 단위)
            </span>
          </div>
          {funnel && funnel.step1_start > 0 && (
            <span className="text-xs text-muted-foreground">
              표본 <b className="text-foreground">{funnel.step1_start}</b>개 세션
            </span>
          )}
        </div>
        {funnel && funnel.step1_start > 0 && funnel.step1_start < 30 && (
          <p className="text-[11px] text-brand-amber mb-4 flex items-center gap-1">
            ⚠️ 표본이 적어 통계적 유의성 낮음 (30개 이상 권장)
          </p>
        )}
        {!funnel || funnel.step1_start === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">최근 7일 회원가입 시도가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {[
              { label: "① 회원가입 시작", value: funnel.step1_start, rate: null, isFirst: true },
              { label: "② 약관 동의", value: funnel.step2_agree, rate: funnel.agree_rate },
              { label: "③ 회원가입 완료", value: funnel.step3_completed, rate: funnel.complete_rate },
            ].map((step, idx) => {
              const width = funnel.step1_start
                ? (step.value / funnel.step1_start) * 100
                : 0;
              const isDropoff = step.rate !== null && step.rate < 70;
              return (
                <div key={step.label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{step.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-sm">
                        <b className="text-foreground text-lg">{step.value}</b> 세션
                      </span>
                      {step.rate !== null && (
                        <span className="text-right leading-tight">
                          <span
                            className={`block text-sm font-bold ${
                              isDropoff ? "text-red-400" : "text-emerald-400"
                            }`}
                          >
                            {step.rate}%
                          </span>
                          {/* 막대 안 %(전체 1단계 대비 누적)와 분모가 다름 — 이 배지는 직전 단계 대비.
                              라벨 없이 나란히 두면 같은 지표의 오차처럼 보여 혼동 유발(예: 63% vs 69%). */}
                          <span className="block text-[9px] font-normal text-muted-foreground/70">
                            직전 단계 대비
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-6 bg-card rounded-lg overflow-hidden">
                    <div
                      className={`h-full rounded-lg transition-all flex items-center justify-end pr-2 ${
                        step.isFirst
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                          : isDropoff
                          ? "bg-gradient-to-r from-red-500 to-red-400"
                          : "bg-gradient-to-r from-emerald-500 to-emerald-400"
                      }`}
                      style={{ width: `${width}%` }}
                    >
                      {width > 15 && (
                        <span className="text-[10px] font-bold text-black">
                          {width.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {idx < 2 && step.rate !== null && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" />
                      이 단계에서 <b className="text-red-400">{100 - (step.rate ?? 0)}%</b> 이탈
                    </p>
                  )}
                </div>
              );
            })}
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-muted-foreground text-sm">전체 전환률</span>
              <span className="text-2xl font-black text-emerald-400">
                {funnel.overall_rate ?? 0}%
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* Section 3: UTM 소스별 유입 품질 */}
      {/* ============================================ */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-black tracking-tight">유입 채널 품질</h2>
            <span className="text-xs text-muted-foreground font-medium">
              (UTM source별)
            </span>
          </div>
          {acquisition.length > 0 && (
            <span className="text-xs text-muted-foreground">
              총 <b className="text-foreground">{acquisition.reduce((sum, a) => sum + a.session_count, 0)}</b>개 세션
            </span>
          )}
        </div>
        {acquisition.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">최근 7일 세션 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold text-muted-foreground uppercase tracking-tight">
                  <th className="p-3">Source</th>
                  <th className="p-3 text-right">세션</th>
                  <th className="p-3 text-right">유니크</th>
                  <th className="p-3 text-right">평균 시간</th>
                  <th className="p-3 text-right">Bounce</th>
                  <th className="p-3 text-right">로그인률</th>
                  <th className="p-3 text-right">깃발률</th>
                </tr>
              </thead>
              <tbody>
                {acquisition.map((a) => (
                  <tr
                    key={a.source}
                    className="border-b border-border hover:bg-card/50 transition-colors"
                  >
                    <td className="p-3 font-bold text-foreground">{a.source}</td>
                    <td className="p-3 text-right font-bold">{a.session_count}</td>
                    <td className="p-3 text-right text-muted-foreground">{a.unique_users}</td>
                    <td className="p-3 text-right text-muted-foreground">
                      {Math.floor((a.avg_duration_sec ?? 0) / 60)}:
                      {String((a.avg_duration_sec ?? 0) % 60).padStart(2, "0")}
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={`font-bold ${
                          (a.bounce_rate ?? 0) > 50
                            ? "text-red-400"
                            : (a.bounce_rate ?? 0) > 30
                            ? "text-brand-amber"
                            : "text-emerald-400"
                        }`}
                      >
                        {a.bounce_rate ?? 0}%
                      </span>
                    </td>
                    <td className="p-3 text-right text-emerald-400 font-bold">
                      {a.login_rate ?? 0}%
                    </td>
                    <td className="p-3 text-right text-blue-400 font-bold">
                      {a.flag_rate ?? 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground mt-3">
              💡 Bounce = 이벤트 1개짜리 세션 (즉시 이탈). 낮을수록 좋음. 로그인률·깃발률은 세션 대비 전환 %.
            </p>
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* Section 4: 언어별 이탈 지점 */}
      {/* ============================================ */}
      <section className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-brand-amber" />
            <h2 className="text-xl font-black tracking-tight">언어별 이탈 지점</h2>
            <span className="text-xs text-muted-foreground font-medium">
              (외국인 트랙 진단)
            </span>
          </div>
          {Object.keys(langGroups).length > 0 && (
            <span className="text-xs text-muted-foreground">
              총 <b className="text-foreground">{Object.values(langGroups).reduce((sum, rows) => sum + (rows[0]?.total_sessions ?? 0), 0)}</b>개 세션
            </span>
          )}
        </div>
        {Object.keys(langGroups).length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">최근 7일 데이터가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(langGroups).map(([lang, rows]) => {
              const totalSessions = rows[0]?.total_sessions ?? 0;
              return (
                <div
                  key={lang}
                  className="bg-card/50 border border-border rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-black text-foreground">
                      {LANG_LABELS[lang] || lang}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      총 <b className="text-foreground">{totalSessions}</b> 세션
                    </span>
                  </div>
                  <div className="space-y-2">
                    {rows.map((r, idx) => (
                      <div key={`${r.last_event}-${idx}`} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <span className="text-muted-foreground shrink-0">
                              {idx + 1}.
                            </span>
                            <span className="text-foreground truncate">
                              {labelEvent(r.last_event)}
                            </span>
                          </div>
                          <span className="text-brand-amber font-bold shrink-0">
                            {r.pct}%
                          </span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden ml-4">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${r.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* Section 5: 외국인 예약 전환 (Migration 658)   */}
      {/* 요약 도넛 → 단계 막대 → 원인(CTA·이탈 경로)  */}
      {/* ============================================ */}
      <section className="bg-card border border-border rounded-2xl p-6 space-y-8">
        <div className="flex items-center gap-2 flex-wrap">
          <Globe2 className="w-5 h-5 text-brand-amber" />
          <h2 className="text-xl font-black tracking-tight">외국인 예약 전환</h2>
          <span className="text-xs text-muted-foreground font-medium">
            최근 60일 · 랜딩 대비 비율
          </span>
        </div>

        {foreignFunnel.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            데이터가 없습니다. Migration 658이 적용됐는지 확인하세요.
          </p>
        ) : (
          <>
            {/* ── 나라별 전환율 도넛 ── */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                나라별 예약 전환율
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {foreignFunnel.map((f) => (
                  <Donut
                    key={f.lang}
                    pct={Number(f.submit_rate ?? 0)}
                    color={langColor(f.lang)}
                    label={LANG_LABELS[f.lang] ?? f.lang}
                    sub={`${f.submitted} / ${f.landed}`}
                  />
                ))}
              </div>
              {/* 표본이 적을 때 0%를 "나쁘다"로 오독하는 걸 막는다 */}
              {foreignFunnel.reduce((s, f) => s + f.submitted, 0) < 30 && (
                <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
                  제출 총{" "}
                  <b className="text-foreground">
                    {foreignFunnel.reduce((s, f) => s + f.submitted, 0)}
                  </b>
                  건 — 전환율로 판단하기엔 표본이 적습니다. 30건이 쌓이기 전까진 아래{" "}
                  <b className="text-foreground">CTA 클릭률</b>을 대신 보세요.
                </p>
              )}
            </div>

            {/* ── 언어별 단계 막대 ── */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                단계 통과율{" "}
                <span className="normal-case tracking-normal font-medium">
                  — 각 언어의 랜딩을 100%로 본 값
                </span>
              </p>
              <div className="space-y-5">
                {foreignFunnel.map((f) => {
                  const color = langColor(f.lang);
                  const steps: [string, number, number, number][] = [
                    ["랜딩", f.landed, 100, 1],
                    ["CTA", f.cta_clicked, Number(f.cta_rate ?? 0), 0.72],
                    ["폼", f.form_viewed, Number(f.form_rate ?? 0), 0.54],
                    ["게이트", f.gate_passed, Number(f.gate_rate ?? 0), 0.38],
                    ["제출", f.submitted, Number(f.submit_rate ?? 0), 1],
                  ];
                  return (
                    <div key={f.lang} className="grid md:grid-cols-[86px_1fr] gap-3 items-center">
                      <span className="text-[13px] font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                        {LANG_LABELS[f.lang] ?? f.lang}
                      </span>
                      <div className="space-y-1">
                        {steps.map(([name, count, pct, op], i) => (
                          <div
                            key={name}
                            className="grid grid-cols-[52px_1fr_92px] gap-2 items-center text-[11px]"
                          >
                            <span className="text-muted-foreground text-right">{name}</span>
                            <div className="h-[15px] bg-muted rounded-sm overflow-hidden">
                              <div
                                className="h-full rounded-sm"
                                style={{
                                  // 제출은 0.5% 수준이라 그대로 그리면 안 보인다 — 최소 폭 보장
                                  width: `${i === 4 ? Math.max(pct, 1.2) : pct}%`,
                                  background: i === 4 && count === 0 ? "#ff6b8a" : color,
                                  opacity: op,
                                }}
                              />
                            </div>
                            <span className="text-muted-foreground tabular-nums">
                              <b className="text-foreground">{count.toLocaleString()}</b> {pct}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
                <b className="text-foreground">퍼널이 선형이 아닙니다.</b> 폼이 CTA보다 큰 건 오류가
                아니라, 폼 도달의 다수가 CTA를 안 거치기 때문입니다(사이드바·저장된 링크·직접 진입).
                그래서 단계 간 비율이 아니라 랜딩 대비로 그립니다.
              </p>
            </div>

            {/* ── CTA 클릭률 비교 ── */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                CTA 클릭률{" "}
                <span className="normal-case tracking-normal font-medium">
                  — 표본이 쌓이기 전까지의 대체 지표
                </span>
              </p>
              <div className="space-y-2.5">
                {[...foreignFunnel]
                  .sort((a, b) => Number(b.cta_rate ?? 0) - Number(a.cta_rate ?? 0))
                  .map((f) => {
                    const rate = Number(f.cta_rate ?? 0);
                    const max = Math.max(
                      ...foreignFunnel.map((x) => Number(x.cta_rate ?? 0)),
                      1
                    );
                    return (
                      <div
                        key={f.lang}
                        className="grid grid-cols-[72px_1fr_52px] gap-3 items-center text-xs"
                      >
                        <span className="font-bold flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-sm shrink-0"
                            style={{ background: langColor(f.lang) }}
                          />
                          {f.lang}
                        </span>
                        <div className="h-[21px] bg-muted rounded-sm overflow-hidden">
                          <div
                            className="h-full rounded-sm flex items-center pl-2 text-[10px] font-black text-black"
                            style={{
                              width: `${(rate / max) * 100}%`,
                              background: langColor(f.lang),
                            }}
                          >
                            {f.cta_clicked}건
                          </div>
                        </div>
                        <span
                          className={`text-right tabular-nums font-bold ${
                            rate < 4 ? "text-red-400" : "text-muted-foreground"
                          }`}
                        >
                          {rate}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* ── 이탈 경로 표 ── */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                이탈 지점{" "}
                <span className="normal-case tracking-normal font-medium">
                  — 어디까지 보고 나갔나
                </span>
              </p>
              {foreignExits.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  아직 데이터가 없습니다.{" "}
                  <code className="text-foreground">foreign_page_exit</code>는 2026-09-06에
                  배포돼 수집 중이고, 세션 5개 이상 쌓인 경로부터 표시됩니다.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left font-black pb-2 pr-3">경로</th>
                        <th className="text-left font-black pb-2 pr-3">언어</th>
                        <th className="text-right font-black pb-2 pr-3">이탈</th>
                        <th className="text-right font-black pb-2 pr-3">평균 깊이</th>
                        <th className="text-right font-black pb-2">평균 체류</th>
                      </tr>
                    </thead>
                    <tbody>
                      {foreignExits.map((e) => {
                        const depth = Number(e.avg_scroll_depth ?? 0);
                        const sec = Number(e.avg_time_sec ?? 0);
                        // 깊이 30%↓ + 체류 15초↓ = 검색 의도와 콘텐츠 불일치 의심
                        const mismatch = depth < 30 && sec < 15;
                        return (
                          <tr key={`${e.path}-${e.lang}`} className="border-t border-border">
                            <td className="py-2 pr-3 text-foreground truncate max-w-[280px]">
                              {e.path}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{e.lang}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                              {e.exits}
                            </td>
                            <td
                              className={`py-2 pr-3 text-right tabular-nums ${
                                mismatch ? "text-red-400 font-bold" : "text-muted-foreground"
                              }`}
                            >
                              {depth}%
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">
                              {sec}초
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                    깊이 <b className="text-foreground">30%↓</b> + 체류{" "}
                    <b className="text-foreground">15초↓</b>(빨강) = 검색 의도와 콘텐츠 불일치.
                    깊이 <b className="text-foreground">70%↑</b>인데 CTA 클릭이 없으면 CTA 문제.
                  </p>
                </div>
              )}
            </div>

            {/* ── 방문자 목록 + 저니 드릴다운 (Migration 660) ── */}
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  <Users className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                  방문자별 저니{" "}
                  <span className="normal-case tracking-normal font-medium">
                    — 폼 이상 도달한 사람. 누르면 이동 경로가 펼쳐집니다
                  </span>
                </p>
                {/* 언어 필터 칩 */}
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setVisitorLang(null)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                      visitorLang === null
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    전체 {foreignVisitors.length}
                  </button>
                  {visitorLangs.map((lg) => {
                    const n = foreignVisitors.filter((v) => v.lang === lg).length;
                    return (
                      <button
                        key={lg}
                        type="button"
                        onClick={() => setVisitorLang(lg)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors flex items-center gap-1.5 ${
                          visitorLang === lg
                            ? "bg-foreground text-background border-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-sm" style={{ background: langColor(lg) }} />
                        {lg} {n}
                      </button>
                    );
                  })}
                </div>
              </div>

              {visibleVisitors.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {foreignVisitors.length === 0
                    ? "데이터가 없습니다. Migration 660이 적용됐는지 확인하세요."
                    : "이 언어로 폼까지 간 사람이 아직 없습니다."}
                </p>
              ) : (
                <div>
                  {/* 헤더 */}
                  <div className="grid grid-cols-[16px_60px_56px_1fr_64px_88px] gap-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-2">
                    <span />
                    <span>언어</span>
                    <span>단계</span>
                    <span>첫 랜딩 · 채널</span>
                    <span className="text-right">방문·이벤트</span>
                    <span className="text-right">마지막</span>
                  </div>
                  {visibleVisitors.map((v) => (
                    <VisitorRow key={v.anon_id} v={v} color={langColor(v.lang)} />
                  ))}
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                    한 사람(브라우저)이 한 줄입니다. 저니 안의{" "}
                    <b className="text-brand-amber">↻ 재방문</b> 표시는 세션이 바뀐 지점 —
                    "다른 날 다시 와서 결국 예약했다"는 패턴이 여기서 보입니다. 랜딩만 하고
                    나간 사람은 저니가 1줄이라 목록에서 뺐습니다.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
