/**
 * 공개 프로필 - 좋아하는 음악 장르 (최대 3개)
 * Migration 280: users.preferred_music_genres TEXT[]
 */

export interface MusicGenreDef {
  code: string;
  label: string;
  emoji: string;
}

export const MUSIC_GENRES: MusicGenreDef[] = [
  { code: "hiphop", label: "힙합", emoji: "🎤" },
  { code: "rnb", label: "R&B", emoji: "🎶" },
  { code: "edm", label: "EDM", emoji: "🎧" },
  { code: "house", label: "하우스", emoji: "🏠" },
  { code: "techno", label: "테크노", emoji: "⚡" },
  { code: "pop", label: "팝", emoji: "🌟" },
  { code: "kpop", label: "K-POP", emoji: "💖" },
  { code: "latin", label: "라틴", emoji: "💃" },
  { code: "trap", label: "트랩", emoji: "🔥" },
  { code: "disco", label: "디스코", emoji: "🪩" },
];

export const MUSIC_GENRE_MAP: Record<string, MusicGenreDef> = Object.fromEntries(
  MUSIC_GENRES.map((g) => [g.code, g])
);

export const MAX_MUSIC_GENRES = 3;
export const MAX_PREFERRED_AREAS = 3;
export const MAX_FAVORITE_CLUBS = 3;
