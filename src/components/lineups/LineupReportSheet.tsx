"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, X, ImagePlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * 라인업/공연 제보 — 이미지만 받는다.
 *
 * 왜 클럽·날짜를 안 묻나(사용자 결정, 2026-08-27):
 *   포스터 안에 이미 다 적혀 있다. 유저에게 또 입력시키면 이탈만 는다.
 *   관리자가 검토 화면에서 보고 채운다.
 *
 * 왜 업로드 즉시 파싱하지 않나:
 *   Vision 1건 35원(실측). 제보가 늘면 그대로 비용이 된다. 관리자가 필요하다고
 *   판단했을 때만 파싱 버튼을 누른다. 이름 몇 개짜리 포스터는 직접 입력이
 *   더 빠르고 0원이다.
 */

const MAX_IMAGES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 어느 탭에서 열었는지 — 문구만 달라진다 */
  variant: "lineup" | "event";
}

export function LineupReportSheet({ open, onOpenChange, variant }: Props) {
  const { user } = useCurrentUser();
  const [files, setFiles] = useState<File[]>([]);
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = variant === "lineup" ? "타임테이블 제보" : "공연 제보";
  const desc = variant === "lineup" ? "타임테이블 / 포스터를 첨부하세요" : "공연 포스터를 첨부하세요";

  const reset = () => {
    setFiles([]);
    setMemo("");
    setDone(false);
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = Array.from(list);
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      toast.error("10MB 이하 이미지만 올릴 수 있어요");
      return;
    }
    const next = [...files, ...picked].slice(0, MAX_IMAGES);
    if (files.length + picked.length > MAX_IMAGES) {
      toast.info(`이미지는 최대 ${MAX_IMAGES}장까지예요`);
    }
    setFiles(next);
  };

  const submit = async () => {
    if (!user) {
      toast.error("로그인 후 이용해주세요");
      return;
    }
    if (!files.length) {
      toast.error("이미지를 1장 이상 올려주세요");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const uploaded: string[] = [];
    try {
      for (const [i, file] of files.entries()) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        // 파일명에 시각을 넣어 같은 사람이 연달아 올려도 안 덮어쓰게 한다
        const path = `${user.id}/${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage
          .from("lineup-reports")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from("lineup-reports").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }

      const { error } = await supabase.from("lineup_reports").insert({
        reporter_id: user.id,
        image_urls: uploaded,
        memo: memo.trim() || null,
      });
      if (error) throw error;

      setDone(true);
    } catch (e) {
      // 트리거가 던지는 메시지(장수 초과·하루 상한)는 그대로 보여주는 게 친절하다
      const msg = e instanceof Error ? e.message : "제보에 실패했어요";
      toast.error(msg.includes("제보할 수 있어요") || msg.includes("올릴 수 있어요") ? msg : "제보에 실패했어요. 잠시 후 다시 시도해주세요");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="bg-[#1C1C1E] border-t border-border rounded-t-3xl px-4 pb-6 pt-3 max-w-lg mx-auto">
        {done ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/12 border border-green-500/40 grid place-items-center mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <SheetHeader className="space-y-1">
              <SheetTitle className="text-base font-black">제보 접수됐어요</SheetTitle>
            </SheetHeader>
            <p className="text-xs text-muted-foreground leading-relaxed">
              확인 후 등록해 드릴게요.
              <br />
              보통 하루 안에 처리됩니다.
            </p>
            <button
              onClick={() => close(false)}
              className="mt-2 h-10 px-6 rounded-full bg-card border border-border text-[13px] font-bold"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            <SheetHeader className="text-left space-y-1">
              <SheetTitle className="text-[15px] font-black tracking-tight">{title}</SheetTitle>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </SheetHeader>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-3">
              {files.length === 0 ? (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="w-full rounded-xl border border-dashed border-border bg-[#141416] py-7 flex flex-col items-center gap-1.5"
                >
                  <ImagePlus className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[12px] font-bold">포스터 / 캡처 올리기</span>
                  <span className="text-[10px] text-muted-foreground leading-relaxed text-center">
                    인스타는 캡션까지 나오게 캡처하면
                    <br />
                    DJ 계정도 같이 등록돼요
                  </span>
                </button>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-[#141416] p-3 flex items-center gap-3.5">
                  {/* 여러 장이면 카드처럼 겹쳐 쌓는다 — 세로 그리드보다 훨씬 짧다 */}
                  <div className="relative w-[72px] h-[82px] shrink-0">
                    {files.map((f, i) => {
                      const top = i === files.length - 1;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 left-0 w-[60px] h-[80px] rounded-lg border border-border overflow-hidden bg-[#26262a]"
                          style={{
                            transform: `translate(${(files.length - 1 - i) * 5.5}px, ${(files.length - 1 - i) * 2}px) rotate(${(files.length - 1 - i) * 2.5}deg)`,
                            opacity: top ? 1 : 0.6,
                            zIndex: i,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                        </div>
                      );
                    })}
                    <button
                      onClick={() => setFiles([])}
                      aria-label="첨부 지우기"
                      className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-[#3a3a3f] grid place-items-center"
                      style={{ zIndex: files.length + 1 }}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="min-w-0">
                    {files.length < MAX_IMAGES && (
                      <button
                        onClick={() => inputRef.current?.click()}
                        className="text-[11px] font-bold text-amber-400"
                      >
                        ＋ 더 올리기
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3">
              <label className="block text-[10px] font-semibold text-muted-foreground mb-1.5">
                남기실 말 <span className="font-normal">(선택)</span>
              </label>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={200}
                placeholder="예: 8/29 그루브앤스팟이요"
                className="w-full bg-[#141416] border border-border rounded-lg px-3 py-2.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <button
              onClick={submit}
              disabled={submitting || !files.length}
              className="mt-4 w-full h-11 rounded-full bg-amber-500 text-black font-black text-[13px] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              제보 보내기
            </button>
            <p className="mt-2 text-[10px] text-muted-foreground text-center leading-relaxed">
              확인 후 등록해 드릴게요
            </p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
