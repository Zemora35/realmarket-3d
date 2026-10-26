#!/usr/bin/env node
// Takılma anındaki uzun işleri tarayıcı izlemesiyle (CDP Tracing) bulur: sayfa iş parçacığı mı
// (Unity WebAssembly) yoksa GPU süreci mi (ANGLE gölgelendirici/durum derlemesi) meşgul?
//   node tests/unity/trace-hitch.mjs [--url http://localhost:5182] [--quality Medium]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const arg = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);
const url = arg('--url', 'http://localhost:5182').replace(/\/$/, '');
const quality = arg('--quality', 'Medium');

const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--ignore-gpu-blocklist', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__ev = [];
  window.addEventListener('realmarket:event', (e) => window.__ev.push(e.detail));
});
// --load: yükleme sırasında derlenen programları da kaydet (takılmadaki programla karşılaştırmak için)
const traceLoad = args.includes('--load');
const loadEvents = [];
let loadCdp = null;
if (traceLoad) {
  loadCdp = await page.context().newCDPSession(page);
  loadCdp.on('Tracing.dataCollected', (e) => loadEvents.push(...e.value));
  await loadCdp.send('Tracing.start', { traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: ['gpu.angle', 'gpu', 'disabled-by-default-gpu.service'] } });
}
await page.goto(`${url}/market?debug=1&quality=${quality}`);
await page.waitForFunction(() => window.__ev.some((e) => e.type === 'SCENE_LOADED'), null, { timeout: 180_000 });
await page.waitForTimeout(3000);
if (traceLoad) {
  const loadDone = new Promise((r) => loadCdp.once('Tracing.tracingComplete', r));
  await loadCdp.send('Tracing.end');
  await loadDone;
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir('test-results/unity/load-shaders', { recursive: true });
  const comps = loadEvents.filter((e) => e.ph === 'X' && e.name === 'D3DCompile' && e.args?.source);
  let n = 0;
  for (const e of comps) await writeFile(`test-results/unity/load-shaders/${String(n++).padStart(3, '0')}-${Math.round(e.dur / 1000)}ms.hlsl`, e.args.source);
  console.log(`yüklemede derlenen D3D gölgelendirici: ${comps.length}, toplam ${Math.round(comps.reduce((s, e) => s + e.dur, 0) / 1000)} ms`);
}
const yaw0 = await page.evaluate(async () => {
  const n = window.__ev.length;
  window.__realmarket.sendToUnity('DEBUG_STATE');
  while (window.__ev.length === n) await new Promise((r) => setTimeout(r, 20));
  return window.__ev.at(-1).payload.yaw;
});

const cdp = await page.context().newCDPSession(page);
const events = [];
cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', {
  traceConfig: {
    recordMode: 'recordAsMuchAsPossible',
    includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'gpu', 'gpu.angle', 'gpu.service', 'v8.execute', 'blink', 'toplevel', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder'],
  },
});
// İlk dönüş (takılmanın görüldüğü yer): yürürken 3 sn boyunca sağa dön; kare süreleri de kaydedilir
await page.evaluate(() => {
  window.__fts = [];
  let last = performance.now();
  const loop = (t) => { window.__fts.push([t, t - last]); last = t; if (window.__on) requestAnimationFrame(loop); };
  window.__on = true;
  requestAnimationFrame(loop);
});
await page.mouse.click(400, 400);
await page.keyboard.down('w');
for (let i = 0; i < 30; i++) {
  await page.evaluate((y) => window.__realmarket.sendToUnity('DEBUG_LOOK', { yaw: y, pitch: 8 }), yaw0 + i * 6);
  await page.waitForTimeout(100);
}
await page.keyboard.up('w');
const hitches = await page.evaluate(() => { window.__on = false; return window.__fts.filter(([, d]) => d > 100).map(([, d]) => Math.round(d)); });
console.log('kare takılmaları (ms):', hitches.join(', ') || 'yok');
await cdp.send('Tracing.end');
await done;
await browser.close();

// Süreç/iş parçacığı adları
const names = new Map();
for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
const procs = new Map();
for (const e of events) if (e.ph === 'M' && e.name === 'process_name') procs.set(e.pid, e.args.name);
console.log(`olay sayısı: ${events.length}`);
const long = events
  .filter((e) => e.ph === 'X' && e.dur > 15_000)
  .map((e) => ({ thread: `${procs.get(e.pid) ?? e.pid}/${names.get(`${e.pid}:${e.tid}`) ?? e.tid}`, name: e.name, ms: Math.round(e.dur / 1000), ts: e.ts }))
  .sort((a, b) => b.ms - a.ms);
// Takılmayı başlatan GL çağrıları: en uzun FireAnimationFrame içinde, bekleme başlamadan önceki son çağrılar
const fire = long.find((l) => l.name === 'FireAnimationFrame');
if (fire) {
  const main = events.filter((e) => e.ph === 'X' && names.get(`${e.pid}:${e.tid}`) === 'CrRendererMain' && e.ts >= fire.ts && e.ts <= fire.ts + fire.ms * 1000);
  const wait = main.find((e) => e.dur > 100_000 && /GetProgramiv|WaitFor|Finish/.test(e.name));
  const before = main.filter((e) => /GLES2Implementation|WebGL/.test(e.name) && (!wait || e.ts < wait.ts)).slice(-25);
  console.log('takılmadan hemen önceki GL çağrıları:');
  for (const e of before) console.log(`   ${e.name} ${e.args && Object.keys(e.args).length ? JSON.stringify(e.args).slice(0, 120) : ''}`);
  const gpu = events.filter((e) => e.ph === 'X' && /Executable|Link|Compile|InputLayout|ShaderD3D|ProgramD3D/i.test(e.name) && e.ts >= fire.ts && e.ts <= fire.ts + fire.ms * 1000);
  console.log('GPU sürecindeki derleme işleri:');
  for (const e of gpu.slice(0, 20)) console.log(`   ${Math.round(e.dur / 1000)} ms  ${e.name} ${e.args ? JSON.stringify(e.args).slice(0, 160) : ''}`);
  // derlenen kaynağı kaydet ve içindeki Unity değişken/anahtar adlarını özetle
  const { writeFile } = await import('node:fs/promises');
  let i = 0;
  for (const e of gpu.filter((g) => g.name === 'D3DCompile' && g.args?.source)) {
    const file = `test-results/unity/hitch-shader-${i++}.hlsl`;
    await writeFile(file, e.args.source);
    const ids = [...new Set(e.args.source.match(/_[A-Za-z][A-Za-z0-9_]{2,}/g) ?? [])].filter((s) => !/^_(dx|gl|webgl|angle)/i.test(s));
    console.log(`   ${file} (${Math.round(e.dur / 1000)} ms): ${ids.slice(0, 40).join(' ')}`);
  }
}
const seen = new Set();
console.log('40 ms üzeri işler (en uzunlar):');
for (const l of long) {
  const key = `${l.thread}|${l.name}`;
  if (seen.has(key) && seen.size > 25) continue;
  seen.add(key);
  console.log(`  ${String(l.ms).padStart(5)} ms  ${l.thread.padEnd(36)} ${l.name}`);
  if (seen.size >= 30) break;
}
