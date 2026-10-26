#!/usr/bin/env node
// Unity varlık hattı: web istemcisinin ürün modellerini LOD GLB dosyalarına çevirir.
//
//   API (3001) ve web geliştirme sunucusu (5173) çalışırken:
//     node tools/model-export/export.mjs [--store demo-market] [--out apps/api/storage/models] [--web http://localhost:5173]
//
// Başsız Chromium yalnızca Canvas2D + GLTFExporter kullanır (WebGL/GPU gerekmez).
// Çıktı: {out}/{productId}/lod{0..3}.glb ve {out}/manifest.json (Unity AssetStreamingManager okur).
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const store = arg('--store', 'demo-market');
const web = arg('--web', process.env.RM_WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const out = resolve(arg('--out', 'apps/api/storage/models'));
const started = Date.now();

const sceneRes = await fetch(`${web}/api/stores/${encodeURIComponent(store)}/scene`);
if (!sceneRes.ok) throw new Error(`sahne alınamadı (${sceneRes.status}) — API ve web sunucusu çalışıyor mu?`);
const scene = await sceneRes.json();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[sayfa]', e.message));
await page.goto(`${web}/model-export.html`);
await page.waitForFunction(() => window.__rmExportReady === true, null, { timeout: 120_000 });

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const manifest = { version: 1, generatedAt: new Date().toISOString(), store, products: {} };
let totalBytes = 0;
for (const p of scene.products) {
  const lods = await page.evaluate(([s, id]) => window.__rmExport(s, [id]), [store, p.id]);
  const dir = join(out, p.id);
  await mkdir(dir, { recursive: true });
  const entry = { bytes: 0 };
  for (const l of lods) {
    const buf = Buffer.from(l.base64, 'base64');
    if (buf.subarray(0, 4).toString('ascii') !== 'glTF') throw new Error(`${p.id} lod${l.lod}: geçersiz GLB`);
    await writeFile(join(dir, `lod${l.lod}.glb`), buf);
    entry[`lod${l.lod}`] = `${p.id}/lod${l.lod}.glb`;
    entry[`triangles${l.lod}`] = l.triangles;
    entry.bytes += buf.length;
  }
  totalBytes += entry.bytes;
  manifest.products[p.id] = entry;
  console.log(`${p.name.padEnd(40)} ${lods.map((l) => `L${l.lod} ${l.triangles}△`).join('  ')}  ${(entry.bytes / 1024).toFixed(0)} KB`);
}
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
console.log(`\n${Object.keys(manifest.products).length} ürün, ${(totalBytes / 1024 / 1024).toFixed(1)} MB → ${out} (${((Date.now() - started) / 1000).toFixed(0)} sn)`);
