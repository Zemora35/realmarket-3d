import { create } from 'zustand';
import * as THREE from 'three';
import { createGrid, findPath, orderStops, pathLength } from '@realmarket/navigation';
import { normalizeTr, type CartDto, type OrderDto, type SceneData, type SceneProduct, type Vec2 } from '@realmarket/shared';
import { api, ApiError, type SessionInfo } from '../api';
import { sfx } from '../audio';
import { isTouchDevice } from '../world/input';
import { CART_REACH, runtime } from '../world/runtime';
import { registry } from '../world/units';

export const STORE_ID = 'demo-market';

export interface CartUnit {
  key: string;
  unitIdx: number;
  productId: string;
  storeProductId: string;
}

export interface HeldState {
  unitIdx: number;
  productId: string;
  storeProductId: string;
  origin: 'shelf' | 'cart';
  mode: 'hold' | 'inspect';
}

export type Panel = null | 'cart' | 'search' | 'list' | 'help' | 'menu';
export type Quality = 'low' | 'medium' | 'high';

export interface CheckoutState {
  stage: 'loading' | 'scanning' | 'review' | 'paying' | 'done' | 'error';
  quote?: CartDto;
  order?: OrderDto;
  scanned: number;
  error?: string;
}

export interface NavTarget {
  productId: string;
  point: Vec2;
  unitIdx: number;
}

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface GameState {
  phase: 'loading' | 'ready' | 'playing' | 'error';
  loadError: string | null;
  scene: SceneData | null;
  session: SessionInfo | null;
  cart: CartDto | null;
  cartUnits: CartUnit[];
  held: HeldState | null;
  cartAttached: boolean;
  nearCheckout: string | null;
  hoveredProductId: string | null;
  hoveringCart: boolean;
  panel: Panel;
  checkout: CheckoutState | null;
  nav: { targets: NavTarget[]; path: Vec2[] | null };
  shoppingList: string[];
  toasts: Toast[];
  quality: Quality;
  isTouch: boolean;
  muted: boolean;
  pointerLocked: boolean;

  init(): Promise<void>;
  startPlaying(): void;
  setPanel(p: Panel): void;
  toast(text: string, tone?: Toast['tone']): void;
  pick(): void;
  toggleInspect(): void;
  putInCart(): void;
  returnToShelf(): void;
  finishReturn(): void;
  removeFromCart(storeProductId: string): Promise<void>;
  toggleCartAttach(): void;
  openCheckout(): Promise<void>;
  pay(): Promise<void>;
  finishCheckout(): Promise<void>;
  closeCheckout(): void;
  navigateTo(productId: string): void;
  routeShoppingList(): void;
  refreshRoute(): void;
  clearNav(): void;
  toggleList(productId: string): void;
  setQuality(q: Quality): void;
  setMuted(m: boolean): void;
  setPointerLocked(v: boolean): void;
  productById(id: string): SceneProduct | undefined;
}

let toastId = 0;
let cartKey = 0;
let initStarted = false;
const QUALITY_KEY = 'rm3d.quality';
const SESSION_KEY = 'rm3d.session';

function readQuality(): Quality {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch {
    /* depolama kapalı */
  }
  return isTouchDevice() ? 'low' : 'medium';
}

function errorText(e: unknown) {
  if (e instanceof ApiError) return e.body.message;
  return e instanceof Error ? e.message : 'Bilinmeyen hata';
}

/** Oyuncu konumundan bir ürünün en yakın raf erişim noktasını bulur. */
function nearestShelfFor(productId: string, from: Vec2): NavTarget | null {
  const scene = useGame.getState().scene;
  const grid = runtime.grid;
  if (!scene || !grid) return null;
  const units = (registry.byProduct.get(productId) ?? []).filter((i) => !registry.units[i].taken);
  const byShelf = new Map<string, number>();
  for (const i of units) if (!byShelf.has(registry.units[i].shelfId)) byShelf.set(registry.units[i].shelfId, i);
  let best: { t: NavTarget; d: number } | null = null;
  for (const [shelfId, unitIdx] of byShelf) {
    const shelf = scene.layout.shelves.find((s) => s.id === shelfId);
    if (!shelf) continue;
    const p = findPath(grid, from, shelf.accessPoint);
    if (!p) continue;
    const d = pathLength(p);
    if (!best || d < best.d) best = { t: { productId, point: shelf.accessPoint, unitIdx }, d };
  }
  return best?.t ?? null;
}

function composeRoute(from: Vec2, targets: NavTarget[]): Vec2[] | null {
  const grid = runtime.grid;
  if (!grid || !targets.length) return null;
  const out: Vec2[] = [];
  let cur = from;
  for (const t of targets) {
    const seg = findPath(grid, cur, t.point);
    if (!seg) continue;
    out.push(...(out.length ? seg.slice(1) : seg));
    cur = t.point;
  }
  return out.length > 1 ? out : null;
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'loading',
  loadError: null,
  scene: null,
  session: null,
  cart: null,
  cartUnits: [],
  held: null,
  cartAttached: true,
  nearCheckout: null,
  hoveredProductId: null,
  hoveringCart: false,
  panel: null,
  checkout: null,
  nav: { targets: [], path: null },
  shoppingList: [],
  toasts: [],
  quality: readQuality(),
  isTouch: isTouchDevice(),
  muted: false,
  pointerLocked: false,

  async init() {
    // StrictMode efektleri iki kez çalıştırır; tek oturum açılmalı.
    if (initStarted) return;
    initStarted = true;
    try {
      const scene = await api.scene(STORE_ID);
      registry.build(scene);
      const { widthM, lengthM } = scene.layout.params;
      runtime.bounds = { width: widthM, length: lengthM };
      runtime.grid = createGrid({ minX: 0, minZ: 0, maxX: widthM, maxZ: lengthM }, scene.layout.obstacles, { cellSize: 0.25, inflate: 0.42 });
      runtime.playerPos.set(scene.layout.spawn.position.x, 0, scene.layout.spawn.position.z);
      runtime.yaw = scene.layout.spawn.rotationY + Math.PI;
      runtime.cartPos.set(scene.layout.cartSpawn.position.x, 0, scene.layout.cartSpawn.position.z);
      runtime.cartYaw = runtime.yaw;

      // Önceki sekme oturumunda kalan stok ayırmalarını serbest bırak.
      let session: SessionInfo | null = null;
      try {
        const saved = sessionStorage.getItem(SESSION_KEY);
        if (saved) {
          const s = JSON.parse(saved) as SessionInfo;
          const cart = await api.cart(s);
          if (cart.status === 'active') {
            for (const l of cart.lines) await api.remove(s, l.storeProductId, l.quantity);
            session = s;
          }
        }
      } catch {
        session = null;
      }
      if (!session) {
        session = await api.createSession(STORE_ID);
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } catch {
          /* depolama kapalı */
        }
      }
      set({ scene, session, cart: null, cartUnits: [], phase: 'ready' });
    } catch (e) {
      set({ phase: 'error', loadError: errorText(e) });
    }
  },

  startPlaying() {
    set({ phase: 'playing', panel: null });
  },

  setPanel(p) {
    set({ panel: get().panel === p ? null : p });
  },

  toast(text, tone = 'info') {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-4) });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3200);
  },

  productById(id) {
    return registry.products.get(id);
  },

  pick() {
    const s = get();
    if (s.held || s.checkout) return;
    const forced = runtime.forcedUnit;
    const idx = forced >= 0 ? forced : runtime.hoveredUnit;
    runtime.forcedUnit = -1;
    if (idx >= 0) {
      const u = registry.units[idx];
      registry.setTaken(idx, true);
      runtime.held.kind = 'pick';
      runtime.held.start = performance.now();
      runtime.held.from.set(u.pos.x, u.pos.y, u.pos.z);
      runtime.held.fromQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), u.yaw);
      runtime.held.spinX = 0;
      runtime.held.spinY = 0;
      runtime.held.zoom = 0;
      sfx.pick();
      set({ held: { unitIdx: idx, productId: u.productId, storeProductId: u.storeProductId, origin: 'shelf', mode: 'hold' } });
      return;
    }
    const cartKeyHit = runtime.hoveredCartKey;
    if (cartKeyHit) {
      const cu = s.cartUnits.find((c) => c.key === cartKeyHit);
      if (!cu || !s.session) return;
      runtime.held.kind = 'pick';
      runtime.held.start = performance.now();
      runtime.held.from.copy(runtime.cartPos).setY(0.6);
      runtime.held.fromQuat.identity();
      set({
        cartUnits: s.cartUnits.filter((c) => c.key !== cu.key),
        held: { unitIdx: cu.unitIdx, productId: cu.productId, storeProductId: cu.storeProductId, origin: 'cart', mode: 'hold' },
      });
      sfx.pick();
      api
        .remove(s.session, cu.storeProductId)
        .then((cart) => set({ cart }))
        .catch((e) => get().toast(errorText(e), 'error'));
      return;
    }
    if (s.nearCheckout) void get().openCheckout();
  },

  toggleInspect() {
    const h = get().held;
    if (!h) {
      if (runtime.hoveredUnit >= 0) {
        get().pick();
        const nh = get().held;
        if (nh) set({ held: { ...nh, mode: 'inspect' } });
      }
      return;
    }
    set({ held: { ...h, mode: h.mode === 'inspect' ? 'hold' : 'inspect' } });
  },

  putInCart() {
    let s = get();
    if (!s.held) {
      if (runtime.hoveredUnit < 0 && runtime.forcedUnit < 0) return;
      get().pick();
      s = get();
      if (!s.held) return;
    }
    const held = s.held!;
    const dist = Math.hypot(runtime.cartPos.x - runtime.playerPos.x, runtime.cartPos.z - runtime.playerPos.z);
    if (dist > CART_REACH) {
      get().toast('Arabanız uzakta — arabaya yaklaşın veya C ile arabayı tutun', 'error');
      sfx.error();
      return;
    }
    if (!s.session) return;
    const key = `c${++cartKey}`;
    runtime.flying.push({
      key,
      productId: held.productId,
      from: runtime.held.worldPos.clone(),
      fromQuat: runtime.held.worldQuat.clone(),
      start: performance.now(),
    });
    runtime.held.kind = 'idle';
    const unit: CartUnit = { key, unitIdx: held.unitIdx, productId: held.productId, storeProductId: held.storeProductId };
    set({ held: null, cartUnits: [...s.cartUnits, unit] });
    sfx.drop();
    api
      .add(s.session, held.storeProductId)
      .then((cart) => set({ cart }))
      .catch((e) => {
        // Sunucu reddetti (ör. stok bitti): ürünü rafa geri koy.
        set({ cartUnits: get().cartUnits.filter((c) => c.key !== key) });
        registry.setTaken(held.unitIdx, false);
        get().toast(errorText(e), 'error');
        sfx.error();
      });
  },

  returnToShelf() {
    const h = get().held;
    if (!h) return;
    runtime.held.kind = 'toShelf';
    runtime.held.start = performance.now();
    runtime.held.from.copy(runtime.held.worldPos);
    runtime.held.fromQuat.copy(runtime.held.worldQuat);
  },

  finishReturn() {
    const h = get().held;
    if (!h) return;
    registry.setTaken(h.unitIdx, false);
    runtime.held.kind = 'idle';
    set({ held: null });
    sfx.drop();
  },

  async removeFromCart(storeProductId) {
    const s = get();
    if (!s.session) return;
    const idx = s.cartUnits.map((c) => c.storeProductId).lastIndexOf(storeProductId);
    if (idx < 0) return;
    const cu = s.cartUnits[idx];
    set({ cartUnits: s.cartUnits.filter((c) => c.key !== cu.key) });
    try {
      const cart = await api.remove(s.session, storeProductId);
      registry.setTaken(cu.unitIdx, false);
      set({ cart });
      sfx.drop();
    } catch (e) {
      set({ cartUnits: [...get().cartUnits, cu] });
      get().toast(errorText(e), 'error');
    }
  },

  toggleCartAttach() {
    const s = get();
    if (s.cartAttached) {
      set({ cartAttached: false });
      get().toast(s.isTouch ? 'Araba bırakıldı. Tekrar tutmak için yanına gidip “Arabayı tut” düğmesine basın.' : 'Araba bırakıldı. Tekrar tutmak için yanına gidip C tuşuna basın.');
      return;
    }
    const dist = Math.hypot(runtime.cartPos.x - runtime.playerPos.x, runtime.cartPos.z - runtime.playerPos.z);
    if (dist > 1.9) {
      get().toast('Arabayı tutmak için arabaya yaklaşın', 'error');
      return;
    }
    // Oyuncu arabanın tutma koluna geçer.
    runtime.yaw = runtime.cartYaw;
    set({ cartAttached: true });
  },

  async openCheckout() {
    const s = get();
    if (!s.session) return;
    if (!s.cartUnits.length) {
      get().toast('Sepetiniz boş — önce raflardan ürün alın', 'error');
      return;
    }
    if (s.held) {
      get().toast('Elinizdeki ürünü önce arabaya koyun (G) veya rafa bırakın (R)', 'error');
      return;
    }
    set({ checkout: { stage: 'loading', scanned: 0 }, panel: null });
    try {
      const quote = await api.quote(s.session);
      set({ checkout: { stage: 'scanning', quote, scanned: 0 } });
      const totalUnits = quote.lines.length;
      for (let i = 1; i <= totalUnits; i++) {
        await new Promise((r) => setTimeout(r, 380));
        if (get().checkout?.stage !== 'scanning') return;
        sfx.beep();
        set({ checkout: { ...get().checkout!, scanned: i } });
      }
      set({ checkout: { ...get().checkout!, stage: 'review' } });
    } catch (e) {
      set({ checkout: { stage: 'error', scanned: 0, error: errorText(e) } });
    }
  },

  async pay() {
    const s = get();
    const c = s.checkout;
    if (!s.session || !c?.quote) return;
    set({ checkout: { ...c, stage: 'paying' } });
    try {
      const order = await api.pay(s.session, c.quote.totalKurus);
      sfx.success();
      set({ checkout: { ...c, stage: 'done', order } });
    } catch (e) {
      if (e instanceof ApiError && e.body.error === 'PRICE_CHANGED') {
        set({ checkout: { ...c, stage: 'review', quote: e.body.details as CartDto, error: 'Fiyatlar güncellendi, lütfen yeni toplamı onaylayın.' } });
      } else set({ checkout: { ...c, stage: 'error', error: errorText(e) } });
    }
  },

  async finishCheckout() {
    // Satılan ürünler raflardan alınmış olarak kalır; yeni alışveriş oturumu açılır.
    const session = await api.createSession(STORE_ID);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* depolama kapalı */
    }
    set({ session, cart: null, cartUnits: [], checkout: null });
    get().toast('Teşekkürler! Yeni alışverişe başlayabilirsiniz.', 'success');
  },

  closeCheckout() {
    if (get().checkout?.stage === 'paying') return;
    set({ checkout: null });
  },

  navigateTo(productId) {
    const from = { x: runtime.playerPos.x, z: runtime.playerPos.z };
    const t = nearestShelfFor(productId, from);
    const p = registry.products.get(productId);
    if (!t) {
      get().toast(`${p?.name ?? 'Ürün'} şu anda rafta yok`, 'error');
      return;
    }
    set({ nav: { targets: [t], path: composeRoute(from, [t]) }, panel: null });
    get().toast(`${p?.name}: rota zeminde gösteriliyor`, 'success');
  },

  routeShoppingList() {
    const s = get();
    const from = { x: runtime.playerPos.x, z: runtime.playerPos.z };
    const inCart = new Set(s.cartUnits.map((c) => c.productId));
    const targets = s.shoppingList
      .filter((id) => !inCart.has(id))
      .map((id) => nearestShelfFor(id, from))
      .filter((t): t is NavTarget => !!t);
    if (!targets.length || !runtime.grid) {
      get().toast('Rotalanacak ürün yok (listedekiler arabada veya rafta yok)', 'error');
      return;
    }
    const { order } = orderStops(runtime.grid, from, targets.map((t) => t.point));
    const ordered = order.map((i) => targets[i]);
    set({ nav: { targets: ordered, path: composeRoute(from, ordered) }, panel: null });
    get().toast(`${ordered.length} durak için en kısa rota oluşturuldu`, 'success');
  },

  refreshRoute() {
    const { targets } = get().nav;
    const from = { x: runtime.playerPos.x, z: runtime.playerPos.z };
    set({ nav: { targets, path: composeRoute(from, targets) } });
  },

  clearNav() {
    set({ nav: { targets: [], path: null } });
  },

  toggleList(productId) {
    const l = get().shoppingList;
    set({ shoppingList: l.includes(productId) ? l.filter((x) => x !== productId) : [...l, productId] });
  },

  setQuality(q) {
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      /* depolama kapalı */
    }
    set({ quality: q });
  },

  setMuted(m) {
    sfx.setMuted(m);
    set({ muted: m });
  },

  setPointerLocked(v) {
    set({ pointerLocked: v });
  },
}));

/** Yerel katalog araması (sunucuya istek atmaz). */
export function searchProducts(products: SceneProduct[], q: string): SceneProduct[] {
  const n = normalizeTr(q);
  if (!n) return products;
  const terms = n.split(' ');
  return products.filter((p) => {
    const hay = normalizeTr(`${p.name} ${p.brand} ${p.subcategory ?? ''} ${p.category} ${p.gtin}`);
    return terms.every((t) => hay.includes(t));
  });
}
