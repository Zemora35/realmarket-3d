import {
  PACKAGING_TYPES,
  parseQuantity,
  validateGtin,
  type AssetLicense,
  type DataSource,
  type PackagingType,
} from '@realmarket/shared';
import { parseCsv } from '@realmarket/planogram';
import { classifyPackaging, DEFAULT_DIMENSIONS_MM } from './classify';

/** İçe aktarma sonrası normalize edilmiş katalog kaydı. */
export interface NormalizedProduct {
  gtin: string;
  name: string;
  brand: string;
  category: string;
  subcategory?: string;
  netWeightG?: number;
  volumeMl?: number;
  packagingType: PackagingType;
  packagingSource: 'input' | 'heuristic';
  dimensions: { widthMm: number; heightMm: number; depthMm: number; verified: boolean; source: string };
  manufacturer?: string;
  imageUrl?: string;
  imageLicense?: AssetLicense;
  dataSource: DataSource;
  sourceRef?: string;
  dataLicense?: AssetLicense;
  flags: ImportFlag[];
}

export type ImportFlag = 'MISSING_DIMENSIONS' | 'MISSING_IMAGE' | 'HEURISTIC_PACKAGING' | 'MISSING_BRAND' | 'MISSING_LICENSE';

export interface ImportRowError {
  index: number;
  gtin?: string;
  message: string;
}

export interface ImportReport {
  total: number;
  processed: number;
  /** Bir sonraki çalıştırmada kaldığı yerden devam için imleç. */
  cursor: number;
  done: boolean;
  accepted: number;
  merged: number;
  errors: ImportRowError[];
  missingDimensions: string[];
  missingImages: string[];
  heuristicPackaging: string[];
}

export type RawRow = Record<string, unknown>;

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v: unknown) => {
  const s = str(v).replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** CSV, JSON (dizi), JSONL içeriğini ham satırlara çevirir. */
export function parseCatalogContent(format: 'csv' | 'json' | 'jsonl', content: string): RawRow[] {
  if (format === 'csv') return parseCsv(content);
  if (format === 'json') {
    const data = JSON.parse(content);
    if (!Array.isArray(data)) throw new Error('JSON içeriği bir dizi olmalı');
    return data as RawRow[];
  }
  return content
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RawRow);
}

/** Tek ham satırı normalize eder. Alan adları: gtin|barcode|code, name|product_name, brand(s), ... */
export function normalizeRow(row: RawRow, defaults: { dataSource: DataSource; dataLicense?: AssetLicense }): NormalizedProduct {
  const gtinRaw = str(row.gtin ?? row.barcode ?? row.code ?? row.ean);
  const v = validateGtin(gtinRaw);
  if (!v.valid) throw new Error(`Barkod geçersiz (${gtinRaw || 'boş'}): ${v.error}`);
  const name = str(row.name ?? row.product_name_tr ?? row.product_name);
  if (!name) throw new Error('Ürün adı eksik');
  const brand = str(row.brand ?? row.brands).split(',')[0]?.trim() ?? '';
  const flags: ImportFlag[] = [];
  if (!brand) flags.push('MISSING_BRAND');

  const qty = parseQuantity(str(row.quantity));
  const netWeightG = num(row.net_weight_g) ?? qty.netWeightG;
  const volumeMl = num(row.volume_ml) ?? qty.volumeMl;

  const inputPackaging = str(row.packaging_type) as PackagingType;
  let packagingType: PackagingType;
  let packagingSource: 'input' | 'heuristic';
  if ((PACKAGING_TYPES as readonly string[]).includes(inputPackaging)) {
    packagingType = inputPackaging;
    packagingSource = 'input';
  } else {
    const guess = classifyPackaging(`${name} ${str(row.category ?? row.categories)} ${str(row.packaging)}`);
    packagingType = guess.packagingType;
    packagingSource = 'heuristic';
    flags.push('HEURISTIC_PACKAGING');
  }

  const w = num(row.width_mm);
  const h = num(row.height_mm);
  const d = num(row.depth_mm);
  let dimensions: NormalizedProduct['dimensions'];
  if (w && h && d) {
    dimensions = { widthMm: w, heightMm: h, depthMm: d, verified: str(row.dimensions_verified) === 'true', source: str(row.dimensions_source) || defaults.dataSource };
  } else {
    const [dw, dh, dd] = DEFAULT_DIMENSIONS_MM[packagingType];
    dimensions = { widthMm: dw, heightMm: dh, depthMm: dd, verified: false, source: 'HEURISTIC_ESTIMATE' };
    flags.push('MISSING_DIMENSIONS');
  }

  const imageUrl = str(row.image_url ?? row.image_front_url) || undefined;
  if (!imageUrl) flags.push('MISSING_IMAGE');
  const imageLicense = (str(row.image_license) as AssetLicense) || undefined;
  if (imageUrl && !imageLicense) flags.push('MISSING_LICENSE');

  return {
    gtin: v.normalized!,
    name,
    brand: brand || 'Bilinmiyor',
    category: str(row.category) || 'GENEL',
    subcategory: str(row.subcategory) || undefined,
    netWeightG,
    volumeMl,
    packagingType,
    packagingSource,
    dimensions,
    manufacturer: str(row.manufacturer) || undefined,
    imageUrl,
    imageLicense,
    dataSource: defaults.dataSource,
    sourceRef: str(row.source_ref) || undefined,
    dataLicense: defaults.dataLicense,
    flags,
  };
}

/** Aynı barkodun iki kaydını birleştirir: boş olmayan, doğrulanmış alanlar tercih edilir. */
export function mergeProducts(a: NormalizedProduct, b: NormalizedProduct): NormalizedProduct {
  const dims = a.dimensions.verified || b.dimensions.source === 'HEURISTIC_ESTIMATE' ? a.dimensions : b.dimensions;
  const merged: NormalizedProduct = {
    ...a,
    name: a.name || b.name,
    brand: a.brand !== 'Bilinmiyor' ? a.brand : b.brand,
    subcategory: a.subcategory ?? b.subcategory,
    netWeightG: a.netWeightG ?? b.netWeightG,
    volumeMl: a.volumeMl ?? b.volumeMl,
    packagingType: a.packagingSource === 'input' ? a.packagingType : b.packagingType,
    packagingSource: a.packagingSource === 'input' || b.packagingSource === 'input' ? 'input' : 'heuristic',
    dimensions: dims,
    imageUrl: a.imageUrl ?? b.imageUrl,
    imageLicense: a.imageLicense ?? b.imageLicense,
    manufacturer: a.manufacturer ?? b.manufacturer,
  };
  merged.flags = [
    ...(merged.dimensions.source === 'HEURISTIC_ESTIMATE' ? (['MISSING_DIMENSIONS'] as const) : []),
    ...(!merged.imageUrl ? (['MISSING_IMAGE'] as const) : []),
    ...(merged.packagingSource === 'heuristic' ? (['HEURISTIC_PACKAGING'] as const) : []),
    ...(merged.brand === 'Bilinmiyor' ? (['MISSING_BRAND'] as const) : []),
    ...(merged.imageUrl && !merged.imageLicense ? (['MISSING_LICENSE'] as const) : []),
  ];
  return merged;
}

/**
 * Satırları imleçten başlayarak parti parti işler. Sonuç, kesintide kaldığı yerden
 * devam edebilmek için yeni imleci içerir (API bunu asset_import_jobs tablosunda saklar).
 */
export function processCatalogBatch(
  rows: RawRow[],
  options: { cursor?: number; batchSize?: number; dataSource: DataSource; dataLicense?: AssetLicense },
): { products: NormalizedProduct[]; report: ImportReport } {
  const start = options.cursor ?? 0;
  const end = Math.min(rows.length, start + (options.batchSize ?? 500));
  const byGtin = new Map<string, NormalizedProduct>();
  const report: ImportReport = {
    total: rows.length,
    processed: end - start,
    cursor: end,
    done: end >= rows.length,
    accepted: 0,
    merged: 0,
    errors: [],
    missingDimensions: [],
    missingImages: [],
    heuristicPackaging: [],
  };
  for (let i = start; i < end; i++) {
    try {
      const p = normalizeRow(rows[i], options);
      const existing = byGtin.get(p.gtin);
      if (existing) {
        byGtin.set(p.gtin, mergeProducts(existing, p));
        report.merged++;
      } else byGtin.set(p.gtin, p);
    } catch (e) {
      report.errors.push({ index: i, gtin: str(rows[i]?.gtin ?? rows[i]?.code) || undefined, message: (e as Error).message });
    }
  }
  const products = [...byGtin.values()];
  report.accepted = products.length;
  for (const p of products) {
    if (p.flags.includes('MISSING_DIMENSIONS')) report.missingDimensions.push(p.gtin);
    if (p.flags.includes('MISSING_IMAGE')) report.missingImages.push(p.gtin);
    if (p.flags.includes('HEURISTIC_PACKAGING')) report.heuristicPackaging.push(p.gtin);
  }
  return { products, report };
}
