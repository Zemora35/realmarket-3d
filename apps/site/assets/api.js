// RealMarket REST API istemcisi + oturum sahipliği.
// Oturumun sahibi web sitesidir: localStorage'da tutulur, Unity'ye köprüyle aktarılır,
// böylece sepet sayfalar, sekmeler ve ziyaretler arasında korunur.

export const STORE_ID = new URLSearchParams(location.search).get('store') || 'demo-market';
export const API_BASE = (window.REALMARKET_CONFIG && window.REALMARKET_CONFIG.apiBase) || '';
const SESSION_KEY = `realmarket.session.${STORE_ID}`;
const ORDERS_KEY = `realmarket.orders.${STORE_ID}`;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers['x-session-token'] = token;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sunucuya ulaşılamadı');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `HTTP_${res.status}`, data?.message ?? 'İstek başarısız');
  return data;
}

export const money = (kurus) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

// ---- oturum ---------------------------------------------------------------------------

const listeners = new Set();
export const onSessionChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return s && s.sessionId && s.token && s.storeId === STORE_ID ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s) {
  if (!s || !s.sessionId || !s.token) return;
  const clean = { sessionId: s.sessionId, token: s.token, storeId: s.storeId || STORE_ID };
  const prev = loadSession();
  localStorage.setItem(SESSION_KEY, JSON.stringify(clean));
  if (!prev || prev.sessionId !== clean.sessionId) listeners.forEach((fn) => fn(clean));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

let ensuring = null;
/** Geçerli (aktif) oturumu döndürür; yoksa/geçersizse yenisini açar. */
export function ensureSession() {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const s = loadSession();
    if (s) {
      try {
        const cart = await api(`/api/sessions/${s.sessionId}/cart`, { token: s.token });
        if (cart.status === 'active') return { session: s, cart };
      } catch (e) {
        if (e.status === 0) throw e; // ağ hatasında oturumu silme
      }
    }
    const fresh = await api(`/api/stores/${encodeURIComponent(STORE_ID)}/sessions`, { method: 'POST', body: {} });
    saveSession(fresh);
    return { session: fresh, cart: { sessionId: fresh.sessionId, status: 'active', lines: [], itemCount: 0, subtotalKurus: 0, discountKurus: 0, totalKurus: 0 } };
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

// ---- sepet ----------------------------------------------------------------------------

const cartListeners = new Set();
let lastCart = null;
export const onCart = (fn) => (cartListeners.add(fn), () => cartListeners.delete(fn));
export const currentCart = () => lastCart;

export function publishCart(cart, { fromUnity = false } = {}) {
  lastCart = cart;
  cartListeners.forEach((fn) => fn(cart, { fromUnity }));
}

export async function refreshCart() {
  const { cart } = await ensureSession();
  publishCart(cart);
  return cart;
}

async function withSession(fn) {
  const { session } = await ensureSession();
  try {
    return await fn(session);
  } catch (e) {
    if (e.code === 'SESSION_CLOSED' || e.status === 401) {
      clearSession();
      const { session: s2 } = await ensureSession();
      return fn(s2);
    }
    throw e;
  }
}

export async function addToCart(storeProductId, quantity = 1) {
  const cart = await withSession((s) => api(`/api/sessions/${s.sessionId}/cart/add`, { method: 'POST', body: { storeProductId, quantity }, token: s.token }));
  publishCart(cart);
  return cart;
}

export async function removeFromCart(storeProductId, quantity = 1) {
  const cart = await withSession((s) => api(`/api/sessions/${s.sessionId}/cart/remove`, { method: 'POST', body: { storeProductId, quantity }, token: s.token }));
  publishCart(cart);
  return cart;
}

export async function quote() {
  return withSession((s) => api(`/api/sessions/${s.sessionId}/checkout/quote`, { method: 'POST', body: {}, token: s.token }));
}

export async function pay(expectedTotalKurus) {
  const { session } = await ensureSession();
  const order = await api(`/api/sessions/${session.sessionId}/checkout/pay`, {
    method: 'POST',
    body: { paymentMethod: 'demo', expectedTotalKurus },
    token: session.token,
  });
  rememberOrder(order);
  clearSession();
  await refreshCart();
  return order;
}

// ---- sipariş geçmişi (bu tarayıcıda) ---------------------------------------------------

export function rememberOrder(order) {
  if (!order || !(order.orderNumber || order.id)) return;
  const list = orders().filter((o) => o.id !== order.id);
  list.unshift({
    id: order.id,
    orderNumber: order.orderNumber,
    totalKurus: order.totalKurus,
    createdAt: order.createdAt || new Date().toISOString(),
    itemCount: (order.items || []).reduce((n, i) => n + i.quantity, 0) || order.itemCount || 0,
  });
  localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 20)));
}

export function orders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
  } catch {
    return [];
  }
}

// Başka sekmede oturum değişirse (ör. orada ödeme yapıldı) bu sekme de güncellenir.
window.addEventListener('storage', (e) => {
  if (e.key === SESSION_KEY) {
    const s = loadSession();
    if (s) listeners.forEach((fn) => fn(s));
    refreshCart().catch(() => {});
  }
});
