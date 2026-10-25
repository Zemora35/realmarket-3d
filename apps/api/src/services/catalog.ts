import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  inventory,
  productAssetLicenses,
  productBarcodes,
  productDataSources,
  productDimensions,
  productImages,
  productModels,
  products,
  storePrices,
  storeProducts,
  type Db,
} from '@realmarket/database';
import type { AssetLicense, DataSource, DataVerification, ImageView, ModelQuality, SceneProduct } from '@realmarket/shared';

/** Mağazanın ürünlerini katalog + satış verisiyle birlikte döndürür. */
export async function getStoreCatalog(db: Db, storeId: string, options: { includeInactive?: boolean } = {}): Promise<SceneProduct[]> {
  const rows = await db
    .select({ sp: storeProducts, p: products, bc: productBarcodes, dim: productDimensions, price: storePrices, inv: inventory })
    .from(storeProducts)
    .innerJoin(products, eq(products.id, storeProducts.productId))
    .leftJoin(productBarcodes, and(eq(productBarcodes.productId, products.id), eq(productBarcodes.isPrimary, true)))
    .leftJoin(productDimensions, eq(productDimensions.productId, products.id))
    .leftJoin(storePrices, and(eq(storePrices.storeProductId, storeProducts.id), eq(storePrices.isCurrent, true)))
    .leftJoin(inventory, eq(inventory.storeProductId, storeProducts.id))
    .where(options.includeInactive ? eq(storeProducts.storeId, storeId) : and(eq(storeProducts.storeId, storeId), eq(storeProducts.isActive, true)))
    .orderBy(products.category, products.name);

  const productIds = rows.map((r) => r.p.id);
  const images = productIds.length
    ? await db
        .select({ img: productImages, lic: productAssetLicenses })
        .from(productImages)
        .leftJoin(productAssetLicenses, eq(productAssetLicenses.id, productImages.licenseId))
        .where(inArray(productImages.productId, productIds))
        .orderBy(desc(productImages.id))
    : [];
  const sources = productIds.length
    ? await db.select().from(productDataSources).where(inArray(productDataSources.productId, productIds)).orderBy(desc(productDataSources.id))
    : [];
  const models = productIds.length
    ? await db
        .select()
        .from(productModels)
        .where(and(inArray(productModels.productId, productIds), eq(productModels.isActive, true)))
        .orderBy(desc(productModels.id))
    : [];

  return rows.map(({ sp, p, bc, dim, price, inv }) => {
    const source = sources.find((s) => s.productId === p.id);
    const model = models.find((m) => m.productId === p.id);
    return {
      id: p.id,
      gtin: bc?.gtin ?? '',
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      netWeightG: p.netWeightG,
      volumeMl: p.volumeMl,
      packagingType: p.packagingType,
      dimensions: dim
        ? { widthMm: dim.widthMm, heightMm: dim.heightMm, depthMm: dim.depthMm, verified: dim.verified, source: dim.source }
        : null,
      grossWeightG: p.grossWeightG,
      manufacturer: p.manufacturer,
      dataSource: (source?.source ?? 'MANUAL') as DataSource,
      verification: p.verification as DataVerification,
      modelQuality: p.modelQuality as ModelQuality,
      modelUrl: model?.url ?? null,
      appearance: p.appearance,
      images: images
        .filter((i) => i.img.productId === p.id)
        .map((i) => ({
          id: i.img.id,
          url: i.img.url,
          view: i.img.view as ImageView,
          license: (i.lic?.license ?? 'UNVERIFIED') as AssetLicense,
          attribution: i.lic?.attribution ?? null,
        })),
      isDemo: p.isDemo,
      storeProductId: sp.id,
      storeSku: sp.storeSku,
      priceKurus: price?.priceKurus ?? 0,
      listPriceKurus: price?.listPriceKurus ?? null,
      promotion: price?.promotion ?? null,
      available: inv ? inv.onHand - inv.reserved : 0,
      isActive: sp.isActive,
    } satisfies SceneProduct;
  });
}
