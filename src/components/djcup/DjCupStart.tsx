"use client";

import Link from "next/link";
import { Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadScApi, preconnectSoundcloud, warmSoundcloud } from "@/components/djs/DjPreviewButton";
import { ROUND_SIZES, type DjCupCandidate, type RoundSize } from "@/lib/djCup/types";
import { availableRoundSizes, pickCandidates } from "@/lib/djCup/candidates";
import { shareDjCup } from "@/lib/utils/share";

/**
 * DJ 이상형 월드컵 시작 화면.
 *
 * 레퍼런스처럼 4강~128강 사다리 전체를 낸다. 256강은 아예 그리지 않는다 —
 * 후보 153명으로는 낼 수 없는 라운드고, 흐린 채로 두면 "없는 기능을 광고"하는
 * 셈이 된다(발견 카드가 0명일 때 null을 내는 규약과 동일). pool.length 기반
 * 판정이라 후보가 늘면 자동으로 더 큰 라운드가 나타난다 — 하드코딩 없음.
 */
export function DjCupStart({
  pool,
  onStart,
}: {
  pool: DjCupCandidate[];
  onStart: (roundSize: RoundSize, candidates: DjCupCandidate[]) => void;
}) {
  const poolSize = pool.length;
  const available = availableRoundSizes(poolSize, ROUND_SIZES);
  const [selected, setSelected] = useState<RoundSize>(
    // 16강을 기본값으로 — 완주율과 대진 다양성의 중간 지점
    available.includes(16) ? 16 : (available[available.length - 1] ?? available[0])
  );

  // 시작 화면에 머무는 몇 초(라운드 크기 고르는 시간)를 재생 준비에 쓴다.
  // 이걸 안 하면 첫 곡 재생이 이렇게 직렬로 흐른다:
  //   시작 클릭 → w.soundcloud.com DNS+TLS → iframe HTML → widget.sndcdn.com
  //   DNS+TLS → 위젯 본체 1.25MB → 그제서야 api.js 요청 → SC.Widget 바인딩 → play()
  // 앞의 두 핸드셰이크와 api.js는 후보가 누구든 상관없이 미리 끝낼 수 있다.
  //
  //  1) preconnect — 사클 도메인 DNS+TLS를 미리 끝낸다. DJ컵은 사이트에서
  //     가장 재생이 많은 화면인데 정작 이 힌트가 걸린 적이 없었다
  //     (warmSoundcloud를 타는 발견 카드 경로만 preconnect를 불렀다).
  //  2) api.js — SC.Widget이 있어야 play()를 부를 수 있는데, 예전엔 첫 곡
  //     src를 채운 "뒤에야" 이 스크립트를 받으러 갔다(startLoading 안).
  //     여기서 미리 받아두면 loadScApi()가 즉시 resolve돼 그 구간이 사라진다.
  //
  // 둘 다 내부에 1회 가드가 있어 중복 호출은 무해하다.
  useEffect(() => {
    preconnectSoundcloud();
    loadScApi();
  }, []);

  // 대진을 "시작 클릭 시점"이 아니라 지금 미리 뽑아둔다.
  //
  // 예열의 가장 큰 덩어리는 iframe HTML 인데(CloudFront 히트 50~60ms vs
  // 미스 1.4초), 이 캐시는 URL 단위라 "그 DJ 의 주소"를 실제로 찔러봐야
  // 데워진다. 예전엔 pickCandidates 가 시작 클릭 순간에 셔플해서 그 전엔
  // 누가 나올지 몰랐고 — 그래서 아무도 데울 수 없었다.
  //
  // 여기서 한 번 뽑아 그대로 onStart 로 넘기면 무작위성은 그대로 두면서
  // (셔플은 여전히 crypto 기반, 매 방문마다 새 대진) 첫 매치 참가자를
  // 미리 알 수 있다. 풀 전체를 섞어두고 라운드 크기만큼 앞에서 잘라 쓰므로,
  // 크기 버튼을 눌러도 앞쪽 대진은 그대로다 — 이미 데운 예열이 헛돌지 않는다.
  const picked = useMemo(() => pickCandidates(pool, pool.length), [pool]);

  // 첫 매치 2명 + 다음 매치 2명까지만 데운다. 라운드 전체(최대 128명)를
  // 한꺼번에 찌르면 keepalive fetch 가 브라우저 동시 연결 한도에 걸려
  // 정작 첫 곡이 뒤로 밀린다(candidates.ts upcomingCandidates 주석과 동일 판단).
  //
  // ⚠️ autoPlay=false — DJ컵 재생 iframe 과 같은 URL 이어야 CloudFront 가
  // 히트한다. true 로 데우면 홈 발견 카드용 엔트리만 데워지고 정작
  // DJ컵에선 전부 미스가 난다(playerSrc 주석 참고).
  useEffect(() => {
    if (picked.length === 0) return;
    warmSoundcloud(
      picked.slice(0, 4).map((c) => c.soundcloud_url),
      false
    );
  }, [picked]);

  if (available.length === 0) return null;

  return (
    <div className="flex flex-col">
      {/* 히어로 이미지 — 시작 화면이 텍스트와 버튼만이라 허전했다.
          OG/홈 배너와 같은 DJ 대결 일러스트를 써서 공유 링크로 들어온
          사람이 카드에서 본 그림을 그대로 만나게 한다. 모바일 5:3 /
          웹 3:1 두 장을 비율에 맞춰 교체(홈 배너와 동일 규약). */}
      <div
        className="w-full rounded-2xl overflow-hidden bg-[#121214] bg-cover bg-center aspect-[5/3] mt-2 sm:hidden"
        style={{ backgroundImage: "url('/og-djcup-mobile.jpg')" }}
        aria-hidden="true"
      />
      <div
        className="w-full rounded-2xl overflow-hidden bg-[#121214] bg-cover bg-center aspect-[3/1] mt-2 hidden sm:block"
        style={{ backgroundImage: "url('/og-djcup-web.jpg')" }}
        aria-hidden="true"
      />
      <div className="text-center pt-4 pb-1">
        <h1
          className="text-[26px] font-black text-white tracking-[-0.035em] leading-tight"
          style={{ textWrap: "balance" }}
        >
          나랑 취향 찰떡인 DJ는 누구?
        </h1>
        <p className="text-[14px] font-bold text-muted-foreground mt-2 leading-relaxed">
          DJ 이상형 월드컵
          <br />
          <span className="text-[#39ff6a] font-bold" style={{ textShadow: "0 0 8px rgba(57,255,106,.45)" }}>
            재생 가능한 DJ {poolSize}명
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 justify-center my-2.5">
        {available.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => setSelected(size)}
            className={`h-9 px-3.5 rounded-full border text-[11.5px] font-bold transition-colors ${
              selected === size
                ? "bg-white border-white text-black"
                : "border-border text-muted-foreground"
            }`}
          >
            {size}강
          </button>
        ))}
      </div>

      {/* 시작하는 라운드 참가자 전원의 미리듣기를 한 번에 미리 로드해서
          매치마다 로딩 없이 바로 재생되게 한다 — 그만큼 데이터를 미리
          당겨온다는 뜻이라 와이파이 환경을 권장한다. */}
      <p className="text-center text-[10px] text-muted-foreground mb-2.5">
        📶 원활한 재생을 위해 와이파이 환경을 권장해요 · 데이터가 발생할 수 있어요
      </p>

      <div className="grid grid-cols-[2fr_1fr_1fr] gap-1.5">
        <button
          type="button"
          onClick={() => onStart(selected, picked.slice(0, selected))}
          className="h-[38px] rounded-xl bg-white text-black font-black text-[12.5px] tracking-[-0.02em] inline-flex items-center justify-center gap-1"
        >
          <span aria-hidden="true">▶</span> 시작하기
        </button>
        <Link
          href="/dj-cup/ranking"
          className="h-[38px] rounded-xl border border-border text-white font-black text-[11px] tracking-[-0.02em] inline-flex flex-col items-center justify-center gap-0.5"
        >
          <span aria-hidden="true">🏆</span> 랭킹보기
        </Link>
        <button
          type="button"
          onClick={() => shareDjCup()}
          className="h-[38px] rounded-xl border border-border text-white font-black text-[11px] tracking-[-0.02em] inline-flex flex-col items-center justify-center gap-0.5"
        >
          <Share2 className="w-3.5 h-3.5" aria-hidden="true" /> 공유
        </button>
      </div>
    </div>
  );
}
