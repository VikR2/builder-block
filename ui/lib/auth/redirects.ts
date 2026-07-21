const INTERNAL_PATH_PATTERN = /^\/(?!\/)/;

export function getSafeRedirectPath(
  candidate: string | null | undefined,
  fallback: string
): string {
  if (!candidate) {
    return fallback;
  }

  const trimmed = candidate.trim();
  if (!INTERNAL_PATH_PATTERN.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}
