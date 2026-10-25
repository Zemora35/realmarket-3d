import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';

const TYPES: Record<string, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  ktx2: 'image/ktx2',
};

/**
 * Ürün 3B modelleri (asset pipeline çıktısı: tools/model-export). Unity istemcisi önce
 * /api/models/manifest.json'u, sonra ürün başına LOD GLB dosyalarını ister.
 * Dosyalar değişmez içerik olarak ETag ile önbelleğe alınır.
 */
export function modelRoutes(modelsDir: string): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/models/*', { schema: { hide: true } }, async (req, reply) => {
      const key = (req.params as { '*': string })['*'];
      const safe = normalize(key).replace(/^([/\\])+/, '');
      if (!safe || safe.includes('..') || !/^[\w\-./\\]+$/.test(safe)) {
        return reply.code(400).send({ error: 'BAD_PATH', message: 'Geçersiz model yolu' });
      }
      const ext = safe.split('.').pop()?.toLowerCase() ?? '';
      const type = TYPES[ext];
      if (!type) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Model bulunamadı' });
      const file = join(modelsDir, safe.split('/').join(sep));
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: ext === 'json' ? 'Model bildirimi yok (tools/model-export çalıştırılmadı)' : 'Model bulunamadı' });
      }
      const etag = `"${createHash('sha1').update(`${safe}:${info.size}:${info.mtimeMs}`).digest('hex').slice(0, 16)}"`;
      if (req.headers['if-none-match'] === etag) return reply.code(304).header('etag', etag).send();
      const data = await readFile(file);
      return reply
        .header('content-type', type)
        .header('etag', etag)
        .header('cache-control', ext === 'json' ? 'public, max-age=60' : 'public, max-age=86400')
        .header('x-content-type-options', 'nosniff')
        .send(data);
    });
  };
}
