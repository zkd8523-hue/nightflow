import { Clock } from "lucide-react";
import { makeT, type Lang } from "@/lib/i18n";

// 예약 중개가 아직 안 되는 클럽에서 예약 버튼 자리에 들어가는 안내.
//
// 왜 버튼을 그냥 비우지 않는가: 손님이 클럽 정보를 다 읽고 아무 표시도 없으면
// 왜 예약이 안 되는지 알 수 없다. 이 페이지들은 외국인 유입의 28.6%가 들어오는
// 자리라(2026-09-06 실측) 그냥 두면 그만큼이 영문도 모른 채 빠진다.
//
// 연락처를 받아 "예약 가능해지면 알려주는" 안도 검토했지만 접었다 —
// 받은 연락처가 인스타·왓츠앱·위챗이면 자동 발송이 불가능하고, 애초에
// 클럽이 예약 가능해지는 건 MD 섭외가 끝나야 하는 일이라 알림 보낼 일 자체가
// 드물다. 지킬 수 없는 약속을 걸어두는 대신 상태만 정직하게 알린다.
//
// 대신 바로 아래에 "이 지역에서 지금 예약되는 클럽"을 붙여 갈 곳을 준다.

export function BookingComingSoon({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  return (
    <div className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-muted border border-border text-muted-foreground font-bold text-[14px]">
      <Clock className="w-4 h-4 shrink-0" />
      {t("예약 준비 중", "Booking coming soon")}
    </div>
  );
}
