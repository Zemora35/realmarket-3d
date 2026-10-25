import { desc, eq, inArray } from 'drizzle-orm';
import {
  planograms,
  productAssetLicenses,
  productBarcodes,
  productDimensions,
  productImages,
  productModels,
  products,
  storeProducts,
  type Db,
} from '@realmarket/database';
import { validateGtin } from '@realmarket/shared';

export type QualityCode =
  | 'MISSING_IMAGE'
  | 'INVALID_BARCODE'
  | 'MISSING_DIMENSIONS'
  | 'UNVERIFIED_DIMENSIONS'
  | 'MODEL_SCALE'
  | 'BROKEN_UV'
  | 'MISSING_TEXTURE'
  | 'SHELF_COLLISION'
  | 'FACING_ERROR'
  | 'MISSING_LICENSE'
  | 'UNVERIFIED_LICENSE'
  | 'POLYGON_BUDGET'
  | 'TEXTURE_TOO_LARGE'
  | 'MODEL_NEEDS_REVIEW'
  | 'PLACEHOLDER_MODEL'
  | 'PLANOGRAM_ISSUE';

export interface QualityIssue {
  code: QualityCode;
  severity: 'error' | 'warning' | 'info';
  entity: 'product' | 'planogram';
  entityId: string;
  label: string;
  message: string;
}

const MAX_TEXTURE_PX = 4096;

/** Katalog ve planogramlar üzerinde kalite kontrolü (admin panelinde listelenir). */
export async function runQualityChecks(db: Db, storeId?: string): Promise<{ issues: QualityIssue[]; summary: Record<string, number> }> {
  const productRows = storeId
    ? await db
        .select({ p: products })
        .from(storeProducts)
        .innerJoin(products, eq(products.id, storeProducts.productId))
        .where(eq(storeProducts.storeId, storeId))
    : (await db.select().from(products)).map((p) => ({ p }));
  const ids = productRows.map((r) => r.p.id);
  const issues: QualityIssue[] = [];
  if (ids.length) {
    const [barcodes, dims, images, licenses, models] = await Promise.all([
      db.select().from(productBarcodes).where(inArray(productBarcodes.productId, ids)),
      db.select().from(productDimensions).where(inArray(productDimensions.productId, ids)),
      db.select().from(productImages).where(inArray(productImages.productId, ids)),
      db.select().from(productAssetLicenses).where(inArray(productAssetLicenses.productId, ids)),
      db.select().from(productModels).where(inArray(productModels.productId, ids)).orderBy(desc(productModels.id)),
    ]);
    for (const { p } of productRows) {
      const label = `${p.brand} ${p.name}`;
      const add = (code: QualityCode, severity: QualityIssue['severity'], message: string) =>
        issues.push({ code, severity, entity: 'product', entityId: p.id, label, message });
      const bc = barcodes.filter((b) => b.productId === p.id);
      if (!bc.length) add('INVALID_BARCODE', 'error', 'Barkod kaydı yok');
      for (const b of bc) if (!validateGtin(b.gtin).valid) add('INVALID_BARCODE', 'error', `Geçersiz barkod: ${b.gtin}`);
      const dim = dims.find((d) => d.productId === p.id);
      if (!dim) add('MISSING_DIMENSIONS', 'error', 'Fiziksel ölçü yok');
      else if (dim.source === 'HEURISTIC_ESTIMATE') add('MISSING_DIMENSIONS', 'warning', 'Ölçüler ambalaj tipine göre tahmin edildi');
      else if (!dim.verified) add('UNVERIFIED_DIMENSIONS', 'info', `Ölçüler doğrulanmamış (kaynak: ${dim.source})`);
      const imgs = images.filter((i) => i.productId === p.id);
      if (!imgs.length) add('MISSING_IMAGE', p.isDemo ? 'info' : 'warning', 'Ambalaj fotoğrafı yok — prosedürel etiket kullanılıyor');
      for (const i of imgs) {
        if ((i.width ?? 0) > MAX_TEXTURE_PX || (i.height ?? 0) > MAX_TEXTURE_PX) {
          add('TEXTURE_TOO_LARGE', 'warning', `Doku çok büyük (${i.width}×${i.height}); en fazla ${MAX_TEXTURE_PX}px`);
        }
        if (!i.licenseId) add('MISSING_LICENSE', 'error', `Görsel #${i.id} için lisans kaydı yok`);
      }
      const lic = licenses.filter((l) => l.productId === p.id);
      if (!lic.length) add('MISSING_LICENSE', 'warning', 'Hiçbir varlık için lisans kaydı yok');
      for (const l of lic) {
        if (l.license === 'UNVERIFIED') add('UNVERIFIED_LICENSE', 'warning', `${l.assetType} lisansı doğrulanmadı — ticari kullanım öncesi kontrol edin`);
      }
      const model = models.find((m) => m.productId === p.id && m.isActive);
      if (!model) add('MISSING_TEXTURE', 'warning', 'Aktif 3D model kaydı yok');
      if (model?.triangleCount && model.triangleCount > 6000) add('POLYGON_BUDGET', 'warning', `Aşırı poligon: ${model.triangleCount} üçgen`);
      if (p.modelQuality === 'NEEDS_REVIEW') add('MODEL_NEEDS_REVIEW', 'warning', 'Model inceleme bekliyor');
      if (p.modelQuality === 'PLACEHOLDER') add('PLACEHOLDER_MODEL', 'info', 'Yaklaşık parametrik model (gerçek ambalaj taraması değil)');
    }
  }
  const pgRows = storeId ? await db.select().from(planograms).where(eq(planograms.storeId, storeId)) : await db.select().from(planograms);
  for (const pg of pgRows) {
    for (const i of pg.issues) {
      const code: QualityCode =
        i.code === 'SLOT_OVERLAP' || i.code === 'HEIGHT_COLLISION'
          ? 'SHELF_COLLISION'
          : i.code === 'SHELF_OVERFLOW'
            ? 'FACING_ERROR'
            : i.code === 'UNVERIFIED_DIMENSIONS'
              ? 'UNVERIFIED_DIMENSIONS'
              : 'PLANOGRAM_ISSUE';
      if (code === 'UNVERIFIED_DIMENSIONS') continue; // ürün düzeyinde zaten raporlanıyor
      issues.push({ code, severity: i.severity, entity: 'planogram', entityId: pg.id, label: pg.document.shelfId, message: i.message });
    }
  }
  const summary: Record<string, number> = {};
  for (const i of issues) summary[i.code] = (summary[i.code] ?? 0) + 1;
  return { issues, summary };
}
