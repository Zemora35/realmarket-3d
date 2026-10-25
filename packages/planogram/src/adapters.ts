import { planogramSchema, type Planogram, type PlanogramFixture } from '@realmarket/shared';
import { parseCsv } from './csv';

export interface PlanogramImportResult {
  planograms: Planogram[];
  errors: { row?: number; message: string }[];
}

/** Planogram dosya biçimleri için adaptör arayüzü (JSON, CSV, ileride PLN). */
export interface PlanogramAdapter {
  format: string;
  description: string;
  supported: boolean;
  read(content: string, defaults: { storeId: string }): PlanogramImportResult;
}

export const jsonAdapter: PlanogramAdapter = {
  format: 'json',
  description: 'RealMarket Planogram Format v1 (tek nesne veya dizi)',
  supported: true,
  read(content) {
    const errors: PlanogramImportResult['errors'] = [];
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (e) {
      return { planograms: [], errors: [{ message: `Geçersiz JSON: ${(e as Error).message}` }] };
    }
    const list = Array.isArray(data) ? data : [data];
    const planograms: Planogram[] = [];
    list.forEach((entry, i) => {
      const parsed = planogramSchema.safeParse(entry);
      if (parsed.success) planograms.push(parsed.data);
      else errors.push({ row: i, message: parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
    });
    return { planograms, errors };
  },
};

/**
 * CSV sütunları (başlık satırı zorunlu, ayraç , veya ;):
 * planogram_id, shelf_id, aisle_id, shelf_width_mm, shelf_depth_mm, shelf_height_mm,
 * level_heights_mm ("120|500|880"), level_index, gtin, facings, [position_x_mm], [depth_count], [stack_count], [orientation], [kind]
 */
export const csvAdapter: PlanogramAdapter = {
  format: 'csv',
  description: 'Satır başına bir planogram kalemi (CSV/Excel "CSV olarak kaydet")',
  supported: true,
  read(content, defaults) {
    const rows = parseCsv(content);
    const errors: PlanogramImportResult['errors'] = [];
    const groups = new Map<string, Planogram>();
    const num = (v: string | undefined) => (v === undefined || v === '' ? undefined : Number(v.replace(',', '.')));
    rows.forEach((r, i) => {
      const rowNo = i + 2;
      const required = ['planogram_id', 'shelf_id', 'shelf_width_mm', 'shelf_depth_mm', 'shelf_height_mm', 'level_heights_mm', 'level_index', 'gtin', 'facings'];
      const missing = required.filter((k) => !r[k]);
      if (missing.length) {
        errors.push({ row: rowNo, message: `Eksik sütun(lar): ${missing.join(', ')}` });
        return;
      }
      let pg = groups.get(r.planogram_id);
      if (!pg) {
        const heights = r.level_heights_mm.split(/[|/]/).map((h) => Number(h.trim()));
        const shelfHeight = num(r.shelf_height_mm)!;
        if (heights.some((h) => !Number.isFinite(h))) {
          errors.push({ row: rowNo, message: 'level_heights_mm sayısal olmalı (ör. 120|500|880)' });
          return;
        }
        const fixture: PlanogramFixture = {
          kind: (r.kind as PlanogramFixture['kind']) || 'gondola',
          widthMm: num(r.shelf_width_mm)!,
          depthMm: num(r.shelf_depth_mm)!,
          heightMm: shelfHeight,
          levels: heights.map((h, idx) => ({
            index: idx,
            heightFromBaseMm: h,
            // en üst kat: fixture tepesinin 30 cm üstüne kadar, en fazla 450 mm
            clearanceMm: Math.max(50, idx + 1 < heights.length ? heights[idx + 1] - h - 30 : Math.min(450, shelfHeight + 300 - h)),
          })),
        };
        pg = {
          format: 'realmarket-planogram',
          version: 1,
          storeId: r.store_id || defaults.storeId,
          planogramId: r.planogram_id,
          aisleId: r.aisle_id || 'GENEL',
          shelfId: r.shelf_id,
          fixture,
          items: [],
        };
        groups.set(r.planogram_id, pg);
      }
      pg.items.push({
        gtin: r.gtin,
        levelIndex: num(r.level_index)!,
        facings: num(r.facings)!,
        positionXMm: num(r.position_x_mm),
        depthCount: num(r.depth_count),
        stackCount: num(r.stack_count),
        orientation: (r.orientation as 'front' | 'side' | 'top') || 'front',
      });
    });
    const planograms: Planogram[] = [];
    for (const pg of groups.values()) {
      const parsed = planogramSchema.safeParse(pg);
      if (parsed.success) planograms.push(parsed.data);
      else errors.push({ message: `${pg.planogramId}: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}` });
    }
    return { planograms, errors };
  },
};

/**
 * NielsenIQ Spaceman PLN: kapalı/özel bir ikili biçimdir ve kamuya açık resmî bir
 * şartnamesi yoktur. İzinli bir okuma yöntemi (resmî SDK, dışa aktarım veya lisanslı
 * belge) olmadan bu adaptör uygulanmaz. Spaceman'dan CSV/XML dışa aktarım + csvAdapter
 * önerilen yoldur.
 */
export const plnAdapter: PlanogramAdapter = {
  format: 'pln',
  description: 'Spaceman PLN — desteklenmiyor (belgelenmiş/izinli okuma yöntemi yok)',
  supported: false,
  read() {
    return {
      planograms: [],
      errors: [
        {
          message:
            'Spaceman PLN biçimi henüz desteklenmiyor: kamuya açık şartname yok. Spaceman içinden CSV dışa aktarıp CSV adaptörünü kullanın.',
        },
      ],
    };
  },
};

export const PLANOGRAM_ADAPTERS: Record<string, PlanogramAdapter> = {
  json: jsonAdapter,
  csv: csvAdapter,
  pln: plnAdapter,
};
