import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { stores } from '@realmarket/database';
import type { AppContext } from '../context';
import { notFound } from '../errors';
import { addToCart, authorizeSession, checkout, createShoppingSession, getCart, MAX_LINE_QUANTITY, removeFromCart } from '../services/cart';
import { invalidateScene } from '../services/scene';

const sessionParams = z.object({ sessionId: z.uuid() });
const lineBody = z.object({ storeProductId: z.uuid(), quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).default(1) });
const tokenOf = (headers: Record<string, unknown>) => (typeof headers['x-session-token'] === 'string' ? headers['x-session-token'] : undefined);

export function shoppingRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      '/api/stores/:storeId/sessions',
      { schema: { tags: ['alışveriş'], params: z.object({ storeId: z.string().min(1).max(64) }) } },
      async (req, reply) => {
        const [store] = await ctx.db.select().from(stores).where(eq(stores.id, req.params.storeId));
        if (!store) throw notFound('Mağaza');
        const s = await createShoppingSession(ctx.db, store.id);
        return reply.code(201).send(s);
      },
    );

    app.get('/api/sessions/:sessionId/cart', { schema: { tags: ['alışveriş'], params: sessionParams } }, async (req) => {
      const session = await authorizeSession(ctx.db, req.params.sessionId, tokenOf(req.headers));
      return getCart(ctx.db, session.id, session.status);
    });

    app.post('/api/sessions/:sessionId/cart/add', { schema: { tags: ['alışveriş'], params: sessionParams, body: lineBody } }, async (req) => {
      const session = await authorizeSession(ctx.db, req.params.sessionId, tokenOf(req.headers), { requireActive: true });
      const cart = await addToCart(ctx.db, session, req.body.storeProductId, req.body.quantity);
      invalidateScene(session.storeId);
      return cart;
    });

    app.post('/api/sessions/:sessionId/cart/remove', { schema: { tags: ['alışveriş'], params: sessionParams, body: lineBody } }, async (req) => {
      const session = await authorizeSession(ctx.db, req.params.sessionId, tokenOf(req.headers), { requireActive: true });
      const cart = await removeFromCart(ctx.db, session.id, req.body.storeProductId, req.body.quantity);
      invalidateScene(session.storeId);
      return cart;
    });

    app.post('/api/sessions/:sessionId/checkout/quote', { schema: { tags: ['alışveriş'], params: sessionParams } }, async (req) => {
      const session = await authorizeSession(ctx.db, req.params.sessionId, tokenOf(req.headers), { requireActive: true });
      return getCart(ctx.db, session.id);
    });

    app.post(
      '/api/sessions/:sessionId/checkout/pay',
      {
        schema: {
          tags: ['alışveriş'],
          params: sessionParams,
          body: z.object({ paymentMethod: z.literal('demo'), expectedTotalKurus: z.number().int().min(0) }),
        },
      },
      async (req, reply) => {
        const session = await authorizeSession(ctx.db, req.params.sessionId, tokenOf(req.headers), { requireActive: true });
        const order = await checkout(ctx.db, session, req.body.expectedTotalKurus, ctx.payment);
        invalidateScene(session.storeId);
        return reply.code(201).send(order);
      },
    );
  };
}
