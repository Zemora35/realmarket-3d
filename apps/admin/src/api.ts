import type { ApiErrorBody } from '@realmarket/shared';

const TOKEN_KEY = 'rm3d.admin.token';

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* depolama kapalı */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody & Record<string, unknown>,
  ) {
    super(body?.message ?? `HTTP ${status}`);
  }
}

/** Yetkili API çağrısı. 401'de oturum düşer. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body && !(init.body instanceof FormData)) headers['content-type'] = 'application/json';
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401 && path !== '/api/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('rm3d:logout'));
  }
  if (!res.ok) throw new ApiError(res.status, data ?? { error: 'HTTP', message: `HTTP ${res.status}` });
  return data as T;
}

export const jsonBody = (v: unknown) => JSON.stringify(v);
export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.body.message : e instanceof Error ? e.message : String(e));
