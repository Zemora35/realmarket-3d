import type { FastifyInstance } from 'fastify';

const ALLOWED_HEADERS = 'content-type, x-session-token, authorization';
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

/**
 * İzin listeli CORS. Varsayılan: kapalı (aynı köken). Unity Web derlemesi veya site başka bir
 * alan adından sunuluyorsa CORS_ORIGINS="https://site.ornek,https://cdn.ornek" ile açılır.
 * Joker (*) kabul edilmez: oturum anahtarı başlıkta taşındığından köken tek tek belirtilmelidir.
 */
export function registerCors(app: FastifyInstance, origins: readonly string[]) {
  const allowed = new Set(origins.map((o) => o.trim().replace(/\/$/, '')).filter((o) => /^https?:\/\/[^*]+$/.test(o)));
  if (allowed.size === 0) return;

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return;
    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'Origin');
    reply.header('access-control-expose-headers', 'content-length, etag');
    if (req.method === 'OPTIONS') {
      reply
        .header('access-control-allow-methods', ALLOWED_METHODS)
        .header('access-control-allow-headers', ALLOWED_HEADERS)
        .header('access-control-max-age', '600')
        .code(204)
        .send();
    }
  });

  // Ön uçuş istekleri için yol eşleşmesi (aksi hâlde 404 işleyicisine düşer)
  app.options('/api/*', async (_req, reply) => reply.code(204).send());
}
