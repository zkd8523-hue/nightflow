"use client";

import { createContext, useContext, useEffect } from "react";
import { useWinNotification } from "@/hooks/useWinNotification";
import { useAuthInit, useCurrentUser } from "@/hooks/useCurrentUser";
import { useTouchLastSeen } from "@/hooks/useTouchLastSeen";
import { useFavoriteClubs } from "@/hooks/useFavoriteClubs";
import { useFavoriteMds } from "@/hooks/useFavoriteMds";
import { useFavoriteDjs } from "@/hooks/useFavoriteDjs";
import { useFavoriteArtists } from "@/hooks/useFavoriteArtists";
import { initAnalytics } from "@/lib/analytics";
import { identifyUser } from "@/lib/analytics/events";
import { WinAlertBanner } from "@/components/auctions/WinAlertBanner";
import { NetworkOverlay } from "@/components/NetworkOverlay";
import { AppLangGate } from "@/components/layout/AppLangGate";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { LoginNotifyPromptSheet } from "@/components/common/LoginNotifyPromptSheet";
import { initDeepLinkHandler, initBackButtonHandler } from "@/lib/native/deepLink";
import { ThemeProvider } from "@/components/theme-provider";

function AuthInit() {
  // 앱 전체에서 단 1회만 auth.getUser/onAuthStateChange 실행.
  // 다른 컴포넌트는 useCurrentUser() 로 Zustand store 만 읽음.
  useAuthInit();
  return null;
}

function GlobalNotifications() {
  useWinNotification();
  return null;
}

function MixpanelInit() {
  const { user } = useCurrentUser();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (user) {
      identifyUser(user.id, {
        $name: user.name,
        role: user.role,
        area: user.area,
      });
    }
  }, [user]);

  return null;
}

// 클럽 찜 Context — 앱 전체에서 한 번만 API 호출
type FavoritesContextType = ReturnType<typeof useFavoriteClubs>;

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function useFavoritesContext() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    return {
      favorites: [],
      isLoading: false,
      isFavorited: () => false,
      toggleFavorite: async () => {},
    } as FavoritesContextType;
  }
  return ctx;
}

// MD 찜 Context — 앱 전체에서 한 번만 API 호출
type MdFavoritesContextType = ReturnType<typeof useFavoriteMds>;

const MdFavoritesContext = createContext<MdFavoritesContextType | null>(null);

export function useMdFavoritesContext() {
  const ctx = useContext(MdFavoritesContext);
  if (!ctx) {
    return {
      favoriteMds: [],
      isLoading: false,
      isFavoritedMd: () => false,
      toggleFavoriteMd: async () => {},
    } as MdFavoritesContextType;
  }
  return ctx;
}

// DJ 찜 Context — 앱 전체에서 한 번만 API 호출 (Migration 570)
type DjFavoritesContextType = ReturnType<typeof useFavoriteDjs>;

const DjFavoritesContext = createContext<DjFavoritesContextType | null>(null);

export function useDjFavoritesContext() {
  const ctx = useContext(DjFavoritesContext);
  // Provider 밖에서 호출돼도 throw하지 않고 no-op을 준다 — SSR/Provider 외부 안전성.
  // 클럽·MD 찜과 동일한 방어 패턴.
  if (!ctx) {
    return {
      favoriteDjs: [],
      isLoading: false,
      isFavoritedDj: () => false,
      toggleFavoriteDj: async () => {},
    } as DjFavoritesContextType;
  }
  return ctx;
}

// 아티스트 찜 Context — DJ 찜(570)과 같은 구조 (Migration 608)
type ArtistFavoritesContextType = ReturnType<typeof useFavoriteArtists>;

const ArtistFavoritesContext = createContext<ArtistFavoritesContextType | null>(null);

export function useArtistFavoritesContext() {
  const ctx = useContext(ArtistFavoritesContext);
  // Provider 밖에서 호출돼도 throw하지 않고 no-op을 준다(클럽·MD·DJ와 동일 방어).
  if (!ctx) {
    return {
      favoriteArtists: [],
      isLoading: false,
      isFavoritedArtist: () => false,
      toggleFavoriteArtist: async () => {},
    } as ArtistFavoritesContextType;
  }
  return ctx;
}

function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const favoritesValue = useFavoriteClubs(user?.id);
  const mdFavoritesValue = useFavoriteMds(user?.id);
  const djFavoritesValue = useFavoriteDjs(user?.id);
  const artistFavoritesValue = useFavoriteArtists(user?.id);

  return (
    <FavoritesContext.Provider value={favoritesValue}>
      <MdFavoritesContext.Provider value={mdFavoritesValue}>
        <DjFavoritesContext.Provider value={djFavoritesValue}>
          <ArtistFavoritesContext.Provider value={artistFavoritesValue}>
            {children}
          </ArtistFavoritesContext.Provider>
        </DjFavoritesContext.Provider>
      </MdFavoritesContext.Provider>
    </FavoritesContext.Provider>
  );
}

function PushInit() {
  const { user } = useCurrentUser();
  if (!user) return null;
  return <PushPermissionPrompt userId={user.id} />;
}

function LoginNotifyPromptInit() {
  const { user } = useCurrentUser();
  if (!user) return null;
  return <LoginNotifyPromptSheet />;
}

// 앱이 정상 부팅됐다 = 새 빌드로 갈아타는 데 성공했다.
// error.tsx가 낡은 빌드(ChunkLoadError) 자동 리로드를 1회로 제한하려고 심어둔
// 세션 플래그를 여기서 지운다. 안 지우면 그 세션 동안 두 번째 배포가 나갔을 때
// 자동 복구가 죽고 유저가 수동으로 버튼을 눌러야 한다.
function StaleBuildFlagReset() {
  useEffect(() => {
    try {
      sessionStorage.removeItem("nf_stale_build_reloaded");
    } catch {
      /* sessionStorage 차단 환경 — 지울 것도 없다 */
    }
  }, []);
  return null;
}

function DeepLinkInit() {
  useEffect(() => {
    initDeepLinkHandler();
    initBackButtonHandler();
  }, []);
  return null;
}

function LastSeenInit() {
  const { user } = useCurrentUser();
  useTouchLastSeen(user?.id);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {/* AuthInit 은 반드시 최상단 — 다른 컴포넌트가 useCurrentUser() 로 store 를 읽기 전에 mount */}
      <AuthInit />
      <LastSeenInit />
      <GlobalNotifications />
      <MixpanelInit />
      <DeepLinkInit />
      <StaleBuildFlagReset />
      <PushInit />
      <LoginNotifyPromptInit />
      <NetworkOverlay />
      {/* 앱 첫 실행 언어 선택 — 루트 레이아웃 소속이라 /en·/ja·/zh 까지 전부 커버.
          (main)/layout 에 두면 미들웨어가 이미 외국어 경로로 302 시킨 뒤라 영영 안 뜬다. */}
      <AppLangGate />
      <WinAlertBanner />
      <FavoritesProvider>
        {children}
      </FavoritesProvider>
    </ThemeProvider>
  );
}
