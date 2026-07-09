"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle, Ban, BarChart, CalendarCheck, Flag, Gift, LayoutGrid, Megaphone,
  MessageSquareWarning, ShieldAlert, Sparkles, Star, Store, Users, X, Check, RotateCcw, Pencil,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  AlertCircle, Ban, BarChart, CalendarCheck, Flag, Gift, LayoutGrid, Megaphone,
  MessageSquareWarning, ShieldAlert, Sparkles, Star, Store, Users,
};

export interface DashboardStat {
  id: string;
  label: string;
  value: string;
  iconName: string;
  color: string;
  bgColor: string;
  badge: string | null;
  href: string;
}

const ORDER_KEY = "admin_dash_order_v1";
const HIDDEN_KEY = "admin_dash_hidden_v1";

export function AdminDashboardGrid({ stats }: { stats: DashboardStat[] }) {
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [edit, setEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
      const h = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]");
      if (Array.isArray(o)) setOrder(o);
      if (Array.isArray(h)) setHidden(h);
    } catch {
      /* noop */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  }, [order, hidden, loaded]);

  const byId = new Map(stats.map((s) => [s.id, s]));
  // 저장된 순서 우선 + 새로 추가된 카드는 뒤에 붙임
  const fullOrder = [
    ...order.filter((id) => byId.has(id)),
    ...stats.filter((s) => !order.includes(s.id)).map((s) => s.id),
  ];
  const visibleIds = fullOrder.filter((id) => !hidden.includes(id));
  const hiddenCount = stats.filter((s) => hidden.includes(s.id)).length;

  // 편집 모드: 살짝 움직이면 바로 드래그 / 일반 모드: 꾹 눌러야(롱프레스) 드래그 시작
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: edit ? { distance: 5 } : { delay: 220, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: edit ? { delay: 80, tolerance: 8 } : { delay: 220, tolerance: 8 },
    }),
  );

  // 드래그 중/직후 플래그 — 이 동안 카드 클릭(이동) 억제
  const draggingRef = useRef(false);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const oldIndex = fullOrder.indexOf(String(active.id));
      const newIndex = fullOrder.indexOf(String(over.id));
      if (oldIndex >= 0 && newIndex >= 0) setOrder(arrayMove(fullOrder, oldIndex, newIndex));
    }
    // pointerup 직후 발생하는 click까지 억제
    setTimeout(() => {
      draggingRef.current = false;
    }, 200);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-neutral-500">
          {edit ? "드래그로 순서 변경 · X로 숨기기" : hiddenCount > 0 ? `숨긴 카드 ${hiddenCount}개` : ""}
        </p>
        <div className="flex gap-2">
          {hiddenCount > 0 && (
            <button
              onClick={() => setHidden([])}
              className="inline-flex items-center gap-1 text-[12px] font-bold text-neutral-300 px-3 h-8 rounded-full border border-neutral-700 hover:bg-neutral-800"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 전체 복원
            </button>
          )}
          {edit ? (
            <button
              onClick={() => setEdit(false)}
              className="inline-flex items-center gap-1 text-[12px] font-black text-black px-3 h-8 rounded-full bg-white hover:bg-neutral-200"
            >
              <Check className="w-3.5 h-3.5" /> 완료
            </button>
          ) : (
            <button
              onClick={() => setEdit(true)}
              className="inline-flex items-center gap-1 text-[12px] font-bold text-neutral-300 px-3 h-8 rounded-full border border-neutral-700 hover:bg-neutral-800"
            >
              <Pencil className="w-3.5 h-3.5" /> 편집
            </button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => { draggingRef.current = true; setEdit(true); }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-4">
            {visibleIds.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              return <SortableCard key={id} stat={s} edit={edit} draggingRef={draggingRef} onDelete={() => setHidden((h) => [...h, id])} />;
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableCard({ stat, edit, draggingRef, onDelete }: { stat: DashboardStat; edit: boolean; draggingRef: React.MutableRefObject<boolean>; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stat.id });
  const Icon = ICONS[stat.iconName] ?? Sparkles;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };

  const inner = (
    <div
      className={`relative bg-[#1C1C1E] border rounded-2xl p-5 transition-all group ${
        edit ? "border-neutral-600 scale-[0.98]" : "border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900/50"
      } ${isDragging ? "shadow-2xl border-neutral-500" : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`${stat.bgColor} p-2 rounded-xl group-hover:scale-110 transition-transform`}>
          <Icon className={`w-5 h-5 ${stat.color}`} />
        </div>
        {stat.badge && !edit && (
          <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-500 rounded-full font-bold">{stat.badge}</span>
        )}
      </div>
      <p className="text-neutral-500 text-sm font-bold mb-1">{stat.label}</p>
      <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>

      {edit && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="숨기기"
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg z-10 hover:bg-red-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  // DOM 구조를 모드와 무관하게 고정(항상 div>Link) — 드래그 중 setEdit로 구조가 바뀌면
  // dnd-kit이 노드를 놓쳐 드래그가 끊기므로, 편집 시엔 Link 이동만 막는다.
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={edit ? "touch-none cursor-grab active:cursor-grabbing select-none" : ""}
    >
      <Link
        href={stat.href}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => {
          if (edit || isDragging || draggingRef.current) e.preventDefault();
        }}
        className="block"
      >
        {inner}
      </Link>
    </div>
  );
}
