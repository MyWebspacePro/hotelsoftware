const ACCESS_KEY = "hg_access";
const REFRESH_KEY = "hg_refresh";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

interface ApiErrorBody {
  error?: string;
  details?: Record<string, string[]>;
}

/** Ein einziger Refresh gleichzeitig (verhindert Refresh-Sturm bei parallelen 401ern). */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function toError(res: Response): Promise<Error> {
  const err = (await res.json().catch(() => ({ error: res.statusText }))) as ApiErrorBody;
  const details = err.details ? ` (${Object.values(err.details).flat().join(", ")})` : "";
  return new Error(`${err.error ?? `HTTP ${res.status}`}${details}`);
}

/**
 * Zentraler API-Aufruf: hängt Bearer-Token an, wiederholt bei 401 einmal
 * über den Refresh-Token und wirft bei Fehlern eine sprechende Exception.
 */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && options.retry !== false) {
    const refreshed = await refreshTokens();
    if (refreshed) return api<T>(path, { ...options, retry: false });
  }

  if (!res.ok) throw await toError(res);

  return (await res.json()) as T;
}

/** Binärdownload (z. B. PDF/CSV) als Objekt-URL (Blob). */
export async function apiBlob(path: string): Promise<string> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res = await fetch(`/api${path}`, { headers });
  if (res.status === 401) {
    const refreshed = await refreshTokens();
    if (!refreshed) throw await toError(res);
    const newToken = getAccessToken();
    if (newToken) headers.Authorization = `Bearer ${newToken}`;
    res = await fetch(`/api${path}`, { headers });
  }
  if (!res.ok) throw await toError(res);

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}