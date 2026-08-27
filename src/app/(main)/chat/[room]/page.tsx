import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventChatRoomClient } from "@/components/events/EventChatRoomClient";
import { eventSlug } from "@/lib/events/slug";

// 공연 채팅방 (Migration 598)
//
// 와글(/chat)은 지역방 탭 UI라 방 하나를 통째로 여는 라우트가 없었다.
// 공연방은 URL로 공유되고 댓글에서 바로 들어오므로 방 단위 라우트가 필요하다.
// 방 실체는 chat_messages(room='event:<id>:<n>')라 ChatRoom을 그대로 재사용한다.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ room: string }>;
}

export default async function EventChatRoomPage({ params }: PageProps) {
  const { room: roomParam } = await params;
  const room = decodeURIComponent(roomParam);

  // 지역방은 /chat 탭에서 다룬다 — 여기로 오면 안 된다
  if (!room.startsWith("event:")) notFound();

  const supabase = await createClient();
  const { data: roomRow } = await supabase
    .from("event_chat_rooms")
    .select("id, room, title, is_closed, event_id, club_events(id, title, event_date)")
    .eq("room", room)
    .maybeSingle();

  if (!roomRow) notFound();


  const ev = Array.isArray(roomRow.club_events)
    ? roomRow.club_events[0]
    : roomRow.club_events;

  // 방에서 공연으로 돌아가는 링크 — 슬러그는 DB에 없으므로 제목에서 만든다
  const backHref = ev
    ? `/events/${ev.event_date}/${encodeURIComponent(eventSlug(ev.title))}`
    : "/events";

  return (
    <div className="flex flex-col h-[calc(100dvh-56px-env(safe-area-inset-bottom))] max-w-lg mx-auto bg-background overflow-hidden">
      {/* 헤더는 ChatRoom 안(뒤로가기 옆)에 넣는다 — 밖에서 또 그리면 뒤로가기가
          두 줄로 겹친다. 제목 줄은 공연으로 돌아가는 링크를 겸한다. */}
      <EventChatRoomClient
        room={room}
        title={roomRow.title}
        eventTitle={ev?.title ?? null}
        backHref={backHref}
        isClosed={roomRow.is_closed}
      />
    </div>
  );
}
