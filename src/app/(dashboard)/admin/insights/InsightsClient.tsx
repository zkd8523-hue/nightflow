"use client";

import { TrendingDown, Target, BarChart3, Globe2, ArrowRight } from "lucide-react";

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
    step3_phone: number;
    step4_completed: number;
    agree_rate: number | null;
    phone_rate: number | null;
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
}

export function InsightsClient({ hotspots, funnel, acquisition, byLang }: Props) {
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
              { label: "③ 폰 인증 완료", value: funnel.step3_phone, rate: funnel.phone_rate },
              { label: "④ 회원가입 완료", value: funnel.step4_completed, rate: funnel.complete_rate },
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
                  {idx < 3 && step.rate !== null && (
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
    </div>
  );
}
