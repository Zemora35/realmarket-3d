import Fastify, { type FastifyError } from 'fastify';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppContext } from './context';
import { HttpError } from './errors';
import { registerCors } from './cors';
import { adminRoutes } from './routes/admin';
import { modelRoutes } from './routes/models';
import { publicRoutes } from './routes/public';
import { shoppingRoutes } from './routes/shopping';

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ? { level: 'info', transport: undefined } : false,
    bodyLimit: 6 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      info: { title: 'RealMarket 3D API', version: '0.1.0', description: 'Sanal süpermarket — katalog, planogram, sepet ve sipariş API' },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 } });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({ error: 'VALIDATION', message: 'Geçersiz istek', details: err.validation });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? 'BAD_REQUEST', message: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'INTERNAL', message: 'Beklenmeyen sunucu hatası' });
  });

  registerCors(app, ctx.corsOrigins ?? []);
  await app.register(publicRoutes(ctx));
  await app.register(shoppingRoutes(ctx));
  await app.register(adminRoutes(ctx));
  if (ctx.modelsDir) await app.register(modelRoutes(ctx.modelsDir));
  return app;
}
