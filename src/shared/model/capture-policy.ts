import type { Settings } from './types';

export type CaptureCandidate = {
  id?: number;
  url?: string;
  pinned?: boolean;
};

export type CaptureCandidateReason =
  | 'No usable tab ID'
  | 'No usable URL'
  | 'Cannot save this extension tab'
  | 'Matches custom filter rule';

export function matchesCustomUrlFilter(url: string, settings: Settings): boolean {
  const normalizedUrl = url.trim().toLowerCase();
  if (!normalizedUrl) return false;
  return String(settings.customUrlFilter || '')
    .split(/[\n,]/)
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => normalizedUrl.includes(rule));
}

export function getCaptureCandidateReason(
  candidate: CaptureCandidate,
  settings: Settings,
  extensionBaseUrl: string,
): CaptureCandidateReason | null {
  const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
  const normalizedUrl = url.toLowerCase();
  const normalizedExtensionBaseUrl = extensionBaseUrl.trim().toLowerCase();
  const id = candidate.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return 'No usable tab ID';
  if (!url) return 'No usable URL';
  if (normalizedUrl.startsWith('chrome-extension:')
    || (normalizedExtensionBaseUrl && normalizedUrl.startsWith(normalizedExtensionBaseUrl))) {
    return 'Cannot save this extension tab';
  }
  if (matchesCustomUrlFilter(url, settings)) return 'Matches custom filter rule';
  return null;
}

export function isStorableCaptureCandidate(
  candidate: CaptureCandidate,
  settings: Settings,
  extensionBaseUrl: string,
): boolean {
  return getCaptureCandidateReason(candidate, settings, extensionBaseUrl) === null;
}
