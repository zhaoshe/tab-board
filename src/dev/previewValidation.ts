const DEFAULT_TABBOARD_PORT = 5173;
const LOOPBACK_HOST = '127.0.0.1';
const MANAGER_PREVIEW_PATH = '/dev/manager-preview.html';
const MANAGER_PREVIEW_MARKER = 'tabboard-preview';
const MANAGER_PREVIEW_MARKER_VALUE = 'manager';

export interface TabBoardPorts {
  devPort: number;
  e2ePort: number;
  hmrPort: number;
}

export interface PlaywrightPreviewServer {
  baseURL: string;
  previewURL: string;
  webServerEnv: Record<string, string>;
}

type EnvSource = Record<string, string | undefined>;
type FetchLike = typeof fetch;

function parsePort(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) return fallback;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid port: ${rawValue}`);
  }
  return parsed;
}

export function resolveTabBoardPorts(env: EnvSource = process.env): TabBoardPorts {
  const devPort = parsePort(env.TABBOARD_DEV_PORT, DEFAULT_TABBOARD_PORT);
  const e2ePort = parsePort(env.TABBOARD_E2E_PORT, devPort);
  const hmrPort = parsePort(env.TABBOARD_HMR_PORT, devPort);
  return { devPort, e2ePort, hmrPort };
}

export function resolvePlaywrightPreviewServer(
  env: EnvSource = process.env,
): PlaywrightPreviewServer {
  const { e2ePort } = resolveTabBoardPorts(env);
  const hmrPort = env.TABBOARD_HMR_PORT
    ? parsePort(env.TABBOARD_HMR_PORT, e2ePort)
    : e2ePort;
  const baseURL = `http://${LOOPBACK_HOST}:${e2ePort}`;
  return {
    baseURL,
    previewURL: `${baseURL}${MANAGER_PREVIEW_PATH}`,
    webServerEnv: {
      TABBOARD_DEV_PORT: String(e2ePort),
      TABBOARD_HMR_PORT: String(hmrPort),
    },
  };
}

export async function assertManagerPreviewIdentity(
  previewURL: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ previewURL: string; verified: true }> {
  const response = await fetchImpl(previewURL);
  if (!response.ok) {
    throw new Error(`Preview server returned ${response.status} for ${previewURL}`);
  }

  const html = await response.text();
  const markerChecks: Array<[string, RegExp]> = [
    ['TabBoard Manager Preview', /<title>\s*TabBoard Manager Preview\s*<\/title>/i],
    [
      `${MANAGER_PREVIEW_MARKER}=${MANAGER_PREVIEW_MARKER_VALUE}`,
      new RegExp(
        `<meta[^>]+name=["']${MANAGER_PREVIEW_MARKER}["'][^>]+content=["']${MANAGER_PREVIEW_MARKER_VALUE}["'][^>]*>`,
        'i',
      ),
    ],
    ['#root', /<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i],
  ];
  for (const [label, pattern] of markerChecks) {
    if (!pattern.test(html)) {
      throw new Error(
        `Preview identity check failed for ${previewURL}. Missing marker: ${label}`,
      );
    }
  }

  return { previewURL, verified: true };
}
