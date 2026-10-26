#!/usr/bin/env node
// Web sitesi için bağımlılıksız yerel sunucu (üretimde aynı yönlendirmeleri Caddy yapar):
//   /api/*      → API (varsayılan http://127.0.0.1:3001)
//   /unity/*    → Unity WebGL derlemesi (varsa); .br/.gz dosyalarına Content-Encoding + doğru MIME
//   /3d/*       → Three.js istemcisi (web geliştirme sunucusuna yönlendirme)
//   diğer       → apps/site (SPA: bilinmeyen yollar index.html)
//
//   node tools/site-dev/serve.mjs [--port 5180] [--unity unity/RealMarket3D/Builds/WebGL]
import { createServer, request } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (n, f) => (args.includes(n) ? args[args.indexOf(n) + 1] : f);
const port = Number(arg('--port', process.env.SITE_PORT ?? 5180));
const api = new URL(arg('--api', process.env.API_URL ?? 'http://127.0.0.1:3001'));
const threeUrl = arg('--three', process.env.THREE_URL ?? 'http://localhost:5173/');
const repo = resolve(import.meta.dirname, '../..');
const siteRoot = join(repo, 'apps/site');
const unityRoot = resolve(repo, arg('--unity', process.env.UNITY_BUILD_DIR ?? 'unity/RealMarket3D/Builds/WebGL'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.glb': 'model/gltf-binary',
};

/** Unity çıktısı: "X.wasm.br" → içerik türü wasm, Content-Encoding br */
function unityHeaders(file) {
  const enc = file.endsWith('.br') ? 'br' : file.endsWith('.gz') ? 'gzip' : null;
  const base = enc ? file.slice(0, -(enc === 'br' ? 3 : 3)) : file;
  const type = MIME[extname(base)] ?? 'application/octet-stream';
  return enc ? { 'content-type': type, 'content-encoding': enc } : { 'content-type': type };
}

async function serveFile(res, root, rel, extra = {}, spa = false) {
  const safe = normalize(decodeURIComponent(rel)).replace(/^([/\\])+/, '');
  if (safe.includes('..')) return send(res, 400, 'Geçersiz yol');
  let file = join(root, safe);
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) { file = join(file, 'index.html'); info = await stat(file).catch(() => null); }
  if (!info && spa) { file = join(root, 'index.html'); info = await stat(file).catch(() => null); }
  if (!info) return send(res, 404, 'Bulunamadı');
  const headers = { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-length': info.size, 'x-content-type-options': 'nosniff', ...extra };
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

function send(res, code, text) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function proxy(req, res, target) {
  const p = request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  p.on('error', () => send(res, 502, 'API sunucusuna ulaşılamadı'));
  req.pipe(p);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return proxy(req, res, api);
    if (url.pathname.startsWith('/unity/')) {
      const rel = url.pathname.slice('/unity/'.length);
      return serveFile(res, unityRoot, rel, { ...unityHeaders(rel), 'cache-control': 'no-cache' });
    }
    if (url.pathname === '/3d' || url.pathname.startsWith('/3d/')) {
      res.writeHead(302, { location: threeUrl });
      return res.end();
    }
    return serveFile(res, siteRoot, url.pathname === '/' ? 'index.html' : url.pathname, { 'cache-control': 'no-cache' }, true);
  } catch (e) {
    send(res, 500, String(e));
  }
}).listen(port, () => console.log(`[site] http://localhost:${port}  (api → ${api.origin}, unity → ${unityRoot})`));
