import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  assetImportJobs,
  modelGenerationJobs,
  orderItems,
  orders,
  planograms,
  productAssetLicenses,
  productDimensions,
  productImages,
  products,
  shelfSlots,
  storeProducts,
  stores,
  users,
} from '@realmarket/database';
import { PLANOGRAM_ADAPTERS } from '@realmarket/planogram';
import { createOffClient, offProductToRow, parseCatalogContent, processCatalogBatch, type RawRow } from '@realmarket/product-catalog';
import { generateStoreLayout } from '@realmarket/store-generator';
import {
  ASSET_LICENSES,
  IMAGE_VIEWS,
  MODEL_QUALITY,
  PACKAGING_TYPES,
  planogramSchema,
  productAppearanceSchema,
  promotionSchema,
  storeLayoutParamsSchema,
} from '@realmarket/shared';
import type { AppContext } from '../context';
import { forbidden, HttpError, notFound, unauthorized } from '../errors';
import { signToken, verifyPassword, verifyToken } from '../services/auth';
import { getStoreCatalog } from '../services/catalog';
import { getActiveLayout, saveLayout } from '../services/layout';
import { applyPlanogram, evaluatePlanogram, storeProductIndex } from '../services/planograms';
import { addProductToStore, insertProduct, runParametricModelJob, updateStoreProduct, upsertImportedProduct } from '../services/products';
import { runQualityChecks } from '../services/quality';
import { invalidateScene } from '../services/scene';
import { contentHash, imageSize, sniffImage } from '../services/storage';

const storeParams = z.object({ storeId: z.string().min(1).max(64) });
const productParams = z.object({ productId: z.uuid() });
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function assertStoreAccess(req: FastifyRequest, storeId: string) {
  const u = req.user;
  if (!u) throw unauthorized();
  if (u.role === 'admin') return;
  if (u.role === 'store_manager' && u.storeId === storeId) return;
  throw forbidden('Bu mağazayı yönetme yetkiniz yok');
}
function assertAdmin(req: FastifyRequest) {
  if (req.user?.role !== 'admin') throw forbidden('Bu işlem yalnızca sistem yöneticisine açıktır');
}

/** Kaba kuvvet denemelerine karşı IP başına dakikada 10 giriş denemesi. */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function checkLoginRate(ip: string) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return;
  }
  entry.count++;
  if (entry.count > 10) throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Çok fazla giriş denemesi. Bir dakika sonra tekrar deneyin.');
}

export function adminRoutes(ctx: AppContext): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      '/api/auth/login',
      {
        schema: { tags: ['yönetim'], body: z.object({ email: z.email().max(200), password: z.string().min(1).max(200) }) },
      },
      async (req) => {
        checkLoginRate(req.ip);
        const [user] = await ctx.db.select().from(users).where(eq(users.email, req.body.email.toLowerCase()));
        if (!user || !verifyPassword(req.body.password, user.passwordHash) || user.role === 'customer') {
          throw unauthorized('E-posta veya parola hatalı');
        }
        const token = signToken({ uid: user.id, role: user.role, storeId: user.storeId }, ctx.authSecret);
        return { token, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, storeId: user.storeId } };
      },
    );

    // --- Yetkili bölge ----------------------------------------------------------
    await app.register(async (admin) => {
      admin.addHook('preHandler', async (req) => {
        const header = req.headers.authorization;
        const claims = header?.startsWith('Bearer ') ? verifyToken(header.slice(7), ctx.authSecret) : null;
        if (!claims || claims.role === 'customer') throw unauthorized();
        req.user = claims;
      });
      const r = admin.withTypeProvider<import('fastify-type-provider-zod').ZodTypeProvider>();

      r.get('/api/admin/me', { schema: { tags: ['yönetim'] } }, async (req) => {
        const [u] = await ctx.db.select().from(users).where(eq(users.id, req.user!.uid));
        if (!u) throw unauthorized();
        return { id: u.id, email: u.email, displayName: u.displayName, role: u.role, storeId: u.storeId };
      });

      r.get('/api/admin/stores', { schema: { tags: ['yönetim'] } }, async (req) => {
        const rows = await ctx.db.select().from(stores);
        return rows.filter((s) => req.user!.role === 'admin' || s.id === req.user!.storeId);
      });

      // --- Ürünler ---------------------------------------------------------------
      r.get(
        '/api/admin/stores/:storeId/products',
        { schema: { tags: ['ürün'], params: storeParams, querystring: z.object({ q: z.string().max(80).optional() }) } },
        async (req) => {
          assertStoreAccess(req, req.params.storeId);
          const all = await getStoreCatalog(ctx.db, req.params.storeId, { includeInactive: true });
          const q = (req.query.q ?? '').trim().toLocaleLowerCase('tr-TR');
          return q ? all.filter((p) => `${p.name} ${p.brand} ${p.gtin}`.toLocaleLowerCase('tr-TR').includes(q)) : all;
        },
      );

      const dimsSchema = z.object({
        widthMm: z.number().positive().max(2000),
        heightMm: z.number().positive().max(2000),
        depthMm: z.number().positive().max(2000),
        verified: z.boolean().default(false),
        source: z.string().min(1).max(80).default('MANUAL'),
      });

      r.post(
        '/api/admin/stores/:storeId/products',
        {
          schema: {
            tags: ['ürün'],
            params: storeParams,
            body: z.object({
              gtin: z.string().min(8).max(14),
              name: z.string().min(1).max(200),
              brand: z.string().min(1).max(120),
              category: z.string().min(1).max(60),
              subcategory: z.string().max(120).nullish(),
              netWeightG: z.number().int().positive().nullish(),
              volumeMl: z.number().int().positive().nullish(),
              packagingType: z.enum(PACKAGING_TYPES),
              dimensions: dimsSchema,
              appearance: productAppearanceSchema,
              priceKurus: z.number().int().min(0).max(10_000_000),
              stock: z.number().int().min(0).max(1_000_000),
            }),
          },
        },
        async (req, reply) => {
          assertStoreAccess(req, req.params.storeId);
          assertAdmin(req);
          const b = req.body;
          const productId = await ctx.db.transaction(async (tx) => {
            const id = await insertProduct(tx, {
              ...b,
              dataSource: 'MANUAL',
              verification: b.dimensions.verified ? 'VERIFIED' : 'UNVERIFIED',
              modelQuality: 'PLACEHOLDER',
            });
            await addProductToStore(tx, { storeId: req.params.storeId, productId: id, priceKurus: b.priceKurus, stock: b.stock });
            return id;
          });
          await runParametricModelJob(ctx.db, productId);
          invalidateScene(req.params.storeId);
          return reply.code(201).send({ productId });
        },
      );

      r.patch(
        '/api/admin/products/:productId',
        {
          schema: {
            tags: ['ürün'],
            params: productParams,
            body: z.object({
              name: z.string().min(1).max(200).optional(),
              brand: z.string().min(1).max(120).optional(),
              category: z.string().min(1).max(60).optional(),
              subcategory: z.string().max(120).nullish(),
              packagingType: z.enum(PACKAGING_TYPES).optional(),
              modelQuality: z.enum(MODEL_QUALITY).optional(),
              appearance: productAppearanceSchema.optional(),
              dimensions: dimsSchema.optional(),
            }),
          },
        },
        async (req) => {
          assertAdmin(req);
          const { dimensions, ...rest } = req.body;
          const [p] = await ctx.db.select().from(products).where(eq(products.id, req.params.productId));
          if (!p) throw notFound('Ürün');
          await ctx.db.transaction(async (tx) => {
            if (Object.keys(rest).length) await tx.update(products).set({ ...rest, updatedAt: new Date() }).where(eq(products.id, p.id));
            if (dimensions) {
              await tx
                .insert(productDimensions)
                .values({ productId: p.id, ...dimensions })
                .onConflictDoUpdate({ target: productDimensions.productId, set: { ...dimensions, updatedAt: new Date() } });
            }
          });
          let replanned = 0;
          if (dimensions || rest.packagingType) {
            await runParametricModelJob(ctx.db, p.id);
            // ölçüsü değişen ürünü içeren rafların yuvaları yeniden hesaplanır
            const affected = await ctx.db
              .selectDistinct({ planogramId: shelfSlots.planogramId })
              .from(shelfSlots)
              .innerJoin(storeProducts, eq(storeProducts.id, shelfSlots.storeProductId))
              .where(eq(storeProducts.productId, p.id));
            const docs = affected.length
              ? await ctx.db.select().from(planograms).where(inArray(planograms.id, affected.map((a) => a.planogramId!).filter(Boolean)))
              : [];
            for (const d of docs) {
              const r2 = await applyPlanogram(ctx.db, { storeId: d.storeId, planogram: d.document, source: d.source });
              if (r2.saved) replanned++;
            }
          }
          invalidateScene();
          return { ok: true, replannedShelves: replanned };
        },
      );

      r.put(
        '/api/admin/stores/:storeId/products/:productId',
        {
          schema: {
            tags: ['ürün'],
            params: storeParams.extend({ productId: z.uuid() }),
            body: z.object({
              priceKurus: z.number().int().min(0).max(10_000_000).optional(),
              listPriceKurus: z.number().int().min(0).max(10_000_000).nullish(),
              promotion: promotionSchema.nullish(),
              onHand: z.number().int().min(0).max(1_000_000).optional(),
              isActive: z.boolean().optional(),
            }),
          },
        },
        async (req) => {
          assertStoreAccess(req, req.params.storeId);
          const body = req.body;
          await updateStoreProduct(ctx.db, req.params.storeId, req.params.productId, {
            ...body,
            promotion: body.promotion === undefined ? undefined : body.promotion,
          });
          invalidateScene(req.params.storeId);
          return { ok: true };
        },
      );

      r.post('/api/admin/products/:productId/images', { schema: { tags: ['ürün'], params: productParams } }, async (req, reply) => {
        assertAdmin(req);
        const [p] = await ctx.db.select().from(products).where(eq(products.id, req.params.productId));
        if (!p) throw notFound('Ürün');
        const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
        if (!file) throw new HttpError(400, 'NO_FILE', 'Dosya gönderilmedi');
        const data = await file.toBuffer();
        if (file.file.truncated) throw new HttpError(413, 'FILE_TOO_LARGE', 'Görsel en fazla 5 MB olabilir');
        const kind = sniffImage(data);
        if (!kind) throw new HttpError(415, 'UNSUPPORTED_TYPE', 'Yalnızca PNG, JPEG veya WebP kabul edilir');
        const field = (name: string) => {
          const f = file.fields[name];
          return f && !Array.isArray(f) && 'value' in f ? String(f.value) : undefined;
        };
        const view = z.enum(IMAGE_VIEWS).catch('front').parse(field('view'));
        const license = z.enum(ASSET_LICENSES).catch('UNVERIFIED').parse(field('license'));
        const attribution = field('attribution')?.slice(0, 300) ?? null;
        const hash = contentHash(data);
        const stored = await ctx.storage.put(`products/${p.id}/${view}-${hash.slice(0, 12)}.${kind.ext}`, data, kind.mime);
        const size = imageSize(data, kind.mime);
        await ctx.db.transaction(async (tx) => {
          const [lic] = await tx
            .insert(productAssetLicenses)
            .values({
              productId: p.id,
              assetType: 'image',
              license,
              attribution,
              sourceUrl: field('sourceUrl')?.slice(0, 500) ?? null,
              commercialUseAllowed: ['CC0-1.0', 'CC-BY-4.0', 'OWNER_PERMISSION', 'DEMO_GENERATED'].includes(license) ? true : null,
            })
            .returning({ id: productAssetLicenses.id });
          await tx.insert(productImages).values({
            productId: p.id,
            url: stored.url,
            view,
            width: size?.width ?? null,
            height: size?.height ?? null,
            contentHash: hash,
            mimeType: kind.mime,
            licenseId: lic.id,
          });
          // Tek ön görsel + parametrik geometri = tek görüntüden yaklaşık model
          if (view === 'front' && p.modelQuality === 'PLACEHOLDER') {
            await tx.update(products).set({ modelQuality: 'SINGLE_IMAGE_APPROXIMATION', updatedAt: new Date() }).where(eq(products.id, p.id));
          }
        });
        invalidateScene();
        return reply.code(201).send({ url: stored.url, view, license, width: size?.width, height: size?.height });
      });

      r.post('/api/admin/products/:productId/model/regenerate', { schema: { tags: ['ürün'], params: productParams } }, async (req) => {
        assertAdmin(req);
        const result = await runParametricModelJob(ctx.db, req.params.productId);
        invalidateScene();
        return result;
      });

      // --- Planogramlar ------------------------------------------------------------
      r.get('/api/admin/stores/:storeId/planograms', { schema: { tags: ['planogram'], params: storeParams } }, async (req) => {
        assertStoreAccess(req, req.params.storeId);
        const rows = await ctx.db.select().from(planograms).where(eq(planograms.storeId, req.params.storeId)).orderBy(planograms.shelfId);
        return rows.map((p) => ({
          id: p.id,
          planogramId: p.document.planogramId,
          shelfId: p.document.shelfId,
          aisleId: p.aisleId,
          kind: p.document.fixture.kind,
          itemCount: p.document.items.length,
          fillRatio: p.fillRatio,
          errorCount: p.issues.filter((i) => i.severity === 'error').length,
          warningCount: p.issues.filter((i) => i.severity === 'warning').length,
          source: p.source,
          updatedAt: p.updatedAt,
        }));
      });

      r.get(
        '/api/admin/stores/:storeId/planograms/:shelfId',
        { schema: { tags: ['planogram'], params: storeParams.extend({ shelfId: z.string().min(1).max(64) }) } },
        async (req) => {
          assertStoreAccess(req, req.params.storeId);
          const [row] = await ctx.db
            .select()
            .from(planograms)
            .where(and(eq(planograms.storeId, req.params.storeId), eq(planograms.shelfId, `${req.params.storeId}/${req.params.shelfId}`)));
          if (!row) throw notFound('Planogram');
          return { document: row.document, issues: row.issues, fillRatio: row.fillRatio, source: row.source, updatedAt: row.updatedAt };
        },
      );

      r.post(
        '/api/admin/stores/:storeId/planograms/validate',
        { schema: { tags: ['planogram'], params: storeParams, body: z.object({ document: planogramSchema }) } },
        async (req) => {
          assertStoreAccess(req, req.params.storeId);
          const index = await storeProductIndex(ctx.db, req.params.storeId);
          return evaluatePlanogram(req.body.document, index);
        },
      );

      r.put(
        '/api/admin/stores/:storeId/planograms',
        { schema: { tags: ['planogram'], params: storeParams, body: z.object({ document: planogramSchema }) } },
        async (req, reply) => {
          assertStoreAccess(req, req.params.storeId);
          const result = await applyPlanogram(ctx.db, { storeId: req.params.storeId, planogram: req.body.document, source: 'editor' });
          invalidateScene(req.params.storeId);
          return reply.code(result.saved ? 200 : 422).send(result);
        },
      );

      r.post(
        '/api/admin/stores/:storeId/planograms/import',
        {
          schema: {
            tags: ['planogram'],
            params: storeParams,
            body: z.object({ format: z.enum(['json', 'csv', 'pln']), content: z.string().max(5_000_000) }),
          },
        },
        async (req) => {
          assertStoreAccess(req, req.params.storeId);
          const adapter = PLANOGRAM_ADAPTERS[req.body.format];
          const parsed = adapter.read(req.body.content, { storeId: req.params.storeId });
          const index = await storeProductIndex(ctx.db, req.params.storeId);
          const results = [];
          for (const pg of parsed.planograms) {
            try {
              const res = await applyPlanogram(ctx.db, { storeId: req.params.storeId, planogram: pg, source: req.body.format, index });
              results.push({ planogramId: pg.planogramId, shelfId: pg.shelfId, saved: res.saved, issues: res.issues, fillRatio: res.fillRatio });
            } catch (e) {
              results.push({ planogramId: pg.planogramId, shelfId: pg.shelfId, saved: false, issues: [{ code: 'ERROR', severity: 'error', message: (e as Error).message }] });
            }
          }
          await ctx.db.insert(assetImportJobs).values({
            kind: `planogram_${req.body.format}`,
            status: parsed.errors.length || results.some((x) => !x.saved) ? 'completed_with_errors' : 'completed',
            storeId: req.params.storeId,
            cursor: parsed.planograms.length,
            total: parsed.planograms.length,
            report: { parseErrors: parsed.errors, results },
          });
          invalidateScene(req.params.storeId);
          return { adapter: { format: adapter.format, supported: adapter.supported }, parseErrors: parsed.errors, results };
        },
      );

      // --- Mağaza yerleşimi ---------------------------------------------------------
      r.get('/api/admin/stores/:storeId/layout', { schema: { tags: ['mağaza'], params: storeParams } }, async (req) => {
        assertStoreAccess(req, req.params.storeId);
        const row = await getActiveLayout(ctx.db, req.params.storeId);
        if (!row) throw notFound('Yerleşim');
        return { version: row.version, params: row.params, layout: row.layout };
      });

      r.post(
        '/api/admin/stores/:storeId/layout/preview',
        { schema: { tags: ['mağaza'], params: storeParams, body: z.object({ params: storeLayoutParamsSchema.partial() }) } },
        async (req) => {
          assertStoreAccess(req, req.params.storeId);
          return generateStoreLayout(req.body.params);
        },
      );

      r.put(
        '/api/admin/stores/:storeId/layout',
        { schema: { tags: ['mağaza'], params: storeParams, body: z.object({ params: storeLayoutParamsSchema.partial() }) } },
        async (req) => {
          assertStoreAccess(req, req.params.storeId);
          const result = await saveLayout(ctx.db, req.params.storeId, req.body.params);
          invalidateScene(req.params.storeId);
          return { version: result.version, shelves: result.layout.shelves.length, issues: result.layout.issues, planogramIssues: result.planogramIssues };
        },
      );

      // --- Siparişler, kalite, işler ------------------------------------------------
      r.get('/api/admin/stores/:storeId/orders', { schema: { tags: ['sipariş'], params: storeParams } }, async (req) => {
        assertStoreAccess(req, req.params.storeId);
        const rows = await ctx.db.select().from(orders).where(eq(orders.storeId, req.params.storeId)).orderBy(desc(orders.createdAt)).limit(200);
        const items = rows.length ? await ctx.db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((o) => o.id))) : [];
        return rows.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
      });

      r.get('/api/admin/quality', { schema: { tags: ['kalite'], querystring: z.object({ storeId: z.string().max(64).optional() }) } }, async (req) => {
        if (req.query.storeId) assertStoreAccess(req, req.query.storeId);
        else assertAdmin(req);
        return runQualityChecks(ctx.db, req.query.storeId);
      });

      r.get('/api/admin/jobs', { schema: { tags: ['iş'] } }, async (req) => {
        assertAdmin(req);
        const [modelJobs, importJobs] = await Promise.all([
          ctx.db
            .select({ job: modelGenerationJobs, name: products.name })
            .from(modelGenerationJobs)
            .innerJoin(products, eq(products.id, modelGenerationJobs.productId))
            .orderBy(desc(modelGenerationJobs.createdAt))
            .limit(100),
          ctx.db.select().from(assetImportJobs).orderBy(desc(assetImportJobs.createdAt)).limit(50),
        ]);
        return {
          modelJobs: modelJobs.map((m) => ({ ...m.job, productName: m.name })),
          importJobs: importJobs.map(({ input: _input, ...j }) => j),
        };
      });

      // --- Katalog içe aktarma (kaldığı yerden devam eder) -------------------------
      async function runImportJob(jobId: string) {
        const [job] = await ctx.db.select().from(assetImportJobs).where(eq(assetImportJobs.id, jobId));
        if (!job) throw notFound('İş');
        const input = job.input as { rows: RawRow[]; storeId?: string; defaultPriceKurus?: number; dataSource: 'CSV_IMPORT' | 'OPEN_FOOD_FACTS'; dataLicense?: 'ODbL-1.0' };
        let cursor = job.cursor;
        const report = (job.report as { created: number; updated: number; errors: unknown[]; missingDimensions: string[]; missingImages: string[]; heuristicPackaging: string[] } | null) ?? {
          created: 0,
          updated: 0,
          errors: [],
          missingDimensions: [],
          missingImages: [],
          heuristicPackaging: [],
        };
        while (cursor < input.rows.length) {
          const batch = processCatalogBatch(input.rows, { cursor, batchSize: 200, dataSource: input.dataSource, dataLicense: input.dataLicense });
          for (const np of batch.products) {
            try {
              const res = await upsertImportedProduct(ctx.db, np, { storeId: input.storeId, defaultPriceKurus: input.defaultPriceKurus });
              if (res.created) report.created++;
              else report.updated++;
              if (res.created) await runParametricModelJob(ctx.db, res.productId);
            } catch (e) {
              report.errors.push({ gtin: np.gtin, message: (e as Error).message });
            }
          }
          report.errors.push(...batch.report.errors);
          report.missingDimensions.push(...batch.report.missingDimensions);
          report.missingImages.push(...batch.report.missingImages);
          report.heuristicPackaging.push(...batch.report.heuristicPackaging);
          cursor = batch.report.cursor;
          // her partiden sonra imleç kaydedilir: kesintide /resume ile devam edilir
          await ctx.db.update(assetImportJobs).set({ cursor, report, status: 'running', updatedAt: new Date() }).where(eq(assetImportJobs.id, jobId));
        }
        const status = report.errors.length ? 'completed_with_errors' : 'completed';
        await ctx.db.update(assetImportJobs).set({ status, updatedAt: new Date() }).where(eq(assetImportJobs.id, jobId));
        if (input.storeId) invalidateScene(input.storeId);
        return { jobId, status, cursor, total: input.rows.length, report };
      }

      r.post(
        '/api/admin/import/catalog',
        {
          schema: {
            tags: ['içe aktarma'],
            body: z.object({
              format: z.enum(['csv', 'json', 'jsonl']),
              content: z.string().max(5_000_000),
              storeId: z.string().max(64).optional(),
              defaultPriceKurus: z.number().int().min(0).optional(),
            }),
          },
        },
        async (req) => {
          assertAdmin(req);
          let rows: RawRow[];
          try {
            rows = parseCatalogContent(req.body.format, req.body.content);
          } catch (e) {
            throw new HttpError(400, 'PARSE_ERROR', `İçerik okunamadı: ${(e as Error).message}`);
          }
          const [job] = await ctx.db
            .insert(assetImportJobs)
            .values({
              kind: `catalog_${req.body.format}`,
              status: 'queued',
              storeId: req.body.storeId ?? null,
              total: rows.length,
              input: { rows, storeId: req.body.storeId, defaultPriceKurus: req.body.defaultPriceKurus, dataSource: 'CSV_IMPORT' },
            })
            .returning();
          return runImportJob(job.id);
        },
      );

      r.post('/api/admin/import/jobs/:jobId/resume', { schema: { tags: ['içe aktarma'], params: z.object({ jobId: z.uuid() }) } }, async (req) => {
        assertAdmin(req);
        return runImportJob(req.params.jobId);
      });

      r.post(
        '/api/admin/import/off',
        {
          schema: {
            tags: ['içe aktarma'],
            body: z.object({ barcodes: z.array(z.string().min(8).max(14)).min(1).max(50), storeId: z.string().max(64).optional() }),
          },
        },
        async (req) => {
          assertAdmin(req);
          const client = createOffClient({ userAgent: ctx.offUserAgent, fetchImpl: ctx.fetchImpl });
          const rows: RawRow[] = [];
          const notFoundList: string[] = [];
          const fetchErrors: { gtin: string; message: string }[] = [];
          for (const gtin of req.body.barcodes) {
            try {
              const p = await client.getProduct(gtin);
              if (p) rows.push(offProductToRow(p));
              else notFoundList.push(gtin);
            } catch (e) {
              fetchErrors.push({ gtin, message: (e as Error).message });
            }
          }
          const [job] = await ctx.db
            .insert(assetImportJobs)
            .values({
              kind: 'off_barcodes',
              status: 'queued',
              storeId: req.body.storeId ?? null,
              total: rows.length,
              input: { rows, storeId: req.body.storeId, dataSource: 'OPEN_FOOD_FACTS', dataLicense: 'ODbL-1.0' },
            })
            .returning();
          const result = await runImportJob(job.id);
          return { ...result, notFound: notFoundList, fetchErrors };
        },
      );
    });
  };
}
