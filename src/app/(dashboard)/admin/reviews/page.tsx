import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ChevronLeft, MessageSquare, TrendingUp, Users, Hash, Flag } from "lucide-react";
import Link from "next/link";
import { WordReportsList, type WordReportRow } from "@/components/admin/WordReportsList";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);
dayjs.locale("ko");

export default async function AdminReviewsPage() {
  const supabase = await createClient();

  const headersList = await headers();
  const userId = headersList.get("x-user-id");

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: ud } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (ud?.role !== "admin") redirect("/");
  }

  // 전체 워드클라우드 데이터 (최신순)
  const { data: rows } = await supabase
    .from("club_word_clouds")
    .select(`
      id,
      words,
      created_at,
      updated_at,
      club:clubs(id, name),
      author:users!club_word_clouds_author_id_fkey(display_name, profile_image)
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  // 신고된 단어 (488) — pending 먼저, 최신순
  const { data: reportRows } = await supabase
    .from("club_word_cloud_reports")
    .select(`
      id, club_id, normalized_word, word_label, reason, memo,
      status, action_taken, admin_note, created_at, reviewed_at,
      reporter_id,
      club:clubs(id, name)
    `)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);

  const reporterIds = [
    ...new Set((reportRows ?? []).map((r) => r.reporter_id).filter((x): x is string => !!x)),
  ];
  const { data: reporters } = reporterIds.length
    ? await supabase
        .from("users")
        .select("id, display_name, name, role")
        .in("id", reporterIds)
    : { data: [] };
  const reporterMap = new Map(
    (reporters ?? []).map((u) => [u.id, u as { display_name: string | null; name: string | null; role: string }])
  );

  // 같은 클럽·단어에 쌓인 미처리 신고 수
  const pendingByWord = new Map<string, number>();
  for (const r of reportRows ?? []) {
    if (r.status !== "pending") continue;
    const key = `${r.club_id}::${r.normalized_word}`;
    pendingByWord.set(key, (pendingByWord.get(key) ?? 0) + 1);
  }

  const reports: WordReportRow[] = (reportRows ?? []).map((r) => {
    const reporter = r.reporter_id ? reporterMap.get(r.reporter_id) : null;
    const club = r.club as unknown as { id: string; name: string } | null;
    return {
      id: r.id as string,
      club_id: r.club_id as string,
      club_name: club?.name ?? null,
      normalized_word: r.normalized_word as string,
      word_label: (r.word_label as string | null) ?? null,
      reason: r.reason as string,
      memo: (r.memo as string | null) ?? null,
      status: r.status as WordReportRow["status"],
      action_taken: (r.action_taken as string | null) ?? null,
      admin_note: (r.admin_note as string | null) ?? null,
      created_at: r.created_at as string,
      reviewed_at: (r.reviewed_at as string | null) ?? null,
      reporter_name: reporter
        ? reporter.display_name ?? reporter.name ?? "—"
        : "(익명/탈퇴)",
      reporter_role: reporter?.role ?? null,
      same_word_count: pendingByWord.get(`${r.club_id}::${r.normalized_word}`) ?? 0,
    };
  });

  const pendingReports = reports.filter((r) => r.status === "pending").length;

  const allRows = rows || [];

  // 통계 집계
  const totalEntries = allRows.length;
  const allWords = allRows.flatMap((r) => r.words || []);
  const totalWords = allWords.length;

  // 단어 빈도 집계 (정규화: 소문자, 공백 제거)
  const wordFreq: Record<string, number> = {};
  allWords.forEach((w) => {
    const norm = w.trim().toLowerCase();
    if (norm) wordFreq[norm] = (wordFreq[norm] || 0) + 1;
  });
  const sortedWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]);
  const uniqueWordCount = sortedWords.length;

  // 클럽별 집계
  const clubMap: Record<string, { name: string; entries: number; wordCount: number; words: Record<string, number> }> = {};
  allRows.forEach((r) => {
    const club = r.club as unknown as { id: string; name: string } | null;
    if (!club) return;
    if (!clubMap[club.id]) clubMap[club.id] = { name: club.name, entries: 0, wordCount: 0, words: {} };
    clubMap[club.id].entries++;
    (r.words || []).forEach((w: string) => {
      const norm = w.trim().toLowerCase();
      clubMap[club.id].wordCount++;
      clubMap[club.id].words[norm] = (clubMap[club.id].words[norm] || 0) + 1;
    });
  });
  const clubRanking = Object.values(clubMap)
    .sort((a, b) => b.entries - a.entries)
    .slice(0, 10);

  // 최근 7일
  const sevenDaysAgo = dayjs().subtract(7, "day").toISOString();
  const recentCount = allRows.filter((r) => r.created_at >= sevenDaysAgo).length;

  const topMax = sortedWords[0]?.[1] || 1;

  return (
    <div className="min-h-screen bg-background text-foreground pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6 space-y-10">

        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border hover:border-border transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground font-bold uppercase tracking-widest text-[11px]">
              <MessageSquare className="w-3.5 h-3.5" />
              Word Cloud Reviews
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter">5자리뷰 현황</h1>
            <p className="text-muted-foreground font-medium mt-1">클럽 상세 페이지의 워드클라우드 리뷰 현황</p>
          </div>
        </header>

        {/* 신고된 단어 */}
        <Card className="bg-card border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-red-400" />
              <h2 className="text-lg font-black">신고된 리뷰</h2>
              {pendingReports > 0 && (
                <span className="text-[12px] font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
                  {pendingReports} pending
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              삭제 시 해당 클럽에서 단어가 사라집니다
            </span>
          </div>
          <WordReportsList rows={reports} />
        </Card>

        {/* 요약 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border p-5">
            <div className="flex items-center gap-2 text-pink-400 mb-3">
              <Users className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">참여자 수</span>
            </div>
            <p className="text-3xl font-black text-foreground">{totalEntries.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">명 (누적)</p>
          </Card>

          <Card className="bg-card border-border p-5 shadow-[0_0_24px_rgba(236,72,153,0.12)]">
            <div className="flex items-center gap-2 text-pink-400 mb-3">
              <MessageSquare className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">총 단어 수</span>
            </div>
            <p className="text-3xl font-black text-foreground">{totalWords.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">개 (누적)</p>
          </Card>

          <Card className="bg-card border-border p-5">
            <div className="flex items-center gap-2 text-money mb-3">
              <TrendingUp className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">최근 7일</span>
            </div>
            <p className="text-3xl font-black text-foreground">{recentCount}</p>
            <p className="text-xs text-muted-foreground mt-1">건</p>
          </Card>

          <Card className="bg-card border-border p-5">
            <div className="flex items-center gap-2 text-purple-400 mb-3">
              <Hash className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">고유 단어</span>
            </div>
            <p className="text-3xl font-black text-foreground">{uniqueWordCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">종</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 인기 단어 TOP 20 */}
          <Card className="bg-card border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black">인기 단어 TOP 20</h2>
              <span className="text-xs text-muted-foreground">전 클럽 합산</span>
            </div>
            {sortedWords.length === 0 ? (
              <p className="text-muted-foreground text-sm">아직 데이터가 없어요</p>
            ) : (
              <div className="space-y-2.5">
                {sortedWords.slice(0, 20).map(([word, count], idx) => (
                  <div key={word} className="flex items-center gap-3">
                    <span className={`w-6 text-center text-sm font-black shrink-0 ${
                      idx === 0 ? "text-pink-400" : idx === 1 ? "text-foreground/80" : idx === 2 ? "text-brand-amber" : "text-muted-foreground"
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="w-16 text-sm font-bold text-foreground truncate shrink-0">{word}</span>
                    <div className="flex-1 h-5 bg-card rounded-full overflow-hidden">
                      <div
                        className="h-full bg-pink-500 rounded-full"
                        style={{ width: `${(count / topMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-black text-foreground shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 클럽별 리뷰 순위 */}
          <Card className="bg-card border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black">클럽별 리뷰 순위</h2>
              <span className="text-xs text-muted-foreground">참여자 수 기준</span>
            </div>
            {clubRanking.length === 0 ? (
              <p className="text-muted-foreground text-sm">아직 데이터가 없어요</p>
            ) : (
              <div className="space-y-3">
                {clubRanking.map((club, idx) => {
                  const topClubWords = Object.entries(club.words)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([w]) => w);
                  return (
                    <div key={club.name} className="flex items-start gap-3">
                      <span className={`w-6 text-center text-sm font-black shrink-0 mt-0.5 ${
                        idx === 0 ? "text-pink-400" : idx === 1 ? "text-foreground/80" : idx === 2 ? "text-brand-amber" : "text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-foreground truncate">{club.name}</span>
                          <span className="text-sm font-black text-pink-400 shrink-0">{club.entries}명</span>
                        </div>
                        {topClubWords.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {topClubWords.map((w) => (
                              <span key={w} className="text-[11px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-400 font-semibold">
                                {w}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* 최근 제출 목록 */}
        <Card className="bg-card border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black">최근 제출</h2>
            <span className="text-xs text-muted-foreground">최신 {Math.min(allRows.length, 500)}건</span>
          </div>

          {allRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">아직 리뷰가 없어요</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left py-3 pr-4 font-semibold">클럽</th>
                    <th className="text-left py-3 pr-4 font-semibold">작성자</th>
                    <th className="text-left py-3 pr-4 font-semibold">단어</th>
                    <th className="text-left py-3 font-semibold">작성일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {allRows.map((row) => {
                    const club = row.club as unknown as { id: string; name: string } | null;
                    const author = row.author as { display_name?: string } | null;
                    return (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          {club ? (
                            <Link
                              href={`/clubs/${club.id}`}
                              className="font-semibold text-foreground hover:text-pink-400 transition-colors"
                            >
                              {club.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="text-muted-foreground">{author?.display_name || "—"}</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex gap-1.5 flex-wrap">
                            {(row.words || []).map((w: string, i: number) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 text-[12px] font-bold"
                              >
                                {w}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                          {dayjs(row.created_at).fromNow()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
