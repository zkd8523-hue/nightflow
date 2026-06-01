"use client";

import { createContext, useContext, useEffect } from "react";
import { useWinNotification } from "@/hooks/useWinNotification";
import { useAuthInit, useCurrentUser } from "@/hooks/useCurrentUser";
import { useTouchLastSeen } from "@/hooks/useTouchLastSeen";
import { useFavoriteClubs } from "@/hooks/useFavoriteClubs";
import { useFavoriteMds } from "@/hooks/useFavoriteMds";
import { initAnalytics, identifyUser } from "@/lib/analytics";
import { WinAlertBanner } from "@/components/auctions/WinAlertBanner";
import { NetworkOverlay } from "@/components/NetworkOverlay";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { initDeepLinkHandler, initBackButtonHandler } from "@/lib/native/deepLink";

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

function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const favoritesValue = useFavoriteClubs(user?.id);
  const mdFavoritesValue = useFavoriteMds(user?.id);

  return (
    <FavoritesContext.Provider value={favoritesValue}>
      <MdFavoritesContext.Provider value={mdFavoritesValue}>
        {children}
      </MdFavoritesContext.Provider>
    </FavoritesContext.Provider>
  );
}

function PushInit() {
  const { user } = useCurrentUser();
  if (!user) return null;
  return <PushPermissionPrompt userId={user.id} />;
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
    <>
      {/* AuthInit 은 반드시 최상단 — 다른 컴포넌트가 useCurrentUser() 로 store 를 읽기 전에 mount */}
      <AuthInit />
      <LastSeenInit />
      <GlobalNotifications />
      <MixpanelInit />
      <DeepLinkInit />
      <PushInit />
      <NetworkOverlay />
      <WinAlertBanner />
      <FavoritesProvider>
        {children}
      </FavoritesProvider>
    </>
  );
}
