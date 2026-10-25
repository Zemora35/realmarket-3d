import type { ApiErrorBody, CartDto, OrderDto, SceneData } from '@realmarket/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body) headers['content-type'] = 'application/json';
  if (init.token) headers['x-session-token'] = init.token;
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data ?? { error: 'HTTP', message: `HTTP ${res.status}` });
  return data as T;
}

export interface SessionInfo {
  sessionId: string;
  token: string;
}

export const api = {
  scene: (storeId: string) => request<SceneData>(`/api/stores/${storeId}/scene`),
  createSession: (storeId: string) => request<SessionInfo>(`/api/stores/${storeId}/sessions`, { method: 'POST' }),
  cart: (s: SessionInfo) => request<CartDto>(`/api/sessions/${s.sessionId}/cart`, { token: s.token }),
  add: (s: SessionInfo, storeProductId: string, quantity = 1) =>
    request<CartDto>(`/api/sessions/${s.sessionId}/cart/add`, { method: 'POST', token: s.token, body: JSON.stringify({ storeProductId, quantity }) }),
  remove: (s: SessionInfo, storeProductId: string, quantity = 1) =>
    request<CartDto>(`/api/sessions/${s.sessionId}/cart/remove`, { method: 'POST', token: s.token, body: JSON.stringify({ storeProductId, quantity }) }),
  quote: (s: SessionInfo) => request<CartDto>(`/api/sessions/${s.sessionId}/checkout/quote`, { method: 'POST', token: s.token }),
  pay: (s: SessionInfo, expectedTotalKurus: number) =>
    request<OrderDto>(`/api/sessions/${s.sessionId}/checkout/pay`, {
      method: 'POST',
      token: s.token,
      body: JSON.stringify({ paymentMethod: 'demo', expectedTotalKurus }),
    }),
};
