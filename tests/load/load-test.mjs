#!/usr/bin/env node
// RealMarket API yük testi (bağımlılıksız). Her sanal kullanıcı gerçek bir alışveriş akışı yürütür:
//   oturum aç → (önbellekli) sahne verisi → ürün listesi → 3 ürün ekle → sepeti oku → 1 çıkar → teklif
//   → kullanıcıların %20'si demo ödeme yapar.
// Kullanıcılar ramp süresi boyunca kademeli başlar; her biri akışı süre dolana kadar tekrarlar.
//
//   node tests/load/load-test.mjs --url http://127.0.0.1:3001 --users 100,500,1000 --duration 60 --ramp 20 [--out report.json]
//
// Çıktı: aşama başına istek/sn, hata oranı, uç nokta bazında p50/p95/p99 gecikme (ms).
import { writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const arg = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);
const BASE = arg('--url', 'http://127.0.0.1:3001').replace(/\/$/, '');
const STORE = arg('--store', 'demo-market');
const STAGES = arg('--users', '100,500,1000').split(',').map(Number);
const DURATION = Number(arg('--duration', 60)) * 1000;
const RAMP = Number(arg('--ramp', 20)) * 1000;
const OUT = arg('--out', null);
const PAY_RATIO = Number(arg('--pay', 0.2));


function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function runStage(users) {
  const stats = new Map(); // endpoint → { lat: [], errors: 0, codes: {} }
  const record = (name, ms, ok, code) => {
    let s = stats.get(name);
    if (!s) stats.set(name, (s = { lat: [], errors: 0, codes: {} }));
    s.lat.push(ms);
    if (!ok) s.errors++;
    s.codes[code] = (s.codes[code] ?? 0) + 1;
  };
  const call = async (name, path, { method = 'GET', body, token } = {}) => {
    const t0 = performance.now();
    let code = 0;
    try {
      const res = await fetch(BASE + path, {
        method,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-session-token': token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      code = res.status;
      const data = await res.json().catch(() => null);
      record(name, performance.now() - t0, res.ok, code);
      return res.ok ? data : null;
    } catch {
      record(name, performance.now() - t0, false, code || 'NET');
      return null;
    }
  };

  const products = await call('products', `/api/stores/${STORE}/products`);
  if (!products?.length) throw new Error('ürün listesi alınamadı — API çalışıyor mu?');
  const ids = products.filter((p) => p.available > 50).map((p) => p.storeProductId);
  stats.clear();

  const end = Date.now() + RAMP + DURATION;
  let flows = 0;
  let payments = 0;
  const vu = async (i) => {
    await new Promise((r) => setTimeout(r, (RAMP * i) / users));
    while (Date.now() < end) {
      const s = await call('session', `/api/stores/${STORE}/sessions`, { method: 'POST', body: {} });
      if (!s) continue;
      await call('scene', `/api/stores/${STORE}/scene`);
      await call('products', `/api/stores/${STORE}/products`);
      const picked = [0, 1, 2].map((k) => ids[(i * 7 + k * 13 + flows) % ids.length]);
      for (const sp of picked) {
        await call('cart.add', `/api/sessions/${s.sessionId}/cart/add`, { method: 'POST', body: { storeProductId: sp, quantity: 1 }, token: s.token });
      }
      await call('cart.get', `/api/sessions/${s.sessionId}/cart`, { token: s.token });
      await call('cart.remove', `/api/sessions/${s.sessionId}/cart/remove`, { method: 'POST', body: { storeProductId: picked[0], quantity: 1 }, token: s.token });
      const q = await call('quote', `/api/sessions/${s.sessionId}/checkout/quote`, { method: 'POST', body: {}, token: s.token });
      if (q && q.lines?.length && Math.random() < PAY_RATIO) {
        const o = await call('pay', `/api/sessions/${s.sessionId}/checkout/pay`, { method: 'POST', body: { paymentMethod: 'demo', expectedTotalKurus: q.totalKurus }, token: s.token });
        if (o) payments++;
      }
      flows++;
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 600)); // düşünme süresi
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: users }, (_, i) => vu(i)));
  const seconds = (Date.now() - t0) / 1000;

  let total = 0;
  let errors = 0;
  const endpoints = {};
  for (const [name, s] of stats) {
    const sorted = s.lat.sort((a, b) => a - b);
    total += sorted.length;
    errors += s.errors;
    endpoints[name] = {
      requests: sorted.length,
      errors: s.errors,
      p50: Math.round(pct(sorted, 50)),
      p95: Math.round(pct(sorted, 95)),
      p99: Math.round(pct(sorted, 99)),
      max: Math.round(sorted[sorted.length - 1] ?? 0),
      codes: s.codes,
    };
  }
  return { users, seconds: Math.round(seconds), requests: total, rps: Math.round(total / seconds), errorRate: total ? errors / total : 0, flows, payments, endpoints };
}

const report = { base: BASE, startedAt: new Date().toISOString(), node: process.version, durationS: DURATION / 1000, rampS: RAMP / 1000, stages: [] };
for (const users of STAGES) {
  process.stdout.write(`\n▶ ${users} kullanıcı (${RAMP / 1000} sn kademeli başlatma + ${DURATION / 1000} sn)…\n`);
  const r = await runStage(users);
  report.stages.push(r);
  console.log(`  ${r.requests} istek, ${r.rps} istek/sn, hata %${(r.errorRate * 100).toFixed(2)}, ${r.flows} akış, ${r.payments} ödeme`);
  console.log('  uç nokta        istek    hata   p50   p95   p99  (ms)');
  for (const [name, e] of Object.entries(r.endpoints)) {
    console.log(`  ${name.padEnd(14)} ${String(e.requests).padStart(6)} ${String(e.errors).padStart(6)} ${String(e.p50).padStart(5)} ${String(e.p95).padStart(5)} ${String(e.p99).padStart(5)}`);
  }
}
if (OUT) await writeFile(OUT, JSON.stringify(report, null, 2));

// GitHub Actions özet tablosu
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import('node:fs/promises');
  let md = `## Yük testi (${report.durationS} sn + ${report.rampS} sn kademeli başlatma)\n\n| Kullanıcı | İstek/sn | Hata % | Akış | Ödeme | session p95 | scene p95 | cart.add p95 | quote p95 | pay p95 |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const s of report.stages) {
    const e = (n) => (s.endpoints[n] ? `${s.endpoints[n].p95} ms` : '—');
    md += `| ${s.users} | ${s.rps} | ${(s.errorRate * 100).toFixed(2)} | ${s.flows} | ${s.payments} | ${e('session')} | ${e('scene')} | ${e('cart.add')} | ${e('quote')} | ${e('pay')} |\n`;
  }
  await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
}
