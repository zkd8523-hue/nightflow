"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Search, Copy, CheckCircle2, XCircle, Ban } from "lucide-react";
import { toast } from "sonner";

interface UserRow {
  id: string;
  display_name: string | null;
  phone: string | null;
  role: string | null;
  alimtalk_consent: boolean | null;
  alimtalk_consent_at: string | null;
  created_at: string;
  deleted_at: string | null;
  is_blocked: boolean | null;
}

type Filter = "all" | "consented" | "sendable" | "no_consent";

function formatPhone(phone: string | null): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

export function MarketingConsentTable({ users }: { users: UserRow[] }) {
  const [filter, setFilter] = useState<Filter>("sendable");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "user_only" | "md_only">("user_only");

  const filtered = useMemo(() => {
    let rows = users;
    if (filter === "consented") rows = rows.filter(u => u.alimtalk_consent === true);
    else if (filter === "sendable") rows = rows.filter(u => u.alimtalk_consent === true && u.phone && !u.is_blocked);
    else if (filter === "no_consent") rows = rows.filter(u => !u.alimtalk_consent);

    if (roleFilter === "user_only") rows = rows.filter(u => u.role !== "md");
    else if (roleFilter === "md_only") rows = rows.filter(u => u.role === "md");

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(u =>
        (u.display_name?.toLowerCase().includes(q)) ||
        (u.phone?.replace(/\D/g, "").includes(q.replace(/\D/g, "")))
      );
    }
    return rows;
  }, [users, filter, search, roleFilter]);

  const downloadCsv = () => {
    const header = ["id", "display_name", "phone", "alimtalk_consent", "alimtalk_consent_at", "created_at"];
    const escape = (v: string | null) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const rows = filtered.map(u => [
      u.id,
      u.display_name ?? "",
      u.phone ?? "",
      u.alimtalk_consent ? "Y" : "N",
      u.alimtalk_consent_at ?? "",
      u.created_at,
    ].map(escape).join(","));
    const csv = "﻿" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketing_consent_${dayjs().format("YYYYMMDD_HHmm")}_${filter}_${filtered.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length}건 CSV 다운로드 완료`);
  };

  const copyPhones = async () => {
    const phones = filtered
      .map(u => u.phone?.replace(/\D/g, ""))
      .filter((p): p is string => !!p);
    if (phones.length === 0) {
      toast.error("복사할 번호가 없습니다");
      return;
    }
    await navigator.clipboard.writeText(phones.join("\n"));
    toast.success(`${phones.length}개 번호 복사됨`);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="bg-[#1C1C1E] border-neutral-800 p-4 flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            ["sendable", "발송가능"],
            ["consented", "동의 전체"],
            ["no_consent", "미동의"],
            ["all", "전체"],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
                filter === key
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}

          <div className="w-px h-5 bg-neutral-700 mx-1 self-center" />

          {([
            ["user_only", "유저만"],
            ["md_only", "MD만"],
            ["all", "전체"],
          ] as ["all" | "user_only" | "md_only", string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors border ${
                roleFilter === key
                  ? key === "md_only"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-white text-black border-white"
                  : "bg-neutral-800 text-neutral-500 border-transparent hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름·번호 검색"
              className="pl-9 pr-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-white text-[13px] placeholder-neutral-600 focus:outline-none focus:border-white w-44"
            />
          </div>
          <Button onClick={copyPhones} variant="outline" className="border-neutral-700 text-white hover:bg-neutral-800 gap-1.5">
            <Copy className="w-4 h-4" /> 번호복사
          </Button>
          <Button onClick={downloadCsv} className="bg-amber-500 text-black hover:bg-amber-400 font-black gap-1.5">
            <Download className="w-4 h-4" /> CSV
          </Button>
        </div>
      </Card>

      <div className="text-[13px] text-neutral-500">
        {filtered.length.toLocaleString()}명 표시
      </div>

      {/* Table */}
      <Card className="bg-[#1C1C1E] border-neutral-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-neutral-900 text-neutral-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-bold">닉네임</th>
                <th className="text-left px-4 py-3 font-bold">전화번호</th>
                <th className="text-left px-4 py-3 font-bold">동의</th>
                <th className="text-left px-4 py-3 font-bold">동의일</th>
                <th className="text-left px-4 py-3 font-bold">가입일</th>
                <th className="text-left px-4 py-3 font-bold">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-medium text-white">
                    {u.display_name || <span className="text-neutral-600">-</span>}
                    {u.role === "md" && <span className="ml-2 text-[10px] text-amber-400 font-bold">MD</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-300">{formatPhone(u.phone)}</td>
                  <td className="px-4 py-3">
                    {u.alimtalk_consent ? (
                      <span className="inline-flex items-center gap-1 text-green-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Y
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-neutral-600">
                        <XCircle className="w-3.5 h-3.5" /> N
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {u.alimtalk_consent_at ? dayjs(u.alimtalk_consent_at).format("YY.MM.DD") : "-"}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {dayjs(u.created_at).format("YY.MM.DD")}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_blocked ? (
                      <span className="inline-flex items-center gap-1 text-red-400 font-bold text-[11px]">
                        <Ban className="w-3 h-3" /> 차단
                      </span>
                    ) : (
                      <span className="text-neutral-500 text-[11px]">정상</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-neutral-600">
                    조건에 맞는 유저가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
