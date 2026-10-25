import { and, eq } from 'drizzle-orm';
import {
  inventory,
  modelGenerationJobs,
  productAssetLicenses,
  productBarcodes,
  productDataSources,
  productDimensions,
  productModels,
  products,
  storePrices,
  storeProducts,
  type Db,
} from '@realmarket/database';
import { buildProductGeometry, validateProductGeometry } from '@realmarket/product-modeler';
import type { NormalizedProduct } from '@realmarket/product-catalog';
import {
  validateGtin,
  type AssetLicense,
  type DataSource,
  type DataVerification,
  type ModelQuality,
  type PackagingType,
  type ProductAppearance,
  type Promotion,
} from '@realmarket/shared';
import { HttpError, notFound } from '../errors';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface CreateProductInput {
  gtin: string;
  name: string;
  brand: string;
  category: string;
  subcategory?: string | null;
  netWeightG?: number | null;
  volumeMl?: number | null;
  packagingType: PackagingType;
  manufacturer?: string | null;
  dimensions: { widthMm: number; heightMm: number; depthMm: number; verified: boolean; source: string };
  appearance: ProductAppearance;
  dataSource: DataSource;
  sourceRef?: string | null;
  dataLicense?: AssetLicense;
  verification: DataVerification;
  modelQuality?: ModelQuality;
  isDemo?: boolean;
  rawData?: unknown;
}

const FALLBACK_COLORS = ['#2a6f97', '#bc4749', '#6a994e', '#f4a259', '#5e548e', '#ef476f', '#118ab2'];

/** Görseli olmayan ürünler için barkoddan deterministik etiket renkleri (açıkça örnek). */
export function fallbackAppearance(gtin: string): ProductAppearance {
  const n = [...gtin].reduce((s, c) => s + c.charCodeAt(0), 0);
  return {
    primaryColor: FALLBACK_COLORS[n % FALLBACK_COLORS.length],
    secondaryColor: '#ffffff',
    accentColor: FALLBACK_COLORS[(n + 3) % FALLBACK_COLORS.length],
    tagline: 'Görsel bekleniyor',
  };
}

export async function insertProduct(tx: Tx | Db, input: CreateProductInput): Promise<string> {
  const v = validateGtin(input.gtin);
  if (!v.valid) throw new HttpError(422, 'INVALID_GTIN', v.error ?? 'Geçersiz barkod');
  const [dupe] = await tx.select().from(productBarcodes).where(eq(productBarcodes.gtin, v.normalized!));
  if (dupe) throw new HttpError(409, 'DUPLICATE_GTIN', `${v.normalized} barkodu zaten kayıtlı`);
  const [p] = await tx
    .insert(products)
    .values({
      name: input.name,
      brand: input.brand,
      category: input.category,
      subcategory: input.subcategory ?? null,
      netWeightG: input.netWeightG ?? null,
      volumeMl: input.volumeMl ?? null,
      packagingType: input.packagingType,
      manufacturer: input.manufacturer ?? null,
      modelQuality: input.modelQuality ?? 'PLACEHOLDER',
      verification: input.verification,
      appearance: input.appearance,
      isDemo: input.isDemo ?? false,
    })
    .returning({ id: products.id });
  await tx.insert(productBarcodes).values({ productId: p.id, gtin: v.normalized!, kind: v.kind!, isPrimary: true });
  await tx.insert(productDimensions).values({ productId: p.id, ...input.dimensions });
  await tx.insert(productDataSources).values({
    productId: p.id,
    source: input.dataSource,
    sourceRef: input.sourceRef ?? null,
    license: input.dataLicense ?? null,
    rawData: input.rawData ?? null,
  });
  if (input.dataLicense) {
    await tx.insert(productAssetLicenses).values({
      productId: p.id,
      assetType: 'data',
      license: input.dataLicense,
      attribution: input.dataSource === 'OPEN_FOOD_FACTS' ? 'Open Food Facts katkıcıları (ODbL)' : null,
      sourceUrl: input.sourceRef ?? null,
      commercialUseAllowed: input.dataLicense === 'DEMO_GENERATED' ? true : input.dataLicense === 'ODbL-1.0' ? true : null,
      notes: input.dataLicense === 'ODbL-1.0' ? 'ODbL: atıf ve türetilmiş veritabanının aynı lisansla paylaşımı gerekir.' : null,
    });
  }
  return p.id;
}

export async function addProductToStore(
  tx: Tx | Db,
  args: { storeId: string; productId: string; priceKurus: number; listPriceKurus?: number | null; promotion?: Promotion | null; stock: number; isActive?: boolean; storeSku?: string | null },
) {
  const [sp] = await tx
    .insert(storeProducts)
    .values({ storeId: args.storeId, productId: args.productId, storeSku: args.storeSku ?? null, isActive: args.isActive ?? true })
    .returning({ id: storeProducts.id });
  await tx.insert(storePrices).values({
    storeProductId: sp.id,
    priceKurus: args.priceKurus,
    listPriceKurus: args.listPriceKurus ?? null,
    promotion: args.promotion ?? null,
  });
  await tx.insert(inventory).values({ storeProductId: sp.id, onHand: args.stock, reserved: 0 });
  return sp.id;
}

/** Mağaza fiyatı/stok/aktiflik güncellemesi. Fiyat değişiminde eski kayıt tarihçe olarak kalır. */
export async function updateStoreProduct(
  db: Db,
  storeId: string,
  productId: string,
  patch: { priceKurus?: number; listPriceKurus?: number | null; promotion?: Promotion | null; onHand?: number; isActive?: boolean },
) {
  return db.transaction(async (tx) => {
    const [sp] = await tx
      .select()
      .from(storeProducts)
      .where(and(eq(storeProducts.storeId, storeId), eq(storeProducts.productId, productId)));
    if (!sp) throw notFound('Mağaza ürünü');
    if (patch.isActive !== undefined) await tx.update(storeProducts).set({ isActive: patch.isActive }).where(eq(storeProducts.id, sp.id));
    if (patch.priceKurus !== undefined || patch.promotion !== undefined || patch.listPriceKurus !== undefined) {
      const [cur] = await tx
        .select()
        .from(storePrices)
        .where(and(eq(storePrices.storeProductId, sp.id), eq(storePrices.isCurrent, true)));
      await tx.update(storePrices).set({ isCurrent: false, validTo: new Date() }).where(eq(storePrices.storeProductId, sp.id));
      await tx.insert(storePrices).values({
        storeProductId: sp.id,
        priceKurus: patch.priceKurus ?? cur?.priceKurus ?? 0,
        listPriceKurus: patch.listPriceKurus !== undefined ? patch.listPriceKurus : (cur?.listPriceKurus ?? null),
        promotion: patch.promotion !== undefined ? patch.promotion : (cur?.promotion ?? null),
      });
    }
    if (patch.onHand !== undefined) {
      const [inv] = await tx.select().from(inventory).where(eq(inventory.storeProductId, sp.id));
      if (inv && patch.onHand < inv.reserved) {
        throw new HttpError(409, 'STOCK_BELOW_RESERVED', `Stok, sepetlerde ayrılmış ${inv.reserved} adedin altına indirilemez`);
      }
      if (inv) await tx.update(inventory).set({ onHand: patch.onHand, updatedAt: new Date() }).where(eq(inventory.storeProductId, sp.id));
      else await tx.insert(inventory).values({ storeProductId: sp.id, onHand: patch.onHand, reserved: 0 });
    }
    return sp.id;
  });
}

/**
 * Parametrik model üretim işi (pipeline: parametric-v1). Geometriyi sunucuda üretip ölçek,
 * UV ve poligon doğrulaması yapar; sonucu product_models'e bağlar. Blender pipeline'ı
 * (blender-v1) kurulduğunda aynı iş tablosunu kullanır.
 */
export async function runParametricModelJob(db: Db, productId: string) {
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  if (!p) throw notFound('Ürün');
  const [dim] = await db.select().from(productDimensions).where(eq(productDimensions.productId, productId));
  const [job] = await db
    .insert(modelGenerationJobs)
    .values({ productId, pipeline: 'parametric-v1', status: 'running', input: { packagingType: p.packagingType, dimensions: dim ?? null } })
    .returning();
  try {
    if (!dim) throw new Error('Ürün ölçüleri eksik — model üretilemez');
    const spec = {
      packagingType: p.packagingType,
      width: dim.widthMm / 1000,
      height: dim.heightMm / 1000,
      depth: dim.depthMm / 1000,
      shapeVariant: p.appearance.shapeVariant,
    };
    const lods = (['high', 'low'] as const).map((detail) => {
      const g = buildProductGeometry({ ...spec, detail });
      const v = validateProductGeometry(g, dim);
      g.dispose();
      return { detail, ...v };
    });
    const issues = lods.flatMap((l) => l.issues);
    const output = { lods, dimensionsVerified: dim.verified, issues };
    await db.transaction(async (tx) => {
      await tx.update(productModels).set({ isActive: false }).where(eq(productModels.productId, productId));
      await tx.insert(productModels).values({
        productId,
        quality: p.modelQuality,
        format: 'parametric',
        params: spec,
        triangleCount: lods[0].triangleCount,
        lodLevels: lods.length,
        generatedBy: 'parametric-v1',
        jobId: job.id,
      });
      await tx
        .update(modelGenerationJobs)
        .set({ status: issues.length ? 'failed' : 'succeeded', output, error: issues.join('; ') || null, finishedAt: new Date() })
        .where(eq(modelGenerationJobs.id, job.id));
    });
    return { jobId: job.id, status: issues.length ? 'failed' : 'succeeded', output };
  } catch (e) {
    await db
      .update(modelGenerationJobs)
      .set({ status: 'failed', error: (e as Error).message, finishedAt: new Date() })
      .where(eq(modelGenerationJobs.id, job.id));
    return { jobId: job.id, status: 'failed', output: { error: (e as Error).message } };
  }
}

/** İçe aktarılan normalize ürünü kataloğa ekler ya da günceller (barkoda göre). */
export async function upsertImportedProduct(db: Db, np: NormalizedProduct, opts: { storeId?: string; defaultPriceKurus?: number }) {
  return db.transaction(async (tx) => {
    const [bc] = await tx.select().from(productBarcodes).where(eq(productBarcodes.gtin, np.gtin));
    const verification: DataVerification = np.dataSource === 'OPEN_FOOD_FACTS' ? 'SOURCE_REPORTED' : 'UNVERIFIED';
    let productId: string;
    let created = false;
    if (bc) {
      productId = bc.productId;
      await tx
        .update(products)
        .set({ name: np.name, brand: np.brand, netWeightG: np.netWeightG ?? null, volumeMl: np.volumeMl ?? null, updatedAt: new Date() })
        .where(eq(products.id, productId));
      const [dim] = await tx.select().from(productDimensions).where(eq(productDimensions.productId, productId));
      // doğrulanmış ölçülerin üzerine tahmini ölçü yazılmaz
      if (!dim?.verified && np.dimensions.source !== 'HEURISTIC_ESTIMATE') {
        await tx.update(productDimensions).set({ ...np.dimensions, updatedAt: new Date() }).where(eq(productDimensions.productId, productId));
      }
      await tx.insert(productDataSources).values({ productId, source: np.dataSource, sourceRef: np.sourceRef ?? null, license: np.dataLicense ?? null });
    } else {
      productId = await insertProduct(tx, {
        gtin: np.gtin,
        name: np.name,
        brand: np.brand,
        category: np.category,
        subcategory: np.subcategory,
        netWeightG: np.netWeightG,
        volumeMl: np.volumeMl,
        packagingType: np.packagingType,
        manufacturer: np.manufacturer,
        dimensions: np.dimensions,
        appearance: fallbackAppearance(np.gtin),
        dataSource: np.dataSource,
        sourceRef: np.sourceRef,
        dataLicense: np.dataLicense,
        verification,
        modelQuality: np.flags.includes('MISSING_DIMENSIONS') || np.flags.includes('HEURISTIC_PACKAGING') ? 'NEEDS_REVIEW' : 'PLACEHOLDER',
      });
      created = true;
      if (np.imageUrl) {
        // Uzak görsel yalnızca kaynak olarak kaydedilir; indirilip yayınlanmaz (lisans kontrolü bekler).
        await tx.insert(productAssetLicenses).values({
          productId,
          assetType: 'image',
          license: np.imageLicense ?? 'UNVERIFIED',
          sourceUrl: np.imageUrl,
          attribution: np.dataSource === 'OPEN_FOOD_FACTS' ? 'Open Food Facts katkıcıları (CC BY-SA)' : null,
          commercialUseAllowed: null,
          notes: 'Uzak görsel referansı — yayınlanmadan önce lisans/marka izni doğrulanmalı.',
        });
      }
    }
    if (opts.storeId) {
      const [sp] = await tx
        .select()
        .from(storeProducts)
        .where(and(eq(storeProducts.storeId, opts.storeId), eq(storeProducts.productId, productId)));
      if (!sp) {
        await addProductToStore(tx, {
          storeId: opts.storeId,
          productId,
          priceKurus: opts.defaultPriceKurus ?? 0,
          stock: 0,
          // fiyatı belirlenmemiş ürünler satışa kapalı başlar
          isActive: (opts.defaultPriceKurus ?? 0) > 0,
        });
      }
    }
    return { productId, created };
  });
}
