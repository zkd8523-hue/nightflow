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
      <PushInit />
      <LoginNotifyPromptInit />
      <NetworkOverlay />
      <WinAlertBanner />
      <FavoritesProvider>
        {children}
      </FavoritesProvider>
    </ThemeProvider>
  );
}
