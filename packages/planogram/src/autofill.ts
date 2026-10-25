import type { Planogram, PlanogramFixture, PlanogramItem, ShelfFixture } from '@realmarket/shared';
import { BLOCK_GAP_MM, FACING_GAP_MM, type ProductDims } from './placement';

/** Üretilen yerleşim fixture'ını planogram fixture tanımına (mm) çevirir. */
export function fixtureToPlanogramFixture(shelf: ShelfFixture): PlanogramFixture {
  return {
    kind: shelf.kind,
    widthMm: Math.round(shelf.widthM * 1000),
    depthMm: Math.round(shelf.depthM * 1000),
    heightMm: Math.round(shelf.heightM * 1000),
    levels: shelf.levels.map((l) => ({
      index: l.index,
      heightFromBaseMm: Math.round(l.heightM * 1000),
      clearanceMm: Math.round(l.clearanceM * 1000),
      depthMm: Math.round(l.depthM * 1000),
      zOffsetMm: Math.round(l.zOffsetM * 1000),
    })),
  };
}

export interface AutoFillProduct extends ProductDims {
  gtin: string;
}

/**
 * Bir rafı verilen ürün listesiyle otomatik doldurur (demo/başlangıç planogramı).
 * Uzun ürünler alt katlara, her kata en fazla `perLevel` ürün, genişlik facing ile doldurulur.
 * `offset` aynı reyondaki rafların farklı ürün karışımı almasını sağlar.
 */
export function autoFillPlanogram(args: {
  storeId: string;
  shelf: ShelfFixture;
  products: AutoFillProduct[];
  offset?: number;
  perLevel?: number;
}): Planogram {
  const fixture = fixtureToPlanogramFixture(args.shelf);
  const perLevel = args.perLevel ?? 2;
  const offset = args.offset ?? 0;
  const items: PlanogramItem[] = [];
  const sorted = [...args.products].sort((a, b) => b.heightMm - a.heightMm || a.gtin.localeCompare(b.gtin));

  fixture.levels.forEach((level, li) => {
    const fits = sorted.filter((p) => p.heightMm <= level.clearanceMm && p.widthMm <= fixture.widthMm);
    if (!fits.length) return;
    // alt katlar daha uzun ürünleri tercih eder
    const band = Math.floor((li / Math.max(1, fixture.levels.length - 1)) * (fits.length - 1));
    const chosen: AutoFillProduct[] = [];
    for (let k = 0; k < fits.length && chosen.length < Math.min(perLevel, fits.length); k++) {
      const p = fits[(band + offset + k * 3) % fits.length];
      if (!chosen.includes(p)) chosen.push(p);
    }
    const share = (fixture.widthMm - BLOCK_GAP_MM * (chosen.length - 1)) / chosen.length;
    let x = 0;
    for (const p of chosen) {
      const facings = Math.max(1, Math.floor((share + FACING_GAP_MM) / (p.widthMm + FACING_GAP_MM)));
      const blockWidth = facings * p.widthMm + (facings - 1) * FACING_GAP_MM;
      const stackable = p.heightMm * 2 <= level.clearanceMm && p.heightMm < 90;
      items.push({
        gtin: p.gtin,
        levelIndex: level.index,
        facings,
        positionXMm: Math.round(x),
        stackCount: stackable ? 2 : undefined,
        orientation: 'front',
      });
      x += Math.max(blockWidth, share) + BLOCK_GAP_MM;
    }
  });

  return {
    format: 'realmarket-planogram',
    version: 1,
    storeId: args.storeId,
    planogramId: `PG-${args.shelf.id}`,
    aisleId: args.shelf.departmentCode,
    shelfId: args.shelf.id,
    name: `${args.shelf.id} otomatik planogram`,
    fixture,
    items,
  };
}
