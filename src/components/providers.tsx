"use client";

import { createContext, useContext, useEffect } from "react";
import { useWinNotification } from "@/hooks/useWinNotification";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFavoriteClubs } from "@/hooks/useFavoriteClubs";
import { useFavoriteMds } from "@/hooks/useFavoriteMds";
import { useFavoritePuzzles } from "@/hooks/useFavoritePuzzles";
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

// 퍼즐 찜 Context
type PuzzleFavoritesContextType = ReturnType<typeof useFavoritePuzzles>;

const PuzzleFavoritesContext = createContext<PuzzleFavoritesContextType | null>(null);

export function usePuzzleFavoritesContext() {
  const ctx = useContext(PuzzleFavoritesContext);
  if (!ctx) {
    return {
      favoritePuzzles: [],
      isLoading: false,
      isFavoritedPuzzle: () => false,
      toggleFavoritePuzzle: async () => {},
    } as PuzzleFavoritesContextType;
  }
  return ctx;
}

function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const favoritesValue = useFavoriteClubs(user?.id);
  const mdFavoritesValue = useFavoriteMds(user?.id);
  const puzzleFavoritesValue = useFavoritePuzzles(user?.id);

  return (
    <FavoritesContext.Provider value={favoritesValue}>
      <MdFavoritesContext.Provider value={mdFavoritesValue}>
        <PuzzleFavoritesContext.Provider value={puzzleFavoritesValue}>
          {children}
        </PuzzleFavoritesContext.Provider>
      </MdFavoritesContext.Provider>
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
