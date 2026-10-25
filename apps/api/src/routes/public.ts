import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { stores } from '@realmarket/database';
import { normalizeTr } from '@realmarket/shared';
import type { AppContext } from '../context';
import { buildScene } from '../services/scene';
import { getStoreCatalog } from '../services/catalog';

export function publicRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.get('/api/health', { schema: { tags: ['sistem'] } }, async () => ({ ok: true, database: ctx.driver, time: new Date().toISOString() }));

    app.get('/api/stores', { schema: { tags: ['mağaza'] } }, async () => {
      const rows = await ctx.db.select().from(stores);
      return rows.map((s) => ({ id: s.id, name: s.name, chain: s.chain, isDemo: s.isDemo }));
    });

    app.get(
      '/api/stores/:storeId/scene',
      { schema: { tags: ['mağaza'], params: z.object({ storeId: z.string().min(1).max(64) }) } },
      async (req) => buildScene(ctx.db, req.params.storeId),
    );

    // Yerel katalog araması (harici API'ye her tuşta istek atılmaz).
    app.get(
      '/api/stores/:storeId/products',
      {
        schema: {
          tags: ['mağaza'],
          params: z.object({ storeId: z.string().min(1).max(64) }),
          querystring: z.object({ q: z.string().max(80).optional() }),
        },
      },
      async (req) => {
        const all = await getStoreCatalog(ctx.db, req.params.storeId);
        const q = normalizeTr(req.query.q ?? '');
        if (!q) return all;
        return all.filter((p) => normalizeTr(`${p.name} ${p.brand} ${p.subcategory ?? ''} ${p.gtin}`).includes(q));
      },
    );

    app.get('/api/files/*', { schema: { hide: true } }, async (req, reply) => {
      const key = (req.params as { '*': string })['*'];
      const file = await ctx.storage.get(key).catch(() => null);
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Dosya bulunamadı' });
      return reply
        .header('content-type', file.contentType)
        .header('cache-control', 'public, max-age=3600')
        .header('x-content-type-options', 'nosniff')
        .send(file.data);
    });
  };
}
