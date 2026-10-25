import { asc, eq } from 'drizzle-orm';
import { shelfLevels, shelfSlots, shelves, stores, type Db } from '@realmarket/database';
import type { SceneData, SceneSlot } from '@realmarket/shared';
import { notFound } from '../errors';
import { getStoreCatalog } from './catalog';
import { getActiveLayout } from './layout';

const cache = new Map<string, { data: SceneData; at: number }>();
const TTL_MS = 30_000;

/** Yönetim işlemleri sahneyi değiştirdiğinde çağrılır. */
export function invalidateScene(storeId?: string) {
  if (storeId) cache.delete(storeId);
  else cache.clear();
}

/**
 * 3D sahne verisi: yerleşim + raf katları (veritabanından) + ürünler + yuvalar.
 * Görünen adet, kullanılabilir stok (eldeki − sepetlerde ayrılmış) yuvalara dağıtılarak bulunur.
 */
export async function buildScene(db: Db, storeId: string): Promise<SceneData> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId));
  if (!store) throw notFound('Mağaza');
  const layoutRow = await getActiveLayout(db, storeId);
  if (!layoutRow) throw notFound('Mağaza yerleşimi');

  const shelfRows = await db.select().from(shelves).where(eq(shelves.storeId, storeId));
  const levelRows = await db
    .select({ l: shelfLevels })
    .from(shelfLevels)
    .innerJoin(shelves, eq(shelves.id, shelfLevels.shelfId))
    .where(eq(shelves.storeId, storeId))
    .orderBy(asc(shelfLevels.levelIndex));
  const levelsByShelf = new Map<string, typeof levelRows>();
  for (const r of levelRows) levelsByShelf.set(r.l.shelfId, [...(levelsByShelf.get(r.l.shelfId) ?? []), r]);

  const layout = structuredClone(layoutRow.layout);
  const shelfKeys = new Set(shelfRows.map((s) => s.fixtureKey));
  layout.shelves = layout.shelves
    .filter((s) => shelfKeys.has(s.id))
    .map((s) => {
      const lv = levelsByShelf.get(`${storeId}/${s.id}`);
      if (!lv?.length) return s;
      return {
        ...s,
        levels: lv.map(({ l }) => ({
          index: l.levelIndex,
          heightM: l.heightFromBaseMm / 1000,
          clearanceM: l.clearanceMm / 1000,
          depthM: l.depthMm / 1000,
          zOffsetM: l.zOffsetMm / 1000,
        })),
      };
    });

  const products = await getStoreCatalog(db, storeId);
  const byStoreProduct = new Map(products.map((p) => [p.storeProductId, p]));
  const slotRows = await db
    .select({ s: shelfSlots })
    .from(shelfSlots)
    .innerJoin(shelves, eq(shelves.id, shelfSlots.shelfId))
    .where(eq(shelves.storeId, storeId))
    .orderBy(asc(shelfSlots.id));

  // Kullanılabilir stok, ürünün yuvalarına kapasiteleriyle orantılı dağıtılır:
  // stok azaldığında raflar boşalmak yerine ön sıradan kısmen dolu görünür.
  const capacityByProduct = new Map<string, number>();
  for (const { s } of slotRows) capacityByProduct.set(s.storeProductId, (capacityByProduct.get(s.storeProductId) ?? 0) + s.capacity);
  const allocated = new Map<string, number>();
  const slots: SceneSlot[] = [];
  for (const { s } of slotRows) {
    const product = byStoreProduct.get(s.storeProductId);
    if (!product) continue; // pasif ürünler rafta gösterilmez
    const available = Math.max(0, product.available);
    const totalCap = capacityByProduct.get(s.storeProductId) ?? 0;
    let visibleUnits = available >= totalCap ? s.capacity : Math.floor((available * s.capacity) / Math.max(1, totalCap));
    // yuvarlama artığı sıradaki yuvalara
    const used = allocated.get(s.storeProductId) ?? 0;
    visibleUnits = Math.min(s.capacity, visibleUnits, available - used);
    allocated.set(s.storeProductId, used + visibleUnits);
    slots.push({
      slotId: s.id,
      shelfId: s.shelfId.slice(storeId.length + 1),
      gtin: product.gtin,
      levelIndex: s.levelIndex,
      xMm: s.xMm,
      yMm: s.yMm,
      zMm: s.zMm,
      unitWidthMm: s.unitWidthMm,
      unitHeightMm: s.unitHeightMm,
      unitDepthMm: s.unitDepthMm,
      facings: s.facings,
      depthCount: s.depthCount,
      stackCount: s.stackCount,
      capacity: s.capacity,
      dimensionsVerified: s.dimensionsVerified,
      productId: product.id,
      storeProductId: s.storeProductId,
      visibleUnits,
    });
  }

  const data: SceneData = {
    store: { id: store.id, name: store.name, isDemo: store.isDemo },
    layoutVersion: layoutRow.version,
    layout,
    products,
    slots,
    generatedAt: new Date().toISOString(),
  };
  cache.set(storeId, { data, at: Date.now() });
  return data;
}
