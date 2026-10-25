import { desc, eq } from 'drizzle-orm';
import { aisles, planograms, shelfLevels, shelves, storeLayouts, storeObjects, type Db } from '@realmarket/database';
import { autoFillPlanogram, type AutoFillProduct } from '@realmarket/planogram';
import { DEPARTMENTS, generateStoreLayout } from '@realmarket/store-generator';
import type { Planogram, ShelfFixture, StoreLayout, StoreLayoutParams } from '@realmarket/shared';
import { HttpError } from '../errors';
import { getStoreCatalog } from './catalog';
import { applyPlanogram, storeProductIndex } from './planograms';

const PER_LEVEL: Record<ShelfFixture['kind'], number> = {
  gondola: 2,
  cooler: 3,
  open_chiller: 3,
  produce_table: 3,
  promo_stand: 2,
};

export async function getActiveLayout(db: Db, storeId: string) {
  const [row] = await db
    .select()
    .from(storeLayouts)
    .where(eq(storeLayouts.storeId, storeId))
    .orderBy(desc(storeLayouts.version))
    .limit(1);
  return row ?? null;
}

/** Reyon kodu → otomatik planogram için ürün havuzu. */
async function productPools(db: Db, storeId: string): Promise<Map<string, AutoFillProduct[]>> {
  const catalog = await getStoreCatalog(db, storeId);
  const pools = new Map<string, AutoFillProduct[]>();
  for (const p of catalog) {
    if (!p.dimensions || !p.gtin) continue;
    const entry: AutoFillProduct = { gtin: p.gtin, ...p.dimensions };
    pools.set(p.category, [...(pools.get(p.category) ?? []), entry]);
    if (p.promotion) pools.set('PROMOSYON', [...(pools.get('PROMOSYON') ?? []), entry]);
  }
  return pools;
}

/**
 * Yeni yerleşim sürümü üretir ve kaydeder. Genişliği değişmeyen raflardaki mevcut
 * planogramlar korunur, diğer raflar reyon ürünleriyle otomatik doldurulur.
 */
export async function saveLayout(db: Db, storeId: string, params: Partial<StoreLayoutParams>): Promise<{ layout: StoreLayout; version: number; planogramIssues: number }> {
  const layout = generateStoreLayout(params);
  const errors = layout.issues.filter((i) => i.severity === 'error');
  if (errors.length) throw new HttpError(422, 'LAYOUT_INVALID', 'Mağaza yerleşimi geçersiz', layout.issues);

  const previous = await db.select().from(planograms).where(eq(planograms.storeId, storeId));
  const previousByFixture = new Map<string, Planogram>(previous.map((p) => [p.document.shelfId, p.document]));
  const current = await getActiveLayout(db, storeId);
  const version = (current?.version ?? 0) + 1;

  await db.transaction(async (tx) => {
    await tx.update(storeLayouts).set({ isActive: false }).where(eq(storeLayouts.storeId, storeId));
    const [row] = await tx
      .insert(storeLayouts)
      .values({ storeId, version, params: layout.params, layout, isActive: true })
      .returning({ id: storeLayouts.id });
    if (layout.objects.length) {
      await tx.insert(storeObjects).values(
        layout.objects.map((o) => ({
          layoutId: row.id,
          objectKey: o.id,
          type: o.type,
          position: o.position,
          rotationY: o.rotationY,
          size: o.size,
          meta: { ...(o.meta ?? {}), departmentCode: o.departmentCode },
        })),
      );
    }
    await tx.delete(shelves).where(eq(shelves.storeId, storeId));
    await tx.delete(aisles).where(eq(aisles.storeId, storeId));
    const codes = new Set(layout.shelves.map((s) => s.departmentCode));
    await tx.insert(aisles).values(
      [...codes].map((code) => ({
        id: `${storeId}/${code}`,
        storeId,
        code,
        name: DEPARTMENTS[code]?.name ?? code,
        color: DEPARTMENTS[code]?.color ?? '#888888',
      })),
    );
    await tx.insert(shelves).values(
      layout.shelves.map((s) => ({
        id: `${storeId}/${s.id}`,
        storeId,
        aisleId: `${storeId}/${s.departmentCode}`,
        layoutId: row.id,
        fixtureKey: s.id,
        kind: s.kind,
        widthMm: Math.round(s.widthM * 1000),
        depthMm: Math.round(s.depthM * 1000),
        heightMm: Math.round(s.heightM * 1000),
        position: s.position,
        rotationY: s.rotationY,
      })),
    );
    await tx.insert(shelfLevels).values(
      layout.shelves.flatMap((s) =>
        s.levels.map((l) => ({
          shelfId: `${storeId}/${s.id}`,
          levelIndex: l.index,
          heightFromBaseMm: Math.round(l.heightM * 1000),
          clearanceMm: Math.round(l.clearanceM * 1000),
          depthMm: Math.round(l.depthM * 1000),
          zOffsetMm: Math.round(l.zOffsetM * 1000),
        })),
      ),
    );
  });

  const index = await storeProductIndex(db, storeId);
  const pools = await productPools(db, storeId);
  const deptCounter = new Map<string, number>();
  let planogramIssues = 0;
  for (const shelf of layout.shelves) {
    const offset = deptCounter.get(shelf.departmentCode) ?? 0;
    deptCounter.set(shelf.departmentCode, offset + 1);
    const prev = previousByFixture.get(shelf.id);
    let applied = false;
    if (prev && Math.abs(prev.fixture.widthMm - shelf.widthM * 1000) <= 1) {
      const r = await applyPlanogram(db, { storeId, planogram: prev, source: 'preserved', index });
      applied = r.saved;
    }
    if (!applied) {
      const pool = pools.get(shelf.departmentCode) ?? [];
      if (!pool.length) continue;
      const doc = autoFillPlanogram({ storeId, shelf, products: pool, offset, perLevel: PER_LEVEL[shelf.kind] });
      const r = await applyPlanogram(db, { storeId, planogram: doc, source: 'generated', index });
      if (!r.saved) planogramIssues++;
    }
  }
  return { layout, version, planogramIssues };
}
