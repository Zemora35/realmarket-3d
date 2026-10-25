import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '@realmarket/database';
import { buildApp } from './app';
import { DemoPaymentProvider } from './services/payment';
import { DEMO_STORE_ID, seedDemo } from './services/seed';
import { LocalStorage } from './services/storage';

// Unity Web istemcisinin kullandığı uçlar: CORS izin listesi ve model bildirimi/GLB dosyaları.
const SITE = 'https://site.realmarket.test';
let handle: DatabaseHandle;
let app: Awaited<ReturnType<typeof buildApp>>;
let dir: string;

beforeAll(async () => {
  handle = await createDatabase();
  await seedDemo(handle.db, { adminEmail: 'a@test.local', adminPassword: 'test-only-password' });
  dir = mkdtempSync(join(tmpdir(), 'rm3d-models-'));
  mkdirSync(join(dir, 'models', 'p1'), { recursive: true });
  writeFileSync(join(dir, 'models', 'manifest.json'), JSON.stringify({ version: 1, products: { p1: { lod1: 'p1/lod1.glb' } } }));
  // geçerli GLB başlığı (glTF ikili, sürüm 2)
  const glb = Buffer.alloc(20);
  glb.write('glTF', 0, 'ascii');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(20, 8);
  writeFileSync(join(dir, 'models', 'p1', 'lod1.glb'), glb);
  app = await buildApp({
    db: handle.db,
    driver: handle.driver,
    storage: new LocalStorage(join(dir, 'files')),
    payment: new DemoPaymentProvider(),
    authSecret: 'test-secret',
    offUserAgent: 'RealMarket3D/test',
    modelsDir: join(dir, 'models'),
    corsOrigins: [SITE, '*', 'javascript:alert(1)'],
  });
});

afterAll(async () => {
  await app?.close();
  await handle?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('CORS izin listesi', () => {
  it('izinli kökene başlık döner, ön uçuşa 204 verir', async () => {
    const pre = await app.inject({
      method: 'OPTIONS',
      url: `/api/stores/${DEMO_STORE_ID}/sessions`,
      headers: { origin: SITE, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-session-token' },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe(SITE);
    expect(String(pre.headers['access-control-allow-headers'])).toContain('x-session-token');
    const get = await app.inject({ url: '/api/stores', headers: { origin: SITE } });
    expect(get.headers['access-control-allow-origin']).toBe(SITE);
    expect(get.headers.vary).toContain('Origin');
  });

  it('izinsiz kökene ve jokere CORS başlığı vermez', async () => {
    const res = await app.inject({ url: '/api/stores', headers: { origin: 'https://evil.example' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await app.inject({ method: 'OPTIONS', url: '/api/stores', headers: { origin: 'https://evil.example' } });
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('oturumlu tam akış başka kökenden çalışır', async () => {
    const s = await app.inject({ method: 'POST', url: `/api/stores/${DEMO_STORE_ID}/sessions`, headers: { origin: SITE } });
    expect(s.statusCode).toBe(201);
    const { sessionId, token } = s.json() as { sessionId: string; token: string };
    const cart = await app.inject({ url: `/api/sessions/${sessionId}/cart`, headers: { origin: SITE, 'x-session-token': token } });
    expect(cart.statusCode).toBe(200);
    expect(cart.headers['access-control-allow-origin']).toBe(SITE);
  });
});

describe('model bildirimi', () => {
  it('manifest ve GLB doğru içerik türüyle, ETag ile sunulur', async () => {
    const m = await app.inject({ url: '/api/models/manifest.json' });
    expect(m.statusCode).toBe(200);
    expect(m.json()).toMatchObject({ version: 1, products: { p1: { lod1: 'p1/lod1.glb' } } });
    const g = await app.inject({ url: '/api/models/p1/lod1.glb' });
    expect(g.statusCode).toBe(200);
    expect(g.headers['content-type']).toBe('model/gltf-binary');
    expect(g.rawPayload.subarray(0, 4).toString('ascii')).toBe('glTF');
    const again = await app.inject({ url: '/api/models/p1/lod1.glb', headers: { 'if-none-match': String(g.headers.etag) } });
    expect(again.statusCode).toBe(304);
  });

  it('yol geçişi ve bilinmeyen uzantılar reddedilir', async () => {
    expect((await app.inject({ url: '/api/models/..%2F..%2Fpackage.json' })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await app.inject({ url: '/api/models/p1/../../secret.glb' })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await app.inject({ url: '/api/models/p1/lod1.exe' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/models/yok/lod1.glb' })).statusCode).toBe(404);
  });
});
