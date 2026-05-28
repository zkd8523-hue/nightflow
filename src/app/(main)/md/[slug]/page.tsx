import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { AuctionCard } from "@/components/auctions/AuctionCard";
import { Badge } from "@/components/ui/badge";
import { User, Star, ShieldCheck, Instagram, Building2 } from "lucide-react";
import { ProfileAvatar } from "@/components/shared/ProfileAvatar";

export default async function MDPublicProfilePage({
    params
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params;
    const supabase = await createClient();

    // 1. MD 정보 조회
    const { data: mdUser } = await supabase
        .from("users")
        .select("*")
        .eq("md_unique_slug", slug)
        .single();

    if (!mdUser) {
        notFound();
    }

    // 2. MD 추천인 쿠키 설정 (7일 유지) — Next.js 15에서 page 컴포넌트의 직접 set은 차단됨
    try {
        const cookieStore = await cookies();
        cookieStore.set("md_referrer", mdUser.id, {
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
        });
    } catch {
        // page 컴포넌트에서 cookies.set 실패는 무시 (referrer는 부수효과)
    }

    // 3. 활성 경매 + MD 활동 클럽 + 리뷰 목록 병렬 조회
    const [{ data: auctions }, { data: partnerships }, { data: reviews }] = await Promise.all([
        supabase
            .from("auctions")
            .select(`*, club:club_id (*)`)
            .eq("md_id", mdUser.id)
            .eq("status", "active")
            .order("created_at", { ascending: false }),
        supabase
            .from("club_partners")
            .select("club:clubs(id, name, area, thumbnail_url)")
            .eq("md_id", mdUser.id),
        supabase.rpc("get_md_reviews", { p_md_id: mdUser.id, p_limit: 10, p_offset: 0 }),
    ]);

    type ClubLite = { id: string; name: string; area: string | null; thumbnail_url: string | null };
    const clubs: ClubLite[] = [];
    for (const row of (partnerships ?? []) as Array<{ club: ClubLite | ClubLite[] | null }>) {
        const c = Array.isArray(row.club) ? row.club[0] : row.club;
        if (c) clubs.push(c);
    }

    type ReviewRow = {
        id: string;
        rating: number;
        comment: string | null;
        tags: string[];
        created_at: string;
        club_name: string | null;
        reviewer_display_name: string | null;
        reviewer_profile_image: string | null;
    };
    const reviewList: ReviewRow[] = ((reviews ?? []) as ReviewRow[]).filter((r) => r && typeof r.rating === "number");

    const dealCount = (mdUser as { deal_count_total?: number }).deal_count_total ?? 0;
    const avgRating = (mdUser as { md_avg_rating?: number | null }).md_avg_rating ?? 0;
    const reviewCount = (mdUser as { md_review_count?: number | null }).md_review_count ?? 0;
    const instagram = (mdUser as { instagram?: string | null }).instagram ?? null;
    const displayName = (mdUser as { display_name?: string | null }).display_name ?? mdUser.name ?? "파트너";

    return (
        <div className="min-h-screen bg-[#0A0A0A] pb-20">
            {/* Profile Header */}
            <div className="bg-gradient-to-b from-neutral-900 to-[#0A0A0A] pt-14 pb-10 px-6 text-center">
                <ProfileAvatar
                    src={mdUser.profile_image}
                    alt={displayName}
                    fallback={<User className="w-10 h-10 text-neutral-600" />}
                    className="w-24 h-24 bg-neutral-800 rounded-full mx-auto mb-5 border-4 border-[#1C1C1E] shadow-2xl"
                />

                <div className="space-y-1.5">
                    <div className="flex items-center justify-center gap-2">
                        <h1 className="text-[22px] font-black text-white tracking-tight">{displayName} 파트너</h1>
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-black px-2 py-0.5 h-auto text-[10px] tracking-wider">
                            <ShieldCheck className="w-3 h-3 mr-0.5" /> 인증
                        </Badge>
                    </div>
                    <p className="text-neutral-500 text-[12px] font-medium">NightFlow 공식 파트너</p>
                    {instagram && (
                        <a
                            href={`https://instagram.com/${instagram}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neutral-400 text-[12px] font-medium inline-flex items-center gap-1 hover:text-amber-300 transition-colors"
                        >
                            <Instagram className="w-3.5 h-3.5" />
                            @{instagram}
                        </a>
                    )}
                </div>

                {/* 지표 3종: 거래 / 평점 / 진행 중 */}
                <div className="mt-6 grid grid-cols-3 gap-2 max-w-sm mx-auto">
                    <div className="bg-[#1C1C1E] px-3 py-3 rounded-2xl border border-neutral-800/50">
                        <p className="text-[10px] text-neutral-500 font-bold tracking-wider mb-1">거래</p>
                        <p className="text-[18px] font-black text-white tabular-nums">{dealCount}<span className="text-[12px] text-neutral-500 font-bold">건</span></p>
                    </div>
                    <div className="bg-[#1C1C1E] px-3 py-3 rounded-2xl border border-neutral-800/50">
                        <p className="text-[10px] text-neutral-500 font-bold tracking-wider mb-1">평점</p>
                        <p className="text-[18px] font-black text-amber-300 tabular-nums inline-flex items-baseline gap-0.5">
                            {reviewCount > 0 ? avgRating.toFixed(1) : "-"}
                            {reviewCount > 0 && <Star className="w-3 h-3 fill-amber-300 text-amber-300 self-center" />}
                        </p>
                    </div>
                    <div className="bg-[#1C1C1E] px-3 py-3 rounded-2xl border border-neutral-800/50">
                        <p className="text-[10px] text-neutral-500 font-bold tracking-wider mb-1">진행 중</p>
                        <p className="text-[18px] font-black text-white tabular-nums">{auctions?.length || 0}<span className="text-[12px] text-neutral-500 font-bold">건</span></p>
                    </div>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 space-y-8">
                {/* 활동 클럽 */}
                {clubs.length > 0 && (
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                            <Building2 className="w-4 h-4 text-neutral-400" />
                            <h2 className="text-[14px] font-bold text-neutral-300">활동 클럽</h2>
                            <span className="text-[11px] text-neutral-500">{clubs.length}곳</span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-2 px-2">
                            {clubs.map((club) => (
                                <Link
                                    key={club.id}
                                    href={`/clubs/${club.id}`}
                                    className="flex-shrink-0 bg-[#1C1C1E] border border-neutral-800/60 rounded-xl px-3 py-2 hover:border-amber-500/30 transition-colors"
                                >
                                    <p className="text-[13px] font-bold text-white">{club.name}</p>
                                    {club.area && (
                                        <p className="text-[10.5px] text-neutral-500 font-medium mt-0.5">{club.area}</p>
                                    )}
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* 리뷰 섹션 */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <Star className="w-4 h-4 text-neutral-400" />
                        <h2 className="text-[14px] font-bold text-neutral-300">리뷰</h2>
                        {reviewList.length > 0 && (
                            <span className="text-[11px] text-neutral-500">{reviewList.length}건</span>
                        )}
                    </div>
                    {reviewList.length === 0 ? (
                        <div className="py-10 text-center bg-[#1C1C1E]/40 rounded-2xl border border-dashed border-neutral-800/50">
                            <p className="text-[13px] text-neutral-500 font-medium">아직 작성된 리뷰가 없어요</p>
                            <p className="text-[11px] text-neutral-600 mt-1">첫 매치 후 리뷰가 누적되면 표시돼요</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {reviewList.map((r) => (
                                <div key={r.id} className="bg-[#1C1C1E] rounded-2xl p-4 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <Star
                                                    key={n}
                                                    className={`w-3.5 h-3.5 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "fill-transparent text-neutral-700"}`}
                                                    strokeWidth={1.5}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-[10.5px] text-neutral-600 font-medium">
                                            {new Date(r.created_at).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" })}
                                        </span>
                                    </div>
                                    {r.tags && r.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {r.tags.map((t) => (
                                                <span key={t} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {r.comment && (
                                        <p className="text-[13px] text-neutral-200 leading-snug break-keep whitespace-pre-line">
                                            {r.comment}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between gap-2 pt-1">
                                        <p className="text-[11px] text-neutral-500 font-medium truncate">
                                            {r.reviewer_display_name || "익명"}
                                        </p>
                                        {r.club_name && (
                                            <p className="text-[11px] text-neutral-600 font-medium truncate">{r.club_name}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* 진행 중인 경매 */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-[14px] font-bold text-neutral-300">진행 중인 경매</h2>
                        <span className="text-[11px] text-neutral-500">최신순</span>
                    </div>
                    {auctions && auctions.length > 0 ? (
                        <div className="space-y-4">
                            {auctions.map(auction => (
                                <AuctionCard key={auction.id} auction={auction} />
                            ))}
                        </div>
                    ) : (
                        <div className="py-10 text-center bg-[#1C1C1E]/30 rounded-2xl border border-dashed border-neutral-800/50">
                            <p className="text-[13px] text-neutral-500 font-medium">진행 중인 경매가 없어요</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
