#!/usr/bin/env node
// Unity WebGL kare süresi ölçümü: mağazada yürürken ve dönerken her karenin süresini kaydeder.
//   node tests/unity/perf.mjs [--url http://localhost:5182] [--gpu default|high] [--seconds 10] [--quality High]
// Çıktı: ortalama fps, kare süresi p50/p95/p99, 33 ms ve 50 ms'yi aşan (takılma) kare sayısı.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const arg = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);
const url = arg('--url', 'http://localhost:5182').replace(/\/$/, '');
const gpu = arg('--gpu', 'default');
const seconds = Number(arg('--seconds', 10));
const quality = arg('--quality', '');
// --off products,tags,shadows,streaming → o alt sistemleri ölçüm boyunca kapatır (takılma tanılaması)
const off = (arg('--off', '') || '').split(',').filter(Boolean);

const flags = ['--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
if (gpu === 'high') flags.push('--use-angle=d3d11', '--force_high_performance_gpu');
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: flags });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
if (args.includes('--no-models')) await page.route('**/api/models/**', (r) => r.abort()); // yalnızca yedek (dokusuz) modeller
// Geliştirme derlemesi (-rmDevelopment) çalışma anında derlenen gölgelendiricileri konsola yazar
const shaderLog = [];
page.on('console', (m) => { if (/Compiled shader|Uploaded shader/i.test(m.text())) shaderLog.push({ at: Date.now(), text: m.text().slice(0, 300) }); });
// geliştirme derlemesi sıkıştırılmamış dosyalar üretir (.data/.wasm, .br yok)
if (args.includes('--dev')) await page.addInitScript(() => { window.REALMARKET_CONFIG = { unityExt: '' }; });
await page.addInitScript(() => {
  window.__ev = [];
  window.addEventListener('realmarket:event', (e) => window.__ev.push(e.detail));
});
const q = new URLSearchParams({ debug: '1', ...(quality ? { quality } : {}) });
await page.goto(`${url}/market?${q}`);
await page.waitForFunction(() => window.__ev.some((e) => e.type === 'SCENE_LOADED'), null, { timeout: 180_000 });
const renderer = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2');
  const e = c && c.getExtension('WEBGL_debug_renderer_info');
  return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'bilinmiyor';
});
if (off.length) {
  await page.evaluate((o) => window.__realmarket.sendToUnity('DEBUG_TOGGLE', Object.fromEntries(o.map((k) => [k, false]))), off);
}
await page.waitForTimeout(3000); // ilk açılış işleri otursun

async function state() {
  const n = await page.evaluate(() => window.__ev.filter((e) => e.type === 'DEBUG_STATE').length);
  await page.evaluate(() => window.__realmarket.sendToUnity('DEBUG_STATE'));
  await page.waitForFunction((k) => window.__ev.filter((e) => e.type === 'DEBUG_STATE').length > k, n);
  return page.evaluate(() => window.__ev.filter((e) => e.type === 'DEBUG_STATE').at(-1).payload);
}

const before = await state();
// Kare süresi kaydı (tarayıcının gerçek çizim aralığı)
await page.evaluate(() => {
  window.__ft = [];
  window.__fts = [];
  let last = performance.now();
  const loop = (t) => { window.__ft.push(t - last); window.__fts.push([t, t - last]); last = t; if (window.__ftOn) requestAnimationFrame(loop); };
  window.__ftOn = true;
  requestAnimationFrame(loop);
});
const t0 = await page.evaluate(() => performance.now());
const timeline = [];
// Yürü + dön: W basılı, yaw her 100 ms'de 6° değişir (gerçekçi dolaşma)
await page.mouse.click(400, 400);
const walkStart = Date.now();
const shadersBeforeWalk = shaderLog.length;
await page.keyboard.down('w');
const steps = Math.round((seconds * 1000) / 100);
for (let i = 0; i < steps; i++) {
  const yaw = before.yaw + i * 6;
  await page.evaluate((y) => window.__realmarket.sendToUnity('DEBUG_LOOK', { yaw: y, pitch: 8 }), yaw);
  if (i % 5 === 0) {
    const s = await state();
    timeline.push({ t: Math.round((await page.evaluate(() => performance.now())) - t0), models: s.modelsLoaded, drawn: s.drawn, calls: s.drawCalls, fps: Math.round(s.fps), q: s.quality, l1: s.lod1, l2: s.lod2, l3: s.lod3, tris: s.triangles, tags: s.tagsActive, mono: s.monoMB?.toFixed(1) });
  }
  await page.waitForTimeout(100);
}
await page.keyboard.up('w');
const hitches = await page.evaluate((start) => window.__fts.filter(([, d]) => d > 33.4).map(([t, d]) => ({ t: Math.round(t - start), ms: Math.round(d) })), t0);
const ft = await page.evaluate(() => { window.__ftOn = false; return window.__ft.slice(5); });
const after = await state();
await browser.close();

ft.sort((a, b) => a - b);
const pct = (p) => ft[Math.min(ft.length - 1, Math.floor((p / 100) * ft.length))];
const avg = ft.reduce((s, x) => s + x, 0) / ft.length;
const result = {
  gpu, renderer, quality: after.quality, frames: ft.length,
  avgFps: +(1000 / avg).toFixed(1),
  p50ms: +pct(50).toFixed(1), p95ms: +pct(95).toFixed(1), p99ms: +pct(99).toFixed(1), maxMs: +ft.at(-1).toFixed(1),
  over33ms: ft.filter((x) => x > 33.4).length, over50ms: ft.filter((x) => x > 50).length,
  drawn: after.drawn, drawCalls: after.drawCalls,
  modelsLoadedDuringWalk: after.modelsLoaded - before.modelsLoaded,
  moved: +Math.hypot(after.x - before.x, after.z - before.z).toFixed(1),
};
console.log(JSON.stringify(result, null, 2));
if (shaderLog.length) {
  console.log(`açılışta derlenen gölgelendirici: ${shadersBeforeWalk}, yürürken derlenen: ${shaderLog.length - shadersBeforeWalk}`);
  for (const s of shaderLog.slice(shadersBeforeWalk)) console.log(`  +${s.at - walkStart} ms  ${s.text}`);
}
if (args.includes('--timeline')) {
  console.log('takılmalar (ms anı → süre):', hitches.map((h) => `${h.t}→${h.ms}`).join('  '));
  for (const r of timeline) console.log(`  ${String(r.t).padStart(6)} ms  model=${r.models} çizilen=${r.drawn} (L1 ${r.l1}/L2 ${r.l2}/L3 ${r.l3}) üçgen=${r.tris} çağrı=${r.calls} etiket=${r.tags} mono=${r.mono}MB fps=${r.fps} ${r.q}`);
}
