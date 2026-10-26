import { expect, test, type Page } from '@playwright/test';

type UnityEvent = { version: number; type: string; payload: Record<string, unknown> };
type DebugState = {
  ready: boolean;
  flow: string;
  hoveredProductId?: string;
  heldProductId?: string;
  heldState?: string;
  fps?: number;
  quality?: string;
  units?: number;
  drawn?: number;
  drawCalls?: number;
  modelsLoaded?: number;
  modelsFailed?: number;
  cartItems?: number;
  sessionId?: string;
};

declare global {
  interface Window {
    __unityEvents: UnityEvent[];
    __realmarket: { sendToUnity(type: string, payload?: unknown): boolean };
  }
}

/** Unity'den gelen tüm köprü olaylarını sayfa yüklenmeden önce dinlemeye başlar. */
async function recordEvents(page: Page) {
  await page.addInitScript(() => {
    window.__unityEvents = [];
    window.addEventListener('realmarket:event', (e) => window.__unityEvents.push((e as CustomEvent<UnityEvent>).detail));
  });
}

const events = (page: Page, type: string) => page.evaluate((t) => window.__unityEvents.filter((e) => e.type === t), type);

async function waitEvent(page: Page, type: string, timeout = 60_000) {
  await page.waitForFunction((t) => window.__unityEvents.some((e) => e.type === t), type, { timeout });
  return (await events(page, type)).at(-1)!;
}

/** DEBUG_STATE ister ve yanıtı döndürür. */
async function state(page: Page): Promise<DebugState> {
  const before = (await events(page, 'DEBUG_STATE')).length;
  await page.evaluate(() => window.__realmarket.sendToUnity('DEBUG_STATE'));
  await page.waitForFunction((n) => window.__unityEvents.filter((e) => e.type === 'DEBUG_STATE').length > n, before);
  return (await events(page, 'DEBUG_STATE')).at(-1)!.payload as DebugState;
}

async function until(page: Page, check: (s: DebugState) => boolean, what: string, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last: DebugState | null = null;
  while (Date.now() < end) {
    last = await state(page);
    if (check(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${what} gerçekleşmedi; son durum: ${JSON.stringify(last)}`);
}

const act = (page: Page, name: string) => page.evaluate((a) => window.__realmarket.sendToUnity('DEBUG_ACT', { act: a }), name);

test('Unity WebGL: sahne yüklenir, ürün alınır, incelenir, arabaya konur ve sepet siteyle eşitlenir', async ({ page }, info) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await recordEvents(page);

  const products = (await (await page.request.get('/api/stores/demo-market/products')).json()) as { id: string; name: string; storeProductId: string; packagingType: string }[];
  const target = products.find((p) => p.packagingType === 'pet_bottle') ?? products[0];
  const other = products.find((p) => p.packagingType === 'carton_box' && p.id !== target.id) ?? products[1];

  const t0 = Date.now();
  await page.goto(`/market?debug=1&product=${target.id}`);
  const loaded = await waitEvent(page, 'SCENE_LOADED', 240_000);
  const loadSeconds = (Date.now() - t0) / 1000;
  expect(loaded.payload.products).toBeGreaterThan(20);
  await waitEvent(page, 'SESSION_READY');

  // Unity oturumu sitenin oturumuyla aynı olmalı (tek sepet)
  const siteSession = await page.evaluate(() => JSON.parse(localStorage.getItem('realmarket.session.demo-market') ?? 'null'));
  let s = await state(page);
  expect(s.ready).toBe(true);
  expect(s.sessionId).toBe(siteSession.sessionId);
  expect(s.units).toBeGreaterThan(5000);

  // NAVIGATE_TO (adresteki ürün) → nişangâh doğrudan hedef üründe
  await until(page, (x) => x.hoveredProductId === target.id, 'hedef ürüne nişan alma');

  // E: al → inceleme
  await act(page, 'Interact');
  await until(page, (x) => x.heldProductId === target.id && x.heldState === 'Inspecting', 'ürünü alıp inceleme');
  const selected = await waitEvent(page, 'PRODUCT_SELECTED');
  expect(selected.payload.productId).toBe(target.id);
  await page.screenshot({ path: info.outputPath('inceleme.png') });

  // G: arabaya koy → sunucu sepeti + köprü olayları + site rozeti
  await act(page, 'AddToCart');
  await waitEvent(page, 'ADD_TO_CART');
  await until(page, (x) => x.cartItems === 1 && !x.heldProductId, 'arabaya koyma');
  const cart = await page.evaluate(async (sess) => {
    const r = await fetch(`/api/sessions/${sess.sessionId}/cart`, { headers: { 'x-session-token': sess.token } });
    return r.json();
  }, siteSession);
  expect(cart.lines.map((l: { storeProductId: string }) => l.storeProductId)).toContain(target.storeProductId);
  await expect(page.locator('#cart-badge')).toHaveText('1');
  await expect(page.locator('#mini-cart')).toContainText(target.name);

  // Başka ürün: al → R ile rafa bırak → elde ürün kalmaz, sepet değişmez
  await page.evaluate((id) => window.__realmarket.sendToUnity('NAVIGATE_TO', { productId: id }), other.id);
  await until(page, (x) => x.hoveredProductId === other.id, 'ikinci ürüne nişan alma');
  await act(page, 'Interact');
  await until(page, (x) => x.heldState === 'Inspecting', 'ikinci ürünü inceleme');
  await act(page, 'ReturnItem');
  s = await until(page, (x) => !x.heldProductId && x.flow === 'Shopping', 'rafa bırakma');
  expect(s.cartItems).toBe(1);

  // Sayfadan sepete ekleme Unity'ye yansır (site → Unity CART_UPDATED)
  await page.evaluate(async (args) => {
    const r = await fetch(`/api/sessions/${args.sess.sessionId}/cart/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-token': args.sess.token },
      body: JSON.stringify({ storeProductId: args.sp, quantity: 1 }),
    });
    if (!r.ok) throw new Error('ekleme başarısız');
    window.__realmarket.sendToUnity('CART_UPDATED', {});
  }, { sess: siteSession, sp: other.storeProductId });
  await until(page, (x) => x.cartItems === 2, 'siteden eklenen ürünün Unity sepetine yansıması');
  // Unity yeniden okuduğu sepeti sayfaya geri bildirir → site rozeti de 2
  await expect(page.locator('#cart-badge')).toHaveText('2');

  // Performans ölçümü (birkaç saniye bekleyip ortalama fps)
  await page.waitForTimeout(5000);
  s = await state(page);
  await page.screenshot({ path: info.outputPath('magaza.png') });
  const result = { project: info.project.name, loadSeconds, fps: s.fps, quality: s.quality, drawn: s.drawn, drawCalls: s.drawCalls, modelsLoaded: s.modelsLoaded, modelsFailed: s.modelsFailed };
  console.log('[unity-e2e]', JSON.stringify(result));
  await info.attach('unity-metrics', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });

  expect(s.modelsFailed ?? 0).toBe(0);
  const unexpected = consoleErrors.filter((e) => !/favicon/i.test(e));
  expect(unexpected, unexpected.slice(0, 5).join('\n')).toHaveLength(0);
});
