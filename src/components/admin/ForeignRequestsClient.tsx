"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Copy, Calendar, Users, UserRound, Coins, MapPin, Trash2, FileText, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ForeignReq = {
  id: string;
  lang: string;
  area: string | null;
  event_date: string;
  group_size: number;
  budget: number | null;
  club_ids: string[];
  clubNames: string[];
  guest_name: string | null;
  assigned_md_id: string | null;
  conf: {
    request_id: string;
    ref_no: string;
    public_token: string;
    md_token: string;
    club_id: string | null;
    table_info: string | null;
    confirmed_group_size: string | null;
    includes: string[];
    total_price: number | null;
    guest_request: string | null;
    internal_memo: string | null;
  } | null;
  mdCandidates: { id: string; name: string; hasPhone: boolean }[];
  contact_type: string;
  contact_value: string;
  notes: string | null;
  status: string;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: "신규", cls: "bg-red-500/20 text-red-400 border-red-500/40" },
  contacted: { label: "연락함", cls: "bg-amber-500/20 text-brand-amber border-amber-500/40" },
  done: { label: "완료", cls: "bg-green-500/20 text-money border-green-500/40" },
  cancelled: { label: "취소", cls: "bg-muted/40 text-muted-foreground border-border" },
};

function contactLink(type: string, value: string): string | null {
  const v = value.trim();
  if (type === "email") return `mailto:${v}`;
  if (type === "whatsapp") return `https://wa.me/${v.replace(/[^0-9]/g, "")}`;
  if (type === "instagram") return `https://instagram.com/${v.replace(/^@/, "")}`;
  if (type === "line") return `https://line.me/ti/p/~${v.replace(/^@/, "")}`;
  return null; // wechat 등: 딥링크 없음 → 복사만
}

export function ForeignRequestsClient({ initial }: { initial: ForeignReq[] }) {
  const [reqs, setReqs] = useState<ForeignReq[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const updateStatus = async (id: string, status: string) => {
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase.from("foreign_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(`실패: ${error.message}`);
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(STATUS_META[status]?.label ?? status);
  };

  const deleteReq = async (id: string) => {
    if (!window.confirm("이 요청을 영구 삭제할까요? 되돌릴 수 없어요.")) return;
    setBusy(id);
    const supabase = createClient();
    const { error } = await supabase.from("foreign_requests").delete().eq("id", id);
    setBusy(null);
    if (error) return toast.error(`삭제 실패: ${error.message}`);
    setReqs((prev) => prev.filter((r) => r.id !== id));
    toast.success("삭제됨");
  };

  const applyConf = (id: string, conf: NonNullable<ForeignReq["conf"]>) => {
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, conf } : r)));
    setEditing(null);
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success("복사됨")).catch(() => {});
  };

  if (reqs.length === 0) {
    return <p className="text-center text-muted-foreground py-16 text-[14px]">아직 외국인 요청이 없어요.</p>;
  }

  return (
    <div className="space-y-3">
      {reqs.map((r) => {
        const st = STATUS_META[r.status] ?? STATUS_META.new;
        const link = contactLink(r.contact_type, r.contact_value);
        return (
          <div key={r.id} className="rounded-2xl bg-card border border-border p-4 space-y-3">
            {/* 헤더: 상태 + 언어 + 시각 */}
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
              <span className="text-[11px] text-muted-foreground">{r.lang.toUpperCase()} · {new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            {/* 클럽 */}
            {r.clubNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {r.clubNames.map((n, i) => (
                  <span key={i} className="text-[13px] font-bold text-brand-amber bg-amber-500/10 border border-amber-500/25 rounded-full px-2.5 py-1">
                    {i + 1}. {n}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">클럽 미지정 — 지역 기반 추천 필요</p>
            )}

            {/* 정보 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-foreground/80">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-muted-foreground" />{r.event_date}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-muted-foreground" />{r.group_size}명</span>
              {r.area && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-muted-foreground" />{r.area}</span>}
              {r.budget != null && <span className="flex items-center gap-1"><Coins className="w-3.5 h-3.5 text-muted-foreground" />{r.budget.toLocaleString()}원</span>}
              {r.guest_name && <span className="flex items-center gap-1"><UserRound className="w-3.5 h-3.5 text-muted-foreground" />{r.guest_name}</span>}
            </div>

            {r.notes && <p className="text-[13px] text-muted-foreground bg-card rounded-lg px-3 py-2">📝 {r.notes}</p>}

            {/* 연락처 */}
            <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2">
              <span className="text-[12px] text-muted-foreground uppercase shrink-0">{r.contact_type}</span>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-[14px] font-bold text-money underline truncate flex-1">{r.contact_value}</a>
              ) : (
                <span className="text-[14px] font-bold text-foreground truncate flex-1">{r.contact_value}</span>
              )}
              <button onClick={() => copy(r.contact_value)} className="shrink-0 text-muted-foreground hover:text-foreground"><Copy className="w-4 h-4" /></button>
            </div>

            {/* 확정서 */}
            {r.conf && (
              <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 border border-amber-500/25">
                <FileText className="w-3.5 h-3.5 text-brand-amber shrink-0" />
                <span className="text-[13px] font-black text-brand-amber shrink-0">{r.conf.ref_no}</span>
                {r.conf.total_price != null && (
                  <span className="text-[12px] text-money font-bold shrink-0">
                    {r.conf.total_price.toLocaleString()}원
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {/* 손님용 / MD용 링크를 분리 — 토큰이 달라 서로의 화면을 못 본다 */}
                  <span className="text-[10px] text-muted-foreground">손님</span>
                  <a
                    href={`/booking/${r.conf.public_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="손님용 확인서 열기"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => copy(`${window.location.origin}/booking/${r.conf!.public_token}`)}
                    className="text-muted-foreground hover:text-foreground mr-1.5"
                    title="손님용 링크 복사"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-blue-400">MD</span>
                  <a
                    href={`/booking/md/${r.conf.md_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400/70 hover:text-blue-400"
                    title="MD용 확인서 열기"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => copy(`${window.location.origin}/booking/md/${r.conf!.md_token}`)}
                    className="text-blue-400/70 hover:text-blue-400"
                    title="MD용 링크 복사"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setEditing(editing === r.id ? null : r.id)}
              className="w-full h-9 rounded-lg bg-card border border-border text-[13px] font-bold text-foreground/80 hover:border-amber-500/50 flex items-center justify-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              {r.conf ? "확정서 수정" : "담당 MD 지정 · 확정서 작성"}
            </button>

            {editing === r.id && (
              <ConfirmForm
                key={`${r.id}-${r.conf?.ref_no ?? "new"}`}
                req={r}
                onSaved={(c) => applyConf(r.id, c)}
              />
            )}

            {/* 상태 버튼 */}
            <div className="flex gap-2 pt-1">
              {r.status !== "contacted" && (
                <button disabled={busy === r.id} onClick={() => updateStatus(r.id, "contacted")} className="flex-1 h-9 rounded-lg bg-amber-500/15 text-brand-amber text-[13px] font-bold border border-amber-500/30 disabled:opacity-50">연락함</button>
              )}
              {r.status !== "done" && (
                <button disabled={busy === r.id} onClick={() => updateStatus(r.id, "done")} className="flex-1 h-9 rounded-lg bg-green-500/15 text-money text-[13px] font-bold border border-green-500/30 disabled:opacity-50">완료</button>
              )}
              {r.status !== "cancelled" && (
                <button disabled={busy === r.id} onClick={() => updateStatus(r.id, "cancelled")} className="px-3 h-9 rounded-lg bg-muted text-muted-foreground text-[13px] font-bold disabled:opacity-50">취소</button>
              )}
              {r.status === "cancelled" && (
                <button disabled={busy === r.id} onClick={() => deleteReq(r.id)} className="px-3 h-9 rounded-lg bg-red-500/15 text-red-400 text-[13px] font-bold border border-red-500/30 disabled:opacity-50 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />삭제</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 번호 없는 MD는 도착 알림 SMS가 안 가므로 라벨에 표시한다.
function mdLabel(m: { name: string; hasPhone: boolean }): string {
  return m.hasPhone ? m.name : `${m.name} (번호없음)`;
}

// 확정서 입력 — 요청(손님 희망)과 별개로 MD와 합의된 내용을 담는다.
// includes는 줄바꿈으로 여러 줄 입력받아 배열로 저장한다(보틀 목록).
// "2돔페리뇽" 처럼 숫자와 이름을 붙여 쓰는 경우가 많아 "2 돔페리뇽"으로 정규화한다 —
// 안 그러면 확인서에 "2Dom perignon"처럼 붙어서 나가 가독성이 떨어진다.
function normalizeIncludeLine(line: string): string {
  return line.trim().replace(/^(\d+)\s*/, "$1 ");
}
function ConfirmForm({
  req,
  onSaved,
}: {
  req: ForeignReq;
  onSaved: (conf: NonNullable<ForeignReq["conf"]>) => void;
}) {
  const c = req.conf;
  // 후보가 1명뿐이면 미리 선택해둔다 — 고를 게 없는데 고르게 할 이유가 없다.
  const soleMd = req.mdCandidates.length === 1 ? req.mdCandidates[0] : null;
  const initialMd =
    req.mdCandidates.find((m) => m.id === req.assigned_md_id) ?? soleMd ?? null;
  // mdId = 실제로 확정된 선택(목록에서 클릭해야만 채워짐). mdQuery = 입력창에 보이는 글자.
  // 이 둘을 하나로 합치면(예: value=mdQuery, onChange로 mdId도 같이 갱신) "목록에 없는
  // 문자열을 타이핑만 해도 mdId가 빈 값 → assigned_md_id: null로 조용히 저장"되는
  // 문제가 생긴다 — DB 연동 없이 아무 글자나 쳐도 통과되는 버그였다.
  const [mdId, setMdId] = useState(initialMd?.id ?? "");
  const [mdQuery, setMdQuery] = useState(initialMd ? mdLabel(initialMd) : "");
  const [mdOpen, setMdOpen] = useState(false);
  const mdBoxRef = useRef<HTMLDivElement>(null);
  const matchedMd = req.mdCandidates.find((m) => m.id === mdId) ?? null;

  const mdFiltered = useMemo(() => {
    const q = mdQuery.trim().toLowerCase();
    if (!q) return req.mdCandidates;
    return req.mdCandidates.filter((m) => mdLabel(m).toLowerCase().includes(q));
  }, [mdQuery, req.mdCandidates]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (mdBoxRef.current && !mdBoxRef.current.contains(e.target as Node)) {
        setMdOpen(false);
        // 목록에서 안 고르고 밖을 클릭하면 입력값을 마지막 확정 선택으로 되돌린다
        // (또는 비웠으면 미지정 상태 유지) — 어중간한 문자열이 남지 않게.
        setMdQuery(matchedMd ? mdLabel(matchedMd) : "");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [matchedMd]);
  const [clubId, setClubId] = useState(c?.club_id ?? req.club_ids[0] ?? "");
  const [tableInfo, setTableInfo] = useState(c?.table_info ?? "");
  // 인원: 확정서가 아예 없을 때만 요청 인원을 기본값으로 끌어온다.
  // c가 있는데 confirmed_group_size가 null인 건 "지워서 저장한 상태"라 그대로
  // 빈칸을 유지해야 한다 — 안 그러면 지운 게 다음에 열 때 무효화된다.
  const [groupSize, setGroupSize] = useState(
    c ? (c.confirmed_group_size ? String(c.confirmed_group_size) : "") : String(req.group_size)
  );
  const [includes, setIncludes] = useState((c?.includes ?? []).join("\n"));
  // 확정가: 확정서가 아예 없을 때만 손님 희망 예산을 출발점으로 끌어온다.
  // 같은 이유로 c가 있으면 total_price가 null이어도 빈칸을 그대로 유지한다.
  const [price, setPrice] = useState(
    c ? (c.total_price ? String(c.total_price) : "") : req.budget ? String(req.budget) : ""
  );
  // 고객 요청: 확정서가 아예 없을 때만(c가 null) 손님 메모를 기본값으로 끌어온다.
  // c?.guest_request ?? req.notes로 하면 사용자가 빈칸으로 지워 저장해도
  // guest_request가 null이라 매번 req.notes가 다시 채워져 지운 게 무효화된다.
  const [request, setRequest] = useState(c ? (c.guest_request ?? "") : (req.notes ?? ""));
  const [memo, setMemo] = useState(c?.internal_memo ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/admin/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: req.id,
        assigned_md_id: mdQuery.trim() ? mdId || null : null,
        club_id: clubId || null,
        table_info: tableInfo.trim() || null,
        confirmed_group_size: groupSize.trim() || null,
        includes: includes.split("\n").map(normalizeIncludeLine).filter(Boolean),
        total_price: price ? Number(price.replace(/[^0-9]/g, "")) : null,
        guest_request: request.trim() || null,
        internal_memo: memo.trim() || null,
      }),
    });
    setSaving(false);
    const json = await res.json();
    if (!res.ok) return toast.error(json.error ?? "저장 실패");
    toast.success(`확정서 저장 — ${json.ref_no}`);
    onSaved({
      request_id: req.id,
      ref_no: json.ref_no,
      public_token: json.public_token,
      md_token: json.md_token,
      club_id: clubId || null,
      table_info: tableInfo.trim() || null,
      confirmed_group_size: groupSize.trim() || null,
      includes: includes.split("\n").map(normalizeIncludeLine).filter(Boolean),
      total_price: price ? Number(price.replace(/[^0-9]/g, "")) : null,
      guest_request: request.trim() || null,
      internal_memo: memo.trim() || null,
    });
  };

  const inputCls =
    "w-full h-10 px-3 rounded-lg bg-background border border-border text-foreground text-[13px] focus:border-amber-500 outline-none";

  return (
    <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div ref={mdBoxRef} className="relative">
          <label className="text-[11px] text-muted-foreground">담당 MD</label>
          {/* datalist는 목록에 없는 문자열도 그냥 통과시켜서(자유 입력 허용) DB 연동
              없이 아무 글자나 쳐도 저장이 됐다. 직접 만든 드롭다운으로 바꿔
              "목록에서 클릭해야만" mdId가 채워지게 강제한다 — 검색은 되지만
              고르지 않으면 절대 확정되지 않는다. */}
          <input
            value={mdQuery}
            onChange={(e) => {
              setMdQuery(e.target.value);
              setMdId(""); // 타이핑 중엔 아직 확정된 선택이 아니다.
              setMdOpen(true);
            }}
            onFocus={() => setMdOpen(true)}
            placeholder="이름 검색 · 목록에서 선택"
            className={`${inputCls} ${mdQuery && !mdId ? "border-red-500/50" : ""}`}
          />
          {mdQuery && !mdId && (
            <p className="text-[11px] text-red-400 mt-1">목록에서 선택해야 담당자로 지정됩니다</p>
          )}
          {mdOpen && (
            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
              {mdFiltered.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-muted-foreground">일치하는 MD 없음</div>
              ) : (
                mdFiltered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMdId(m.id);
                      setMdQuery(mdLabel(m));
                      setMdOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-muted text-foreground"
                  >
                    {mdLabel(m)}
                  </button>
                ))
              )}
              {mdId && (
                <button
                  type="button"
                  onClick={() => {
                    setMdId("");
                    setMdQuery("");
                    setMdOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[12px] text-muted-foreground hover:bg-muted border-t border-border"
                >
                  선택 해제 (미지정)
                </button>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">확정 클럽</label>
          <select value={clubId} onChange={(e) => setClubId(e.target.value)} className={inputCls}>
            {req.club_ids.map((id, i) => (
              <option key={id} value={id}>{req.clubNames[i]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">인원</label>
          <input
            value={groupSize}
            onChange={(e) => setGroupSize(e.target.value)}
            placeholder={`${req.group_size}명 · 범위도 가능 (예: 8~15명)`}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">자리</label>
          <input value={tableInfo} onChange={(e) => setTableInfo(e.target.value)} placeholder="R zone · 2 tables" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">확정가 (원)</label>
          <input
            value={price ? Number(price.replace(/[^0-9]/g, "")).toLocaleString("en-US") : ""}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="6,200,000"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">포함 내역 (한 줄에 하나)</label>
        <textarea
          value={includes}
          onChange={(e) => setIncludes(e.target.value)}
          rows={3}
          placeholder={"돔페리뇽 루미너스 2\n클라세 아술 레포사도 1"}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-[13px] focus:border-amber-500 outline-none resize-none"
        />
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">고객 요청</label>
        <input value={request} onChange={(e) => setRequest(e.target.value)} placeholder="VIP experience · 대기 없는 입장" className={inputCls} />
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">내부 메모 (손님·클럽 미노출)</label>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="w-full h-10 rounded-lg bg-white text-black text-[13px] font-black disabled:opacity-50"
      >
        {saving ? "저장 중…" : "확정서 저장 · 링크 발급"}
      </button>
    </div>
  );
}
