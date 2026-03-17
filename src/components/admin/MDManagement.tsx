"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
    Building2,
    MapPin,
    CheckCircle2,
    XCircle,
    ExternalLink,
    Clock,
    AlertTriangle,
    Instagram,
    Image,
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
import { getErrorMessage, logError } from "@/lib/utils/error";

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

    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [rejectTarget, setRejectTarget] = useState<UserWithClub | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const supabase = createClient();

    const pendingUsers = users.filter(u => u.md_status === "pending");
    const approvedUsers = users.filter(u => u.md_status === "approved");
    const rejectedUsers = users.filter(u => u.md_status === "rejected");

    const handleApprove = async (userId: string) => {
        setLoadingId(userId);
        try {
            const { data, error } = await supabase
                .from("users")
                .update({ md_status: "approved", role: "md" })
                .eq("id", userId)
                .select();

            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("업데이트 권한이 없습니다. 관리자 계정을 확인해주세요.");
            }

            // MD의 소속 클럽도 함께 승인
            const targetUser = users.find(u => u.id === userId);
            const club = targetUser?.default_club;
            let clubApproved = false;

            if (club && club.status === "pending") {
                const { error: clubError } = await supabase
                    .from("clubs")
                    .update({
                        status: "approved",
                        approved_at: new Date().toISOString(),
                    })
                    .eq("id", club.id)
                    .eq("status", "pending");

                if (clubError) {
                    toast.warning("MD는 승인되었지만 클럽 승인에 실패했습니다. 클럽 관리에서 수동 승인해주세요.");
                } else {
                    clubApproved = true;
                }
            }

            toast.success(
                clubApproved
                    ? `MD 승인 완료! 소속 클럽 "${club?.name}"도 함께 승인되었습니다.`
                    : "MD 승인이 완료되었습니다!",
                { duration: 4000 }
            );

            setUsers(prev => prev.map(u => {
                if (u.id !== userId) return u;
                return {
                    ...u,
                    md_status: "approved" as const,
                    role: "md" as const,
                    default_club: clubApproved && u.default_club
                        ? { ...u.default_club, status: "approved" as const }
                        : u.default_club,
                };
            }));
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'MDManagement.handleApprove');
            toast.error(msg || "작업 중 오류가 발생했습니다.");
        } finally {
            setLoadingId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectTarget) return;
        if (!rejectReason.trim()) {
            toast.error("반려 사유를 입력해주세요.");
            return;
        }

        setLoadingId(rejectTarget.id);
        try {
            const { data, error } = await supabase
                .from("users")
                .update({
                    md_status: "rejected",
                    md_rejection_reason: rejectReason.trim(),
                })
                .eq("id", rejectTarget.id)
                .select();

            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("업데이트 권한이 없습니다. 관리자 계정을 확인해주세요.");
            }

            toast.success("반려 처리되었습니다.");
            setUsers(prev => prev.map(u =>
                u.id === rejectTarget.id
                    ? { ...u, md_status: "rejected" as const, md_rejection_reason: rejectReason.trim() }
                    : u
            ));
            setRejectTarget(null);
            setRejectReason("");
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            logError(error, 'MDManagement.handleReject');
            toast.error(msg || "작업 중 오류가 발생했습니다.");
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* 반려 사유 입력 다이얼로그 */}
            <Dialog open={!!rejectTarget} onOpenChange={(open) => {
                if (!open) {
                    setRejectTarget(null);
                    setRejectReason("");
                }
            }}>
                <DialogContent className="bg-[#1C1C1E] border-neutral-800 text-white" showCloseButton={false}>
                    <DialogHeader>
                        <DialogTitle className="text-white font-black text-xl">
                            MD 신청 반려
                        </DialogTitle>
                        <DialogDescription className="text-neutral-400">
                            <span className="text-white font-bold">{rejectTarget?.name}</span>님의 신청을 반려합니다. 사유를 입력해주세요.
                        </DialogDescription>
                    </DialogHeader>
                    <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="반려 사유를 입력해주세요 (예: 본인 인증 서류 미제출)"
                        className="w-full h-28 bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-sm text-white placeholder:text-neutral-600 resize-none focus:outline-none focus:border-neutral-600"
                    />
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                            className="border-neutral-800 text-neutral-400 hover:bg-neutral-900 rounded-xl"
                        >
                            취소
                        </Button>
                        <Button
                            onClick={handleReject}
                            disabled={!rejectReason.trim() || loadingId === rejectTarget?.id}
                            className="bg-red-500 text-white font-bold hover:bg-red-600 rounded-xl"
                        >
                            {loadingId === rejectTarget?.id ? "처리중..." : "반려 확정"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 이미지 미리보기 다이얼로그 */}
            <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
                <DialogContent className="bg-[#1C1C1E] border-neutral-800 max-w-2xl p-2" showCloseButton={false}>
                    {previewImage && (
                        <img src={previewImage} alt="미리보기" className="w-full h-auto rounded-lg" />
                    )}
                </DialogContent>
            </Dialog>

            <Tabs defaultValue="pending" className="w-full">
                <TabsList className="bg-neutral-900 border border-neutral-800 p-1 h-12 rounded-xl">
                    <TabsTrigger value="pending" className="flex-1 rounded-lg font-bold data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white">
                        심사 대기 ({pendingUsers.length})
                    </TabsTrigger>
                    <TabsTrigger value="approved" className="flex-1 rounded-lg font-bold data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white">
                        활동 모니터링 ({approvedUsers.length})
                    </TabsTrigger>
                    <TabsTrigger value="rejected" className="flex-1 rounded-lg font-bold data-[state=active]:bg-[#1C1C1E] data-[state=active]:text-white">
                        반려 내역 ({rejectedUsers.length})
                    </TabsTrigger>
                </TabsList>

                <div className="mt-8">
                    <TabsContent value="pending" className="m-0 space-y-4">
                        {pendingUsers.length > 0 ? (
                            pendingUsers.map(u => (
                                <MDApplicationCard
                                    key={u.id}
                                    user={u}
                                    onApprove={() => handleApprove(u.id)}
                                    onReject={() => setRejectTarget(u)}
                                    loading={loadingId === u.id}
                                    onPreviewImage={setPreviewImage}
                                />
                            ))
                        ) : (
                            <EmptyAdminState label="심사 대기 명단이 없습니다." />
                        )}
                    </TabsContent>

                    <TabsContent value="approved" className="m-0">
                        {healthScores && healthScores.length > 0 ? (
                            <MDMonitorList mds={healthScores} />
                        ) : approvedUsers.length > 0 ? (
                            approvedUsers.map(u => (
                                <MDApplicationCard key={u.id} user={u} isSimple onPreviewImage={setPreviewImage} />
                            ))
                        ) : (
                            <EmptyAdminState label="활동 중인 MD가 없습니다." />
                        )}
                    </TabsContent>

                    <TabsContent value="rejected" className="m-0 space-y-4">
                        {rejectedUsers.length > 0 ? (
                            rejectedUsers.map(u => (
                                <MDApplicationCard key={u.id} user={u} isSimple showRejectionReason onPreviewImage={setPreviewImage} />
                            ))
                        ) : (
                            <EmptyAdminState label="반려 내역이 없습니다." />
                        )}
                    </TabsContent>
                </div>
            </Tabs>
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
    onApprove,
    onReject,
    loading,
    isSimple = false,
    showRejectionReason = false,
    onPreviewImage,
}: {
    user: UserWithClub;
    onApprove?: () => void;
    onReject?: () => void;
    loading?: boolean;
    isSimple?: boolean;
    showRejectionReason?: boolean;
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
                                    <MapPin className="w-3.5 h-3.5" /> {user.area || "지역 미정"}
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

                    {/* 우측: 액션 버튼 */}
                    {!isSimple && onApprove && onReject && (
                        <div className="flex gap-2 shrink-0">
                            <Button
                                variant="outline"
                                onClick={onReject}
                                disabled={loading}
                                className="h-12 border-neutral-800 text-neutral-500 hover:bg-red-500/10 hover:text-red-500 rounded-xl px-4 font-bold"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                반려
                            </Button>
                            <Button
                                onClick={onApprove}
                                disabled={loading}
                                className="h-12 bg-white text-black font-black hover:bg-neutral-200 rounded-xl px-6"
                            >
                                {loading ? "작업중.." : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        활동 승인
                                    </>
                                )}
                            </Button>
                        </div>
                    )}

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

                {/* 반려 사유 표시 */}
                {showRejectionReason && user.md_rejection_reason && (
                    <div className="mt-4 flex items-start gap-2 bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                        <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-1">반려 사유</p>
                            <p className="text-sm text-neutral-300">{user.md_rejection_reason}</p>
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
