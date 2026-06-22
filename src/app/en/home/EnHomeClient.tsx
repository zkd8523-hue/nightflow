"use client";

// NOTE: 원본은 SWC 빌드 파싱 에러로 임시 stub 처리됨 (/tmp/EnHomeClient.backup.tsx 백업).
// 외국인 /en 홈 화면 작업 마무리 후 복원 필요.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function EnHomeClient(_props: { flags?: unknown[] }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-black text-white mb-2">NightFlow EN</h1>
        <p className="text-neutral-400 text-[13px]">
          The English home is being polished. Please come back soon.
        </p>
      </div>
    </div>
  );
}
