"use client";

import { createContext, useContext, useEffect } from "react";
import { useWinNotification } from "@/hooks/useWinNotification";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFavoriteClubs } from "@/hooks/useFavoriteClubs";
import { initAnalytics, identifyUser } from "@/lib/analytics";
import { WinAlertBanner } from "@/components/auctions/WinAlertBanner";

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

// 찜 기능 Context — 앱 전체에서 한 번만 API 호출
type FavoritesContextType = ReturnType<typeof useFavoriteClubs>;

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function useFavoritesContext() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    // Context 외부에서 호출 시 빈 상태 반환 (fallback)
    return {
      favorites: [],
      isLoading: false,
      isFavorited: () => false,
      toggleFavorite: async () => {},
    } as FavoritesContextType;
  }
  return ctx;
}

function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const favoritesValue = useFavoriteClubs(user?.id);

  return (
    <FavoritesContext.Provider value={favoritesValue}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GlobalNotifications />
      <MixpanelInit />
      <WinAlertBanner />
      <FavoritesProvider>
        {children}
      </FavoritesProvider>
    </>
  );
}
