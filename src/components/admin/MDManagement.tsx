"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import {
    Building2,
    MapPin,
    ExternalLink,
    Clock,
    Instagram,
    ChevronDown,
    ChevronUp,
    Eye,
    Calendar,
    MapPinned,
    ArrowRight,
} from "lucide-react";
import Link from "next/link";
import type { User, Club, MDHealthScore } from "@/types/database";
import { MDMonitorList } from "./MDMonitorList";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.locale("ko");

interface UserWithClub extends User {
    default_club: Club | null;
}

export function MDManagement({
    initialUsers,
    healthScores,
    users: externalUsers,
    setUsers: externalSetUsers,
}: {
    initialUsers: UserWithClub[];
    healthScores?: MDHealthScore[];
    users?: UserWithClub[];
    setUsers?: (users: UserWithClub[] | ((prev: UserWithClub[]) => UserWithClub[])) => void;
}) {
    // 외부에서 users와 setUsers를 제공하면 그것을 사용, 아니면 내부 state 사용
    const [internalUsers, setInternalUsers] = useState<UserWithClub[]>(initialUsers);
    const users = externalUsers ?? internalUsers;
    const setUsers = externalSetUsers ?? setInternalUsers;

    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const approvedUsers = users.filter(u => u.md_status === "approved");

    return (
        <div className="space-y-6">
            {/* 이미지 미리보기 다이얼로그 */}
            <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
                <DialogContent className="bg-[#1C1C1E] border-neutral-800 max-w-2xl p-2" showCloseButton={false}>
                    {previewImage && (
                        <img src={previewImage} alt="미리보기" className="w-full h-auto rounded-lg" />
                    )}
                </DialogContent>
            </Dialog>

            {/* MD 활동 모니터링 (승인 게이트 제거됨) */}
            <div className="space-y-4">
                <h2 className="text-lg font-bold text-white">활동 모니터링 ({approvedUsers.length})</h2>
                {healthScores && healthScores.length > 0 ? (
                    <MDMonitorList mds={healthScores} />
                ) : approvedUsers.length > 0 ? (
                    approvedUsers.map(u => (
                        <MDApplicationCard key={u.id} user={u} isSimple onPreviewImage={setPreviewImage} />
                    ))
                ) : (
                    <EmptyAdminState label="활동 중인 MD가 없습니다." />
                )}
            </div>
        </div>
    );
}

function ImagePreview({
    url,
    label,
    onPreview,
}: {
    url: string | null | undefined;
    label: string;
    onPreview: (url: string) => void;
}) {
    if (!url) {
        return (
            <div className="h-20 bg-neutral-900 rounded-xl border border-dashed border-neutral-800 flex items-center justify-center">
                <span className="text-xs text-neutral-600 italic">{label} 미첨부</span>
            </div>
        );
    }
    return (
        <button
            onClick={() => onPreview(url)}
            className="relative rounded-xl overflow-hidden border border-neutral-800 group w-full"
        >
            <img src={url} alt={label} className="w-full h-20 object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Eye className="w-5 h-5 text-white" />
            </div>
        </button>
    );
}

function MDApplicationCard({
    user,
    isSimple = false,
    onPreviewImage,
}: {
    user: UserWithClub;
    isSimple?: boolean;
    onPreviewImage: (url: string) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const clubName = user.default_club?.name || user.verification_club_name;

    return (
        <Card className="bg-[#1C1C1E] border-neutral-800/50 overflow-hidden">
            <div className="p-6">
                {/* 상단: 기본 정보 + 액션 */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    {/* 좌측: 아바타 + 이름 + 메타데이터 */}
                    <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center font-black text-xl text-neutral-500 shrink-0">
                            {user.name?.substring(0, 1)}
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-black text-white">{user.name}</h3>
                                <Badge variant="outline" className={`bg-neutral-950 border-neutral-800 text-[10px] py-0 px-2 uppercase font-bold ${
                                    user.md_status === "suspended" ? "text-red-500 border-red-500/30" :
                                    user.md_status === "revoked" ? "text-neutral-600 border-neutral-700" :
                                    "text-neutral-500"
                                }`}>
                                    {user.md_status === "suspended" ? "SUSPENDED" :
                                     user.md_status === "revoked" ? "REVOKED" :
                                     user.md_status}
                                </Badge>
                            </div>
                            <p className="text-neutral-500 text-sm font-medium">{user.phone}</p>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-bold">
                                    <MapPin className="w-3.5 h-3.5" /> {Array.isArray(user.area) ? user.area.join(", ") : user.area || "지역 미정"}
                                </div>
                                {clubName && (
                                    <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-bold">
                                        <Building2 className="w-3.5 h-3.5" /> {clubName}
                                    </div>
                                )}
                                {user.instagram && (
                                    <a
                                        href={`https://instagram.com/${user.instagram}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-neutral-400 font-bold hover:text-white transition-colors"
                                    >
                                        <Instagram className="w-3.5 h-3.5" /> @{user.instagram}
                                    </a>
                                )}
                            </div>
                            {/* 신청일 */}
                            <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                                <Calendar className="w-3 h-3" />
                                {dayjs(user.created_at).format("YYYY-MM-DD HH:mm")}
                                <span className="text-neutral-700">({dayjs(user.created_at).fromNow()})</span>
                            </div>
                        </div>
                    </div>

                    {isSimple && (
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                                <p className="text-[10px] text-neutral-500 font-bold uppercase mb-0.5">Application Date</p>
                                <p className="text-xs text-neutral-400 font-medium">{dayjs(user.created_at).format("YYYY-MM-DD")}</p>
                            </div>
                            {user.md_status === "approved" && (
                                <Link
                                    href={`/admin/mds/${user.id}`}
                                    className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors"
                                >
                                    상세 / 제재
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </Link>
                            )}
                        </div>
                    )}
                </div>

                {/* 확장 토글 (심사 대기 카드만) */}
                {!isSimple && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-4 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors font-bold"
                    >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        상세 정보 {isExpanded ? "접기" : "보기"}
                    </button>
                )}

                {/* 확장 상세 영역 */}
                {!isSimple && isExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-neutral-800/30">
                        {/* 클럽 정보 */}
                        <div className="bg-neutral-900/50 rounded-2xl p-4 border border-neutral-800/30 space-y-3">
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                                <Building2 className="w-3.5 h-3.5" /> Club Information
                            </div>
                            <div className="space-y-2">
                                <div>
                                    <p className="text-[10px] text-neutral-600 font-bold mb-0.5">클럽명</p>
                                    <p className="text-sm font-black text-white">{clubName || "미입력"}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-neutral-600 font-bold mb-0.5">주소</p>
                                    <p className="text-sm text-neutral-300">
                                        {user.default_club?.address || "주소 정보 없음"}
                                    </p>
                                    {user.default_club?.address_detail && (
                                        <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                                            <MapPinned className="w-3 h-3" />
                                            {user.default_club.address_detail}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-[10px] text-neutral-600 font-bold">클럽 대표이미지</p>
                                <ImagePreview
                                    url={user.default_club?.thumbnail_url}
                                    label="클럽 이미지"
                                    onPreview={onPreviewImage}
                                />
                            </div>
                            <div className="space-y-2">
                                <p className="text-[10px] text-neutral-600 font-bold">플로어맵</p>
                                <ImagePreview
                                    url={user.floor_plan_url}
                                    label="플로어맵"
                                    onPreview={onPreviewImage}
                                />
                            </div>
                        </div>

                        {/* 인증 정보 */}
                        <div className="bg-neutral-900/50 rounded-2xl p-4 border border-neutral-800/30 space-y-3">
                            <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                                <Instagram className="w-3.5 h-3.5" /> Verification
                            </div>
                            {user.instagram ? (
                                <a
                                    href={`https://instagram.com/${user.instagram}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-black text-white hover:text-green-400 transition-colors flex items-center gap-1.5"
                                >
                                    @{user.instagram}
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            ) : (
                                <p className="text-sm text-neutral-600 italic">미입력</p>
                            )}
                            <div className="space-y-2">
                                <p className="text-[10px] text-neutral-600 font-bold">명함 사진</p>
                                <ImagePreview
                                    url={user.business_card_url}
                                    label="명함"
                                    onPreview={onPreviewImage}
                                />
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </Card>
    );
}

function EmptyAdminState({ label }: { label: string }) {
    return (
        <div className="py-24 text-center space-y-4 bg-neutral-900/20 rounded-3xl border border-dashed border-neutral-800/50">
            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-neutral-800" />
            </div>
            <p className="text-neutral-500 font-medium italic">{label}</p>
        </div>
    );
}
