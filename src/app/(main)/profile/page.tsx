"use client";

import { useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  AlertTriangle,
  ShieldAlert,
  Clock,
  ChevronRight,
  Heart,
  Ticket,
  MessageCircle,
  Instagram,
  Check,
} from "lucide-react";
import { KakaoOpenChatGuide } from "@/components/shared/KakaoOpenChatGuide";
import { toast } from "sonner";
import dayjs from "dayjs";
import type { ContactMethodType, Puzzle } from "@/types/database";

const CONTACT_METHOD_OPTIONS: { value: ContactMethodType; label: string; icon: typeof Instagram }[] = [
  { value: "dm", label: "인스타 DM", icon: Instagram },
  { value: "kakao", label: "오픈채팅", icon: MessageCircle },
  { value: "phone", label: "전화", icon: Phone },
];

const FLAG_STATUS: Record<string, { text: string; tone: string }> = {
  open: { text: "제안 받는중", tone: "text-amber-400" },
  selecting: { text: "제안 검토중", tone: "text-amber-400" },
  matched: { text: "매칭 완료", tone: "text-green-400" },
  accepted: { text: "매칭 완료", tone: "text-green-400" },
  cancelled: { text: "취소됨", tone: "text-neutral-500" },
  expired: { text: "만료됨", tone: "text-neutral-500" },
};

export default function ProfilePage() {
  const { user, isLoading, refetch } = useCurrentUser();
  const router = useRouter();
  const supabase = createClient();

  // 닉네임/사진 편집은 /me (공개 프로필) ProfileEditSheet에서 처리

  // MD 비즈니스 연락처 수정
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [instagram, setInstagram] = useState("");
  const [kakaoUrl, setKakaoUrl] = useState("");
  const [preferredMethods, setPreferredMethods] = useState<ContactMethodType[]>([]);
  const [savingBusiness, setSavingBusiness] = useState(false);

  // 일반 유저용 오픈채팅 URL 별도 편집
  const [isEditingUserKakao, setIsEditingUserKakao] = useState(false);
  const [userKakaoUrl, setUserKakaoUrl] = useState("");
  const [savingUserKakao, setSavingUserKakao] = useState(false);

  const [myFlags, setMyFlags] = useState<Puzzle[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("puzzles")
      .select("*")
      .eq("leader_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data) setMyFlags(data as Puzzle[]);
      });
  }, [user]);

  // 로딩 타임아웃: 5초 후 강제 해제
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (isLoading && !timedOut) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/profile");
    return null;
  }

  // MD 비즈니스 연락처 수정 시작
  const handleEditBusiness = () => {
    setInstagram(user.instagram || "");
    setKakaoUrl(user.kakao_open_chat_url || "");
    setPreferredMethods(user.preferred_contact_methods || []);
    setIsEditingBusiness(true);
  };

  // MD 비즈니스 연락처 저장 (API 경유 → slug 재생성)
  const handleSaveBusiness = async () => {
    const cleanInstagram = instagram.trim().replace(/^@/, "");
    if (!cleanInstagram) {
      toast.error("인스타그램 아이디를 입력해주세요");
      return;
    }
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(cleanInstagram)) {
      toast.error("인스타그램 아이디 형식이 올바르지 않습니다");
      return;
    }
    if (kakaoUrl && !/^https:\/\/open\.kakao\.com\//.test(kakaoUrl)) {
      toast.error("카카오톡 오픈채팅 URL 형식이 올바르지 않습니다");
      return;
    }

    setSavingBusiness(true);
    try {
      const res = await fetch("/api/md/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram: cleanInstagram,
          kakao_open_chat_url: kakaoUrl.trim() || null,
          preferred_contact_methods: preferredMethods.length > 0 ? preferredMethods : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "저장에 실패했습니다");
      toast.success("MD 정보가 저장되었습니다");
      setIsEditingBusiness(false);
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다");
    } finally {
      setSavingBusiness(false);
    }
  };

  const handleEditUserKakao = () => {
    setUserKakaoUrl(user.kakao_open_chat_url || "");
    setIsEditingUserKakao(true);
  };

  const handleSaveUserKakao = async () => {
    const trimmed = userKakaoUrl.trim();
    if (trimmed && !/^https:\/\/open\.kakao\.com\//.test(trimmed)) {
      toast.error("카카오톡 오픈채팅 URL 형식이 올바르지 않습니다");
      return;
    }
    setSavingUserKakao(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("users")
        .update({ kakao_open_chat_url: trimmed || null })
        .eq("id", user.id);
      if (error) throw error;
      toast.success(trimmed ? "오픈채팅이 등록되었습니다" : "오픈채팅이 삭제되었습니다");
      setIsEditingUserKakao(false);
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다");
    } finally {
      setSavingUserKakao(false);
    }
  };

  const isBanned = user.blocked_until && new Date(user.blocked_until) > new Date();
  const isBlocked = user.is_blocked;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <h1 className="text-xl font-black text-white">내 정보</h1>
        </div>

        {/* 제재 상태 배너 */}
        {(isBlocked || isBanned) && (
          <div className={`rounded-2xl p-4 mb-4 ${isBlocked ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className={`w-4 h-4 ${isBlocked ? "text-red-400" : "text-amber-400"}`} />
              <span className={`text-[13px] font-bold ${isBlocked ? "text-red-400" : "text-amber-400"}`}>
                {isBlocked ? "계정이 영구 정지되었습니다" : "이용이 일시 정지되었습니다"}
              </span>
            </div>
            {isBanned && !isBlocked && (
              <p className="text-[12px] text-neutral-400 ml-6">
                정지 해제: {dayjs(user.blocked_until).format("YYYY년 M월 D일 HH:mm")}
              </p>
            )}
          </div>
        )}

        {/* MD 비즈니스 연락처 */}
        {(user.role === "md" || user.role === "admin") && (
          <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-bold text-white">MD 정보</h2>
              {!isEditingBusiness ? (
                <button
                  onClick={handleEditBusiness}
                  className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
                >
                  수정
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingBusiness(false)}
                    className="text-[13px] text-neutral-500 hover:text-neutral-300 transition-colors font-bold"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveBusiness}
                    disabled={savingBusiness}
                    className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold disabled:opacity-50"
                  >
                    {savingBusiness ? "저장 중..." : "저장"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* 인스타그램 */}
              <div className="flex items-center gap-3">
                <Instagram className="w-4 h-4 text-neutral-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-neutral-500">인스타그램 *</p>
                  {isEditingBusiness ? (
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-[14px]">@</span>
                      <input
                        type="text"
                        value={instagram.replace(/^@/, "")}
                        onChange={(e) =>
                          setInstagram(e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, ""))
                        }
                        maxLength={30}
                        placeholder="your_instagram_id"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-7 pr-3 py-2 text-[14px] text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  ) : (
                    <p className="text-[14px] text-white font-bold">@{user.instagram || "미설정"}</p>
                  )}
                </div>
              </div>

              {/* 카카오 오픈채팅 */}
              {isEditingBusiness ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white font-bold text-[13px]">
                      <MessageCircle className="w-4 h-4 text-green-500" />
                      카카오 오픈채팅 URL
                    </div>
                    <KakaoOpenChatGuide />
                  </div>
                  <div className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-4 space-y-3">
                    <input
                      type="url"
                      value={kakaoUrl}
                      onChange={(e) => setKakaoUrl(e.target.value)}
                      placeholder="https://open.kakao.com/o/..."
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-green-500 font-mono"
                    />
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      방 만든 후 URL을 붙여넣어 주세요.<br />
                      낙찰 고객에게만 공개됩니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-4 h-4 text-neutral-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] text-neutral-500">카카오 오픈채팅</p>
                    {user.kakao_open_chat_url ? (
                      <a
                        href={user.kakao_open_chat_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-[#FEE500] text-[#3C1E1E] font-bold text-[13px] rounded-xl hover:bg-[#FDD835] transition-colors mt-1"
                      >
                        카카오 오픈채팅 열기
                      </a>
                    ) : (
                      <p className="text-[13px] text-neutral-500">미설정</p>
                    )}
                  </div>
                </div>
              )}

              {/* 고객에게 표시할 연락 수단 */}
              <div>
                <p className="text-[11px] text-neutral-500 mb-2">고객에게 표시할 연락 수단</p>
                {isEditingBusiness ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {CONTACT_METHOD_OPTIONS.map(({ value, label, icon: Icon }) => {
                        const isSelected = preferredMethods.includes(value);
                        const isDisabled = value === "kakao" && !kakaoUrl;
                        return (
                          <button
                            key={value}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => {
                              setPreferredMethods((prev) =>
                                isSelected ? prev.filter((m) => m !== value) : [...prev, value]
                              );
                            }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
                              isDisabled
                                ? "bg-neutral-900 text-neutral-700 cursor-not-allowed"
                                : isSelected
                                  ? "bg-white text-black"
                                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-neutral-600 mt-2">
                      {preferredMethods.length === 0
                        ? "미선택 시 모든 연락 수단이 표시됩니다"
                        : "선택한 수단만 고객에게 표시됩니다"}
                    </p>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(user.preferred_contact_methods?.length ?? 0) > 0
                      ? user.preferred_contact_methods!.map((m) => {
                          const opt = CONTACT_METHOD_OPTIONS.find((o) => o.value === m);
                          if (!opt) return null;
                          const Icon = opt.icon;
                          return (
                            <span key={m} className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 rounded-full text-[11px] text-neutral-300 font-bold">
                              <Icon className="w-3 h-3" />
                              {opt.label}
                            </span>
                          );
                        })
                      : <span className="text-[13px] text-neutral-500">모든 수단 표시</span>
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 내 깃발 */}
        <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-white">내 깃발</h2>
            {myFlags.length > 0 && (
              <Link
                href="/bids"
                className="inline-flex items-center gap-0.5 text-[12px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
              >
                전체 보기
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {myFlags.length > 0 ? (
            <div className="flex flex-col gap-2">
              {myFlags.map((flag) => {
                const st = FLAG_STATUS[flag.status] ?? { text: flag.status, tone: "text-neutral-400" };
                return (
                  <Link
                    key={flag.id}
                    href={`/flags/${flag.id}`}
                    className="flex items-center justify-between gap-3 bg-neutral-800/40 rounded-xl px-4 py-3 hover:bg-neutral-800/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-white truncate">
                        {flag.area} · {dayjs(flag.event_date).format("M월 D일")}
                      </p>
                      <p className="text-[12px] text-neutral-500">
                        {flag.current_count}/{flag.target_count}명
                      </p>
                    </div>
                    <span className={`shrink-0 text-[12px] font-bold ${st.tone}`}>
                      {st.text}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-[13px] text-neutral-500">아직 꽂은 깃발이 없어요</p>
            </div>
          )}

          {/* 제재 정보 */}
          {((user.warning_count || 0) > 0 || (user.strike_count || 0) > 0) && (
            <Link
              href="/my-penalties"
              className="flex items-center justify-between gap-2 mt-3 p-2.5 bg-neutral-800/50 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <p className="text-[12px] text-neutral-400">
                  경고 <span className="text-amber-400 font-bold">{user.warning_count || 0}</span>/3
                  {(user.strike_count || 0) > 0 && (
                    <span className="ml-2">
                      스트라이크 <span className="text-red-400 font-bold">{user.strike_count}</span>
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
            </Link>
          )}

          {isBanned && !isBlocked && (
            <div className="flex items-center gap-2 mt-2 p-2.5 bg-amber-500/5 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-[12px] text-amber-400">
                정지 해제: {dayjs(user.blocked_until).format("YYYY.MM.DD HH:mm")}
              </p>
            </div>
          )}
        </div>

        {/* 쿠폰 */}
        <Link
          href="/coupons"
          className="bg-[#1C1C1E] rounded-2xl p-5 mb-4 flex items-center justify-between hover:bg-neutral-800/30 transition-colors block"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Ticket className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-white">내 쿠폰</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-neutral-600" />
        </Link>

        {/* 찜 */}
        <Link
          href="/favorites"
          className="bg-[#1C1C1E] rounded-2xl p-5 mb-4 flex items-center justify-between hover:bg-neutral-800/30 transition-colors block"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-white">찜 목록</p>
              <p className="text-[12px] text-neutral-500">클럽 · MD · 깃발</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-neutral-600" />
        </Link>

        {/* 일반 유저용 카카오 오픈채팅 등록 (MD는 위 MD 정보 섹션에서 관리) */}
        {user.role !== "md" && user.role !== "admin" && (
          <div className="bg-[#1C1C1E] rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-bold text-white">오픈채팅</h2>
              {!isEditingUserKakao ? (
                <button
                  onClick={handleEditUserKakao}
                  className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold"
                >
                  {user.kakao_open_chat_url ? "수정" : "등록"}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingUserKakao(false)}
                    disabled={savingUserKakao}
                    className="text-[13px] text-neutral-500 hover:text-neutral-400 transition-colors font-bold"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveUserKakao}
                    disabled={savingUserKakao}
                    className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors font-bold disabled:opacity-50"
                  >
                    {savingUserKakao ? "저장 중..." : "저장"}
                  </button>
                </div>
              )}
            </div>
            {isEditingUserKakao ? (
              <div className="space-y-2">
                <div className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-4 space-y-3">
                  <input
                    type="url"
                    value={userKakaoUrl}
                    onChange={(e) => setUserKakaoUrl(e.target.value)}
                    placeholder="개인정보 보호를 원한다면 등록"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-[13px] text-white focus:outline-none focus:border-green-500"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-neutral-500 leading-relaxed">
                      깃발 매칭 시 MD에게 전화번호 대신 오픈채팅으로 연락받을 수 있어요.
                    </p>
                    <KakaoOpenChatGuide />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <MessageCircle className="w-4 h-4 text-neutral-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-neutral-500">카카오 오픈채팅</p>
                  {user.kakao_open_chat_url ? (
                    <a
                      href={user.kakao_open_chat_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-white font-bold truncate block hover:text-amber-400 transition-colors"
                    >
                      {user.kakao_open_chat_url}
                    </a>
                  ) : (
                    <p className="text-[13px] text-neutral-500">미설정</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 바로가기 */}
        <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
          <Link
            href="/settings/notifications"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors border-b border-neutral-800/50"
          >
            <span className="text-[14px] text-neutral-300">알림 설정</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
          <Link
            href="/faq"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors border-b border-neutral-800/50"
          >
            <span className="text-[14px] text-neutral-300">자주 묻는 질문</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
          <Link
            href="/contact"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors border-b border-neutral-800/50"
          >
            <span className="text-[14px] text-neutral-300">고객 문의</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
          <Link
            href="/terms"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors border-b border-neutral-800/50"
          >
            <span className="text-[14px] text-neutral-300">이용약관</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
          <Link
            href="/privacy"
            className="flex items-center justify-between px-5 py-4 hover:bg-neutral-800/30 transition-colors"
          >
            <span className="text-[14px] text-neutral-300">개인정보처리방침</span>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
          </Link>
        </div>

        {/* 탈퇴 */}
        <Link
          href="/profile/delete"
          className="block text-center text-[12px] text-neutral-600 mt-6 hover:text-red-400 transition-colors"
        >
          회원탈퇴
        </Link>
      </div>
    </div>
  );
}
