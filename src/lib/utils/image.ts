export function normalizeProfileImage(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}
