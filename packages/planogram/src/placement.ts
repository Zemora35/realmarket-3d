import type { Planogram, PlanogramIssue, PlanogramItem, SlotPlacement } from '@realmarket/shared';

export interface ProductDims {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  verified: boolean;
}

export type DimsLookup = (gtin: string) => ProductDims | null | undefined;

export interface PlacementResult {
  slots: SlotPlacement[];
  issues: PlanogramIssue[];
  /** Kullanılan raf genişliğinin toplam raf genişliğine oranı (0–1+). */
  fillRatio: number;
}

/** Ürünler arası yatay boşluk (mm). */
export const FACING_GAP_MM = 2;
export const BLOCK_GAP_MM = 6;

function orient(dims: ProductDims, orientation: PlanogramItem['orientation']) {
  switch (orientation) {
    case 'side':
      return { w: dims.depthMm, h: dims.heightMm, d: dims.widthMm };
    case 'top':
      return { w: dims.widthMm, h: dims.depthMm, d: dims.heightMm };
    default:
      return { w: dims.widthMm, h: dims.heightMm, d: dims.depthMm };
  }
}

/**
 * Planogramı raf yuvalarına dönüştürür; taşma, çakışma, yükseklik ve
 * ölçü doğrulama sorunlarını raporlar. Saf fonksiyon: aynı girdi => aynı çıktı.
 */
export function computePlacements(planogram: Planogram, lookup: DimsLookup): PlacementResult {
  const issues: PlanogramIssue[] = [];
  const slots: SlotPlacement[] = [];
  const { fixture } = planogram;
  const levels = new Map(fixture.levels.map((l) => [l.index, l]));
  const cursors = new Map<number, number>();
  let usedWidth = 0;

  planogram.items.forEach((item, idx) => {
    const level = levels.get(item.levelIndex);
    if (!level) {
      issues.push({
        code: 'INVALID_LEVEL',
        severity: 'error',
        message: `${item.gtin}: ${item.levelIndex}. kat bu rafta yok`,
        gtin: item.gtin,
        levelIndex: item.levelIndex,
      });
      return;
    }
    const dims = lookup(item.gtin);
    if (!dims) {
      issues.push({
        code: 'UNKNOWN_PRODUCT',
        severity: 'error',
        message: `${item.gtin} barkodlu ürün katalogda yok`,
        gtin: item.gtin,
        levelIndex: item.levelIndex,
      });
      return;
    }
    if (!dims.verified) {
      issues.push({
        code: 'UNVERIFIED_DIMENSIONS',
        severity: 'warning',
        message: `${item.gtin}: ürün ölçüleri doğrulanmamış (yaklaşık yerleşim)`,
        gtin: item.gtin,
        levelIndex: item.levelIndex,
      });
    }
    const { w, h, d } = orient(dims, item.orientation ?? 'front');
    const levelDepth = level.depthMm ?? fixture.depthMm;
    const depthCount = item.depthCount ?? Math.max(1, Math.floor(levelDepth / d));
    const stackCount = item.stackCount ?? 1;
    const blockWidth = item.facings * w + (item.facings - 1) * FACING_GAP_MM;
    const x = item.positionXMm ?? cursors.get(item.levelIndex) ?? 0;
    cursors.set(item.levelIndex, x + blockWidth + BLOCK_GAP_MM);
    usedWidth += blockWidth;

    if (x + blockWidth > fixture.widthMm + 0.5) {
      issues.push({
        code: 'SHELF_OVERFLOW',
        severity: 'error',
        message: `${item.gtin}: ${item.facings} facing raf genişliğini ${Math.round(x + blockWidth - fixture.widthMm)} mm aşıyor`,
        gtin: item.gtin,
        levelIndex: item.levelIndex,
      });
    }
    if (h * stackCount > level.clearanceMm + 0.5) {
      issues.push({
        code: 'HEIGHT_COLLISION',
        severity: 'error',
        message: `${item.gtin}: ürün yüksekliği (${Math.round(h * stackCount)} mm) kat boşluğunu (${level.clearanceMm} mm) aşıyor`,
        gtin: item.gtin,
        levelIndex: item.levelIndex,
      });
    }
    if (depthCount * d > levelDepth + 0.5) {
      issues.push({
        code: 'DEPTH_OVERFLOW',
        severity: 'warning',
        message: `${item.gtin}: ${depthCount} sıra derinlik kat derinliğini aşıyor`,
        gtin: item.gtin,
        levelIndex: item.levelIndex,
      });
    }

    slots.push({
      slotId: `${planogram.shelfId}-L${item.levelIndex}-${String(idx).padStart(2, '0')}`,
      shelfId: planogram.shelfId,
      gtin: item.gtin,
      levelIndex: item.levelIndex,
      xMm: x,
      yMm: level.heightFromBaseMm,
      zMm: level.zOffsetMm ?? 0,
      unitWidthMm: w,
      unitHeightMm: h,
      unitDepthMm: d,
      facings: item.facings,
      depthCount,
      stackCount,
      capacity: item.facings * depthCount * stackCount,
      dimensionsVerified: dims.verified,
    });
  });

  // Aynı kattaki blokların çakışması.
  const byLevel = new Map<number, SlotPlacement[]>();
  for (const s of slots) byLevel.set(s.levelIndex, [...(byLevel.get(s.levelIndex) ?? []), s]);
  for (const [levelIndex, list] of byLevel) {
    const sorted = [...list].sort((a, b) => a.xMm - b.xMm);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const prevEnd = prev.xMm + prev.facings * prev.unitWidthMm + (prev.facings - 1) * FACING_GAP_MM;
      if (sorted[i].xMm < prevEnd - 0.5) {
        issues.push({
          code: 'SLOT_OVERLAP',
          severity: 'error',
          message: `${prev.gtin} ve ${sorted[i].gtin} aynı katta çakışıyor`,
          gtin: sorted[i].gtin,
          levelIndex,
        });
      }
    }
  }

  const fillRatio = fixture.widthMm > 0 ? usedWidth / (fixture.widthMm * fixture.levels.length) : 0;
  return { slots, issues, fillRatio: Math.round(fillRatio * 1000) / 1000 };
}

/**
 * Yuva içindeki tek tek ürün birimlerinin fixture-yerel konumları (metre, taban merkezi).
 * Sıralama: önce ön sıra (müşteriye en yakın), sonra soldan sağa, sonra istif.
 * fixtureWidth/Depth: yerel orijin fixture izdüşümünün merkezidir.
 */
export function expandSlotUnits(
  slot: SlotPlacement,
  fixtureWidthM: number,
  fixtureDepthM: number,
): { x: number; y: number; z: number }[] {
  const w = slot.unitWidthMm / 1000;
  const h = slot.unitHeightMm / 1000;
  const d = slot.unitDepthMm / 1000;
  const gap = FACING_GAP_MM / 1000;
  const left = -fixtureWidthM / 2 + slot.xMm / 1000;
  const front = fixtureDepthM / 2 - slot.zMm / 1000 - 0.012;
  const out: { x: number; y: number; z: number }[] = [];
  for (let dz = 0; dz < slot.depthCount; dz++) {
    for (let f = 0; f < slot.facings; f++) {
      for (let s = 0; s < slot.stackCount; s++) {
        out.push({
          x: left + f * (w + gap) + w / 2,
          y: slot.yMm / 1000 + s * h,
          z: front - dz * d - d / 2,
        });
      }
    }
  }
  return out;
}
