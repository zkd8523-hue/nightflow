import { LoginClient } from "./LoginClient";

// 서버 컴포넌트로 승격: searchParams를 SSR에서 파싱해 LoginClient에 prop으로 전달.
// 이전엔 useSearchParams()가 Suspense fallback으로 폴백돼 첫 렌더에 lang이 null → 텍스트 flash 발생.
// 특히 외국인이 /login?lang=en 진입 시 한국어(빈 문자열)로 잠깐 렌더된 뒤 영어로 확정되는 현상.
// 이제 서버에서 lang을 확정한 뒤 클라이언트로 넘겨 첫 프레임부터 정확한 언어로 렌더.

interface PageProps {
  searchParams: Promise<{
    lang?: string;
    redirect?: string;
    error?: string;
  }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const lang = params.lang ?? null;
  const redirectPath = params.redirect || "/";
  const authErrorCode = params.error ?? null;

  return (
    <LoginClient
      lang={lang}
      redirectPath={redirectPath}
      authErrorCode={authErrorCode}
    />
  );
}
