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

  if (res.status === 401 && options.retry !== false && getRefreshToken()) {
    const refreshed = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: getRefreshToken() }),
    });
    if (refreshed.ok) {
      const data = (await refreshed.json()) as { accessToken: string; refreshToken: string };
      setTokens(data.accessToken, data.refreshToken);
      return api<T>(path, { ...options, retry: false });
    }
    clearTokens();
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as ApiErrorBody;
    const details = err.details ? ` (${Object.values(err.details).flat().join(", ")})` : "";
    throw new Error(`${err.error ?? `HTTP ${res.status}`}${details}`);
  }

  return (await res.json()) as T;
}
