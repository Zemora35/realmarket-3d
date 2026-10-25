import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, inventory, type DatabaseHandle } from '@realmarket/database';
import type { CartDto, OrderDto, SceneData } from '@realmarket/shared';
import { buildApp } from './app';
import { DemoPaymentProvider } from './services/payment';
import { DEMO_STORE_ID, seedDemo } from './services/seed';
import { LocalStorage } from './services/storage';

const ADMIN = { email: 'admin@test.local', password: 'test-only-password' };
let handle: DatabaseHandle;
let app: Awaited<ReturnType<typeof buildApp>>;
let storageDir: string;

beforeAll(async () => {
  handle = await createDatabase();
  await seedDemo(handle.db, { adminEmail: ADMIN.email, adminPassword: ADMIN.password });
  storageDir = mkdtempSync(join(tmpdir(), 'rm3d-'));
  app = await buildApp({
    db: handle.db,
    driver: handle.driver,
    storage: new LocalStorage(storageDir),
    payment: new DemoPaymentProvider(),
    authSecret: 'test-secret',
    offUserAgent: 'RealMarket3D/test',
    fetchImpl: (async () =>
      new Response(JSON.stringify({ status: 1, product: { code: '4006381333931', product_name: 'OFF Test Ürünü', brands: 'Test', quantity: '250 g' } }), {
        status: 200,
      })) as unknown as typeof fetch,
  });
});

afterAll(async () => {
  await app?.close();
  await handle?.close();
  rmSync(storageDir, { recursive: true, force: true });
});

async function newSession() {
  const res = await app.inject({ method: 'POST', url: `/api/stores/${DEMO_STORE_ID}/sessions` });
  expect(res.statusCode).toBe(201);
  return res.json() as { sessionId: string; token: string };
}

async function login() {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: ADMIN });
  expect(res.statusCode).toBe(200);
  return (res.json() as { token: string }).token;
}

describe('sahne', () => {
  it('kabul kriterlerini karşılayan 3D sahne verisi döner', async () => {
    const res = await app.inject({ url: `/api/stores/${DEMO_STORE_ID}/scene` });
    expect(res.statusCode).toBe(200);
    const scene = res.json() as SceneData;
    expect(scene.products.length).toBeGreaterThanOrEqual(20);
    expect(scene.layout.shelves.length).toBeGreaterThanOrEqual(10);
    expect(new Set(scene.layout.shelves.map((s) => s.departmentCode)).size).toBeGreaterThanOrEqual(5);
    expect(scene.slots.length).toBeGreaterThan(100);
    expect(new Set(scene.slots.map((s) => s.productId)).size).toBeGreaterThanOrEqual(20);
    for (const p of scene.products) expect(p.isDemo).toBe(true);
  });

  it('yerel katalogda Türkçe arama yapar', async () => {
    const res = await app.inject({ url: `/api/stores/${DEMO_STORE_ID}/products?q=kola` });
    const list = res.json() as { name: string }[];
    expect(list.some((p) => p.name.includes('Kola'))).toBe(true);
  });
});

describe('alışveriş akışı', () => {
  it('sepete ekler, stok ayırır, kaldırır ve ödeme ile sipariş oluşturur', async () => {
    const scene = (await app.inject({ url: `/api/stores/${DEMO_STORE_ID}/scene` })).json() as SceneData;
    const cola = scene.products.find((p) => p.name.includes('Kola'))!;
    const cips = scene.products.find((p) => p.name.includes('Klasik Patates'))!;
    const s = await newSession();
    const headers = { 'x-session-token': s.token };
    const [inv0] = await handle.db.select().from(inventory).where(eq(inventory.storeProductId, cola.storeProductId));

    let res = await app.inject({ method: 'POST', url: `/api/sessions/${s.sessionId}/cart/add`, headers, payload: { storeProductId: cola.storeProductId, quantity: 2 } });
    expect(res.statusCode).toBe(200);
    res = await app.inject({ method: 'POST', url: `/api/sessions/${s.sessionId}/cart/add`, headers, payload: { storeProductId: cips.storeProductId, quantity: 3 } });
    let cart = res.json() as CartDto;
    expect(cart.itemCount).toBe(5);
    // cips %20 indirimli
    expect(cart.discountKurus).toBe(Math.floor((cips.priceKurus * 3 * 20) / 100));
    expect(cart.totalKurus).toBe(cola.priceKurus * 2 + cips.priceKurus * 3 - cart.discountKurus);
    const [inv1] = await handle.db.select().from(inventory).where(eq(inventory.storeProductId, cola.storeProductId));
    expect(inv1.reserved).toBe(inv0.reserved + 2);

    res = await app.inject({ method: 'POST', url: `/api/sessions/${s.sessionId}/cart/remove`, headers, payload: { storeProductId: cola.storeProductId, quantity: 1 } });
    cart = res.json() as CartDto;
    expect(cart.itemCount).toBe(4);

    // istemci yanlış tutar gönderirse sunucu reddeder
    res = await app.inject({ method: 'POST', url: `/api/sessions/${s.sessionId}/checkout/pay`, headers, payload: { paymentMethod: 'demo', expectedTotalKurus: 1 } });
    expect(res.statusCode).toBe(409);

    res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${s.sessionId}/checkout/pay`,
      headers,
      payload: { paymentMethod: 'demo', expectedTotalKurus: cart.totalKurus },
    });
    expect(res.statusCode).toBe(201);
    const order = res.json() as OrderDto;
    expect(order.orderNumber).toMatch(/^RM-\d{8}-[0-9A-F]{6}$/);
    expect(order.totalKurus).toBe(cart.totalKurus);
    expect(order.paymentRef).toMatch(/^DEMO-/);
    const [inv2] = await handle.db.select().from(inventory).where(eq(inventory.storeProductId, cola.storeProductId));
    expect(inv2.onHand).toBe(inv0.onHand - 1);
    expect(inv2.reserved).toBe(inv0.reserved);

    // kapanmış oturuma ekleme yapılamaz
    res = await app.inject({ method: 'POST', url: `/api/sessions/${s.sessionId}/cart/add`, headers, payload: { storeProductId: cola.storeProductId } });
    expect(res.statusCode).toBe(409);
  });

  it('oturum izolasyonu: yanlış anahtarla sepete erişilemez', async () => {
    const a = await newSession();
    const b = await newSession();
    const res = await app.inject({ url: `/api/sessions/${a.sessionId}/cart`, headers: { 'x-session-token': b.token } });
    expect(res.statusCode).toBe(401);
  });

  it('eşzamanlı alımlarda stoktan fazla satılmaz', async () => {
    const token = await login();
    const scene = (await app.inject({ url: `/api/stores/${DEMO_STORE_ID}/scene` })).json() as SceneData;
    const bal = scene.products.find((p) => p.name.includes('Bal'))!;
    await app.inject({
      method: 'PUT',
      url: `/api/admin/stores/${DEMO_STORE_ID}/products/${bal.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { onHand: 3 },
    });
    const sessions = await Promise.all(Array.from({ length: 5 }, newSession));
    const results = await Promise.all(
      sessions.map((s) =>
        app.inject({
          method: 'POST',
          url: `/api/sessions/${s.sessionId}/cart/add`,
          headers: { 'x-session-token': s.token },
          payload: { storeProductId: bal.storeProductId },
        }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(3);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(2);
  });
});

describe('yönetim', () => {
  it('yetkisiz istekleri reddeder', async () => {
    expect((await app.inject({ url: '/api/admin/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { ...ADMIN, password: 'yanlis' } })).statusCode).toBe(401);
  });

  it('planogramı doğrular, hatalı olanı kaydetmez, geçerli olanı uygular', async () => {
    const token = await login();
    const auth = { authorization: `Bearer ${token}` };
    const list = (await app.inject({ url: `/api/admin/stores/${DEMO_STORE_ID}/planograms`, headers: auth })).json() as { shelfId: string }[];
    expect(list.length).toBeGreaterThan(10);
    const shelfId = list[0].shelfId;
    const detail = (await app.inject({ url: `/api/admin/stores/${DEMO_STORE_ID}/planograms/${shelfId}`, headers: auth })).json() as {
      document: { items: { facings: number }[] };
    };
    const bad = structuredClone(detail.document);
    bad.items[0].facings = 60;
    let res = await app.inject({ method: 'PUT', url: `/api/admin/stores/${DEMO_STORE_ID}/planograms`, headers: auth, payload: { document: bad } });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { issues: { code: string }[] }).issues.some((i) => i.code === 'SHELF_OVERFLOW')).toBe(true);

    const good = structuredClone(detail.document);
    good.items[0].facings = 1;
    res = await app.inject({ method: 'PUT', url: `/api/admin/stores/${DEMO_STORE_ID}/planograms`, headers: auth, payload: { document: good } });
    expect(res.statusCode).toBe(200);
    const scene = (await app.inject({ url: `/api/stores/${DEMO_STORE_ID}/scene` })).json() as SceneData;
    expect(scene.slots.filter((s) => s.shelfId === shelfId)[0].facings).toBe(1);
  });

  it('kalite raporu ve model üretim işi çalışır', async () => {
    const token = await login();
    const auth = { authorization: `Bearer ${token}` };
    const q = (await app.inject({ url: `/api/admin/quality?storeId=${DEMO_STORE_ID}`, headers: auth })).json() as { summary: Record<string, number> };
    expect(q.summary.PLACEHOLDER_MODEL).toBeGreaterThan(0);
    const scene = (await app.inject({ url: `/api/stores/${DEMO_STORE_ID}/scene` })).json() as SceneData;
    const res = await app.inject({ method: 'POST', url: `/api/admin/products/${scene.products[0].id}/model/regenerate`, headers: auth });
    expect((res.json() as { status: string }).status).toBe('succeeded');
  });

  it('CSV katalog içe aktarır ve Open Food Facts adaptörünü kullanır', async () => {
    const token = await login();
    const auth = { authorization: `Bearer ${token}` };
    const csv = 'gtin,name,brand,quantity\n96385074,İçe Aktarılan Cips,Marka,150 g\n12345,Hatalı,Marka,\n';
    let res = await app.inject({ method: 'POST', url: '/api/admin/import/catalog', headers: auth, payload: { format: 'csv', content: csv } });
    const r = res.json() as { status: string; report: { created: number; errors: unknown[]; missingDimensions: string[] } };
    expect(r.report.created).toBe(1);
    expect(r.report.errors).toHaveLength(1);
    expect(r.report.missingDimensions).toContain('96385074');

    res = await app.inject({ method: 'POST', url: '/api/admin/import/off', headers: auth, payload: { barcodes: ['4006381333931'] } });
    expect((res.json() as { report: { created: number } }).report.created).toBe(1);
  });

  it('görsel yüklemede dosya içeriğini doğrular', async () => {
    const token = await login();
    const scene = (await app.inject({ url: `/api/stores/${DEMO_STORE_ID}/scene` })).json() as SceneData;
    const boundary = '----rm3dtest';
    const body = (content: Buffer, name: string) =>
      Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="view"\r\n\r\nfront\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="license"\r\n\r\nCC0-1.0\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
    const headers = { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` };
    const url = `/api/admin/products/${scene.products[1].id}/images`;
    const fake = await app.inject({ method: 'POST', url, headers, payload: body(Buffer.from('not really a png file at all'), 'x.png') });
    expect(fake.statusCode).toBe(415);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const ok = await app.inject({ method: 'POST', url, headers, payload: body(png, 'x.png') });
    expect(ok.statusCode).toBe(201);
    const file = await app.inject({ url: (ok.json() as { url: string }).url });
    expect(file.headers['content-type']).toBe('image/png');
  });
});
