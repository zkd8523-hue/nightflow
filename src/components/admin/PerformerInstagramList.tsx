"use client";

import { useState } from "react";
import { ExternalLink, Check } from "lucide-react";

export interface PerformerRow {
  id: string;
  kind: "dj" | "artist";
  display_name: string;
  instagram: string | null;
  event_count: number;
  upcoming: boolean;
  /** 최근/예정 출연 장소 — 동명이인 판별용 힌트 */
  hint: string | null;
}

function SearchLinks({ name, hint, kind }: { name: string; hint: string | null; kind: "dj" | "artist" }) {
  // "이름 + DJ/래퍼"가 가장 잘 맞는다 — 구글 AI 요약이 "한국 활동 vs 해외 활동"까지
  // 구분해준다(실측: "victa dj" → @victa_dj 홍대 레지던트, @victaeva 태국 DJ 구분).
  // 클럽명을 넣으면 오히려 클럽 계정만 상위에 뜨므로 검색어에서 뺀다.
  const role = kind === "dj" ? "DJ" : "래퍼";
  const q = encodeURIComponent(`${name} ${role}`);
  const igq = encodeURIComponent(name);
  // 유튜브·사운드클라우드는 구글과 규칙이 반대다 — **출연 장소를 넣는 게 맞다.**
  // 셋 영상 제목이 "NAME @ CLUB" 꼴이라 클럽명이 동명이인을 갈라주는 열쇠가 된다
  // (구글에선 클럽 공식 계정이 상위로 올라와 방해가 되므로 빼는 것과 정반대).
  // 짧은 영단어 이름(YUUKI·IMPACT·RABI 등)은 이 두 곳이 사실상 유일한 활로다:
  // 인스타 팔로잉과 달리 두 사이트는 공개 색인되고, 프로필·설명란에 본인 인스타를
  // 직접 적어두는 경우가 많다.
  const ytq = encodeURIComponent([name, role, hint].filter(Boolean).join(" "));
  const scq = encodeURIComponent(name);
  return (
    <span className="flex items-center gap-2 text-[11px]">
      <a
        href={`https://www.google.com/search?q=${q}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-neutral-500 hover:text-green-500 inline-flex items-center gap-0.5"
      >
        구글 <ExternalLink className="w-2.5 h-2.5" aria-hidden />
      </a>
      <a
        href={`https://www.instagram.com/explore/search/keyword/?q=${igq}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-neutral-500 hover:text-green-500 inline-flex items-center gap-0.5"
      >
        인스타 <ExternalLink className="w-2.5 h-2.5" aria-hidden />
      </a>
      <a
        href={`https://www.youtube.com/results?search_query=${ytq}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-neutral-500 hover:text-green-500 inline-flex items-center gap-0.5"
      >
        유튜브 <ExternalLink className="w-2.5 h-2.5" aria-hidden />
      </a>
      <a
        href={`https://soundcloud.com/search/people?q=${scq}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-neutral-500 hover:text-green-500 inline-flex items-center gap-0.5"
      >
        SC <ExternalLink className="w-2.5 h-2.5" aria-hidden />
      </a>
    </span>
  );
}

function Row({ row }: { row: PerformerRow }) {
  const [value, setValue] = useState(row.instagram ?? "");
  const [saved, setSaved] = useState<string | null>(row.instagram);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/performers/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.kind, id: row.id, instagram: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");
      setSaved(json.instagram);
      setValue(json.instagram ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl bg-[#1C1C1E] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-sm truncate">{row.display_name}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                row.kind === "dj" ? "bg-violet-500/15 text-violet-400" : "bg-green-500/15 text-green-400"
              }`}
            >
              {row.kind === "dj" ? "DJ" : "아티스트"}
            </span>
            {row.upcoming && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                예정
              </span>
            )}
          </span>
          {row.hint && <p className="mt-0.5 text-[11px] text-neutral-600 truncate">{row.hint}</p>}
        </div>
        <span className="shrink-0 text-[11px] text-neutral-500 tabular-nums">{row.event_count}회</span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder="핸들 또는 인스타 URL 붙여넣기"
          className="min-w-0 flex-1 rounded-lg bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-700"
        />
        <button
          onClick={save}
          disabled={busy}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black disabled:opacity-40"
        >
          {busy ? "..." : "저장"}
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <SearchLinks name={row.display_name} hint={row.hint} kind={row.kind} />
        {saved && (
          <a
            href={`https://instagram.com/${saved}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-green-500"
          >
            <Check className="w-3 h-3" aria-hidden /> @{saved}
          </a>
        )}
        {err && <span className="text-[11px] text-red-400">{err}</span>}
      </div>
    </li>
  );
}

export function PerformerInstagramList({ rows }: { rows: PerformerRow[] }) {
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [kind, setKind] = useState<"all" | "dj" | "artist">("all");

  const byKind = kind === "all" ? rows : rows.filter((r) => r.kind === kind);
  const list = byKind.filter((r) => (tab === "todo" ? !r.instagram : !!r.instagram));

  const todoCount = byKind.filter((r) => !r.instagram).length;
  const doneCount = byKind.length - todoCount;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["todo", `미입력 ${todoCount}`],
            ["done", `완료 ${doneCount}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              tab === k ? "bg-white text-black" : "bg-white/5 text-neutral-400"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="w-px self-stretch bg-white/10 mx-1" />
        {(
          [
            ["all", "전체"],
            ["dj", "DJ"],
            ["artist", "아티스트"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              kind === k ? "bg-white text-black" : "bg-white/5 text-neutral-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-[#1C1C1E] px-5 py-10 text-center text-sm text-neutral-500">
          해당하는 대상이 없습니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <Row key={`${r.kind}-${r.id}`} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
