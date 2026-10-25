import { and, eq } from 'drizzle-orm';
import {
  planogramItems,
  planograms,
  productBarcodes,
  productDimensions,
  shelfLevels,
  shelfSlots,
  shelves,
  storeProducts,
  type Db,
} from '@realmarket/database';
import { computePlacements, type PlacementResult } from '@realmarket/planogram';
import type { Planogram, PlanogramIssue } from '@realmarket/shared';
import { HttpError } from '../errors';

export interface StoreProductIndexEntry {
  storeProductId: string;
  productId: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  verified: boolean;
}

/** gtin → mağaza ürünü + ölçüler. */
export async function storeProductIndex(db: Db, storeId: string): Promise<Map<string, StoreProductIndexEntry>> {
  const rows = await db
    .select({ sp: storeProducts, bc: productBarcodes, dim: productDimensions })
    .from(storeProducts)
    .innerJoin(productBarcodes, eq(productBarcodes.productId, storeProducts.productId))
    .leftJoin(productDimensions, eq(productDimensions.productId, storeProducts.productId))
    .where(eq(storeProducts.storeId, storeId));
  const map = new Map<string, StoreProductIndexEntry>();
  for (const r of rows) {
    if (!r.dim) continue;
    map.set(r.bc.gtin, {
      storeProductId: r.sp.id,
      productId: r.sp.productId,
      widthMm: r.dim.widthMm,
      heightMm: r.dim.heightMm,
      depthMm: r.dim.depthMm,
      verified: r.dim.verified,
    });
  }
  return map;
}

export function evaluatePlanogram(planogram: Planogram, index: Map<string, StoreProductIndexEntry>): PlacementResult {
  return computePlacements(planogram, (gtin) => index.get(gtin) ?? null);
}

export interface ApplyResult extends PlacementResult {
  saved: boolean;
  shelfId: string;
}

/**
 * Planogramı fiziksel rafa uygular: raf katlarını planogram tanımına göre yeniden kurar,
 * yuvaları hesaplar ve kaydeder. Hata seviyesinde sorun varsa kaydetmez.
 */
export async function applyPlanogram(
  db: Db,
  args: { storeId: string; planogram: Planogram; source: string; index?: Map<string, StoreProductIndexEntry> },
): Promise<ApplyResult> {
  const { storeId, planogram } = args;
  if (planogram.storeId !== storeId) throw new HttpError(400, 'STORE_MISMATCH', 'Planogram başka bir mağazaya ait');
  const shelfDbId = `${storeId}/${planogram.shelfId}`;
  const [shelf] = await db.select().from(shelves).where(eq(shelves.id, shelfDbId));
  if (!shelf) throw new HttpError(404, 'SHELF_NOT_FOUND', `Raf bulunamadı: ${planogram.shelfId}`);

  const [sameId] = await db.select({ shelfId: planograms.shelfId }).from(planograms).where(eq(planograms.id, `${storeId}/${planogram.planogramId}`));
  if (sameId && sameId.shelfId !== shelfDbId) {
    throw new HttpError(409, 'PLANOGRAM_ID_IN_USE', `${planogram.planogramId} kimliği başka bir rafta kullanılıyor`);
  }

  const index = args.index ?? (await storeProductIndex(db, storeId));
  const result = evaluatePlanogram(planogram, index);
  const extra: PlanogramIssue[] = [];
  if (Math.abs(planogram.fixture.widthMm - shelf.widthMm) > 1) {
    extra.push({
      code: 'SHELF_OVERFLOW',
      severity: 'error',
      message: `Planogram genişliği (${planogram.fixture.widthMm} mm) fiziksel raf genişliğinden (${shelf.widthMm} mm) farklı`,
    });
  }
  const tallest = Math.max(...planogram.fixture.levels.map((l) => l.heightFromBaseMm + l.clearanceMm));
  if (tallest > shelf.heightMm + 400) {
    extra.push({ code: 'HEIGHT_COLLISION', severity: 'error', message: 'Planogram katları raf yüksekliğini aşıyor' });
  }
  const issues = [...extra, ...result.issues];
  if (issues.some((i) => i.severity === 'error')) {
    return { ...result, issues, saved: false, shelfId: planogram.shelfId };
  }

  await db.transaction(async (tx) => {
    await tx.delete(planograms).where(eq(planograms.shelfId, shelfDbId));
    await tx.insert(planograms).values({
      id: `${storeId}/${planogram.planogramId}`,
      storeId,
      shelfId: shelfDbId,
      aisleId: planogram.aisleId,
      name: planogram.name ?? null,
      document: planogram,
      fillRatio: result.fillRatio,
      issues,
      source: args.source,
    });
    if (planogram.items.length) {
      await tx.insert(planogramItems).values(
        planogram.items.map((it) => ({
          planogramId: `${storeId}/${planogram.planogramId}`,
          gtin: it.gtin,
          productId: index.get(it.gtin)?.productId ?? null,
          levelIndex: it.levelIndex,
          facings: it.facings,
          positionXMm: it.positionXMm ?? null,
          depthCount: it.depthCount ?? null,
          stackCount: it.stackCount ?? null,
          orientation: it.orientation ?? 'front',
          quantity: it.quantity ?? null,
        })),
      );
    }
    await tx.delete(shelfLevels).where(eq(shelfLevels.shelfId, shelfDbId));
    await tx.insert(shelfLevels).values(
      planogram.fixture.levels.map((l) => ({
        shelfId: shelfDbId,
        levelIndex: l.index,
        heightFromBaseMm: Math.round(l.heightFromBaseMm),
        clearanceMm: Math.round(l.clearanceMm),
        depthMm: Math.round(l.depthMm ?? planogram.fixture.depthMm),
        zOffsetMm: Math.round(l.zOffsetMm ?? 0),
      })),
    );
    await tx.delete(shelfSlots).where(eq(shelfSlots.shelfId, shelfDbId));
    if (result.slots.length) {
      await tx.insert(shelfSlots).values(
        result.slots.map((s) => ({
          id: `${storeId}/${s.slotId}`,
          shelfId: shelfDbId,
          planogramId: `${storeId}/${planogram.planogramId}`,
          storeProductId: index.get(s.gtin)!.storeProductId,
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
        })),
      );
    }
  });
  return { ...result, issues, saved: true, shelfId: planogram.shelfId };
}

export async function getPlanogramForShelf(db: Db, storeId: string, fixtureKey: string) {
  const [row] = await db
    .select()
    .from(planograms)
    .where(and(eq(planograms.storeId, storeId), eq(planograms.shelfId, `${storeId}/${fixtureKey}`)));
  return row ?? null;
}
