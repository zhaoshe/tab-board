export interface WindowDedupeCandidate {
  url: string;
  pinned?: boolean;
  active?: boolean;
  lastAccessed?: number;
  index?: number;
}

export interface WindowDedupeClassification<T> {
  removable: T[];
  protectedPinnedCount: number;
}

export function isWindowDedupeUrl(
  value: string,
  extensionBaseUrl: string,
): boolean {
  const url = value.trim();
  if (!url || /^about:blank$/i.test(url) || /^devtools:/i.test(url)) {
    return false;
  }
  const ownBase = extensionBaseUrl.trim();
  return !ownBase || !url.startsWith(ownBase);
}

export function classifyWindowDuplicates<T extends WindowDedupeCandidate>(
  candidates: readonly T[],
): WindowDedupeClassification<T> {
  const byUrl = new Map<string, T[]>();
  for (const candidate of candidates) {
    const url = candidate.url.trim();
    if (!url) continue;
    byUrl.set(url, [...(byUrl.get(url) ?? []), candidate]);
  }

  let protectedPinnedCount = 0;
  const removable = [...byUrl.values()].flatMap((matches) => {
    if (matches.length < 2) return [];
    const pinned = matches.filter((candidate) => candidate.pinned);
    if (pinned.length > 0) {
      protectedPinnedCount += pinned.length;
      return matches.filter((candidate) => !candidate.pinned);
    }
    return [...matches]
      .sort((left, right) => Number(right.active) - Number(left.active)
        || (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0)
        || (left.index ?? 0) - (right.index ?? 0))
      .slice(1);
  });

  return { removable, protectedPinnedCount };
}
