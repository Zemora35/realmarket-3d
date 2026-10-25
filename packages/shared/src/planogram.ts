import { z } from 'zod';

/**
 * RealMarket Planogram Format (RMPF) v1 — açık JSON planogram standardı.
 * Ayrıntılı açıklama: PLANOGRAM_FORMAT.md. Tüm ölçüler milimetredir.
 */
export const planogramLevelSchema = z.object({
  index: z.number().int().min(0),
  /** Raf tablasının üst yüzeyinin zeminden yüksekliği. */
  heightFromBaseMm: z.number().min(0).max(3000),
  /** Ürün için kullanılabilir dikey boşluk (bir üst tablaya kadar). */
  clearanceMm: z.number().positive().max(1500),
  /** Bu katın kullanılabilir derinliği (varsayılan: fixture derinliği). */
  depthMm: z.number().positive().max(2000).optional(),
  /** Katın fixture önünden geriye doğru ofseti (basamaklı raflar için). */
  zOffsetMm: z.number().min(0).max(2000).optional(),
});
export type PlanogramLevel = z.infer<typeof planogramLevelSchema>;

export const planogramFixtureSchema = z.object({
  kind: z.enum(['gondola', 'cooler', 'open_chiller', 'produce_table', 'promo_stand']),
  widthMm: z.number().positive().max(20000),
  depthMm: z.number().positive().max(3000),
  heightMm: z.number().positive().max(4000),
  levels: z.array(planogramLevelSchema).min(1).max(12),
});
export type PlanogramFixture = z.infer<typeof planogramFixtureSchema>;

export const planogramItemSchema = z.object({
  gtin: z.string().min(8).max(14),
  levelIndex: z.number().int().min(0),
  facings: z.number().int().min(1).max(60),
  /** Ürün bloğunun sol kenarının fixture sol kenarına uzaklığı. Yoksa sıralı otomatik yerleşim. */
  positionXMm: z.number().min(0).optional(),
  /** Derinlik yönünde arka arkaya ürün sayısı. Yoksa kat derinliğinden hesaplanır. */
  depthCount: z.number().int().min(1).max(40).optional(),
  /** Üst üste istif sayısı. */
  stackCount: z.number().int().min(1).max(8).optional(),
  orientation: z.enum(['front', 'side', 'top']).default('front'),
  /** Hedef ürün miktarı (bilgi amaçlı). */
  quantity: z.number().int().min(0).optional(),
});
/** Girdi tipi: varsayılanı olan alanlar (orientation) isteğe bağlıdır. */
export type PlanogramItem = z.input<typeof planogramItemSchema>;

export const planogramSchema = z.object({
  format: z.literal('realmarket-planogram'),
  version: z.literal(1),
  storeId: z.string().min(1),
  planogramId: z.string().min(1),
  aisleId: z.string().min(1),
  shelfId: z.string().min(1),
  name: z.string().optional(),
  fixture: planogramFixtureSchema,
  items: z.array(planogramItemSchema),
});
export type Planogram = z.input<typeof planogramSchema>;

export type PlanogramIssueCode =
  | 'UNKNOWN_PRODUCT'
  | 'SHELF_OVERFLOW'
  | 'HEIGHT_COLLISION'
  | 'DEPTH_OVERFLOW'
  | 'SLOT_OVERLAP'
  | 'INVALID_LEVEL'
  | 'UNVERIFIED_DIMENSIONS'
  | 'MISSING_DIMENSIONS';

export interface PlanogramIssue {
  code: PlanogramIssueCode;
  severity: 'error' | 'warning';
  message: string;
  gtin?: string;
  levelIndex?: number;
}

/** Planogramdan hesaplanan, 3D motorunun kullandığı raf yuvası. */
export interface SlotPlacement {
  slotId: string;
  shelfId: string;
  gtin: string;
  levelIndex: number;
  /** Bloğun sol kenarı (fixture sol kenarından, mm). */
  xMm: number;
  /** Ürünün oturduğu tabla yüksekliği (mm). */
  yMm: number;
  /** Bloğun ön yüzünün fixture önünden ofseti (mm). */
  zMm: number;
  unitWidthMm: number;
  unitHeightMm: number;
  unitDepthMm: number;
  facings: number;
  depthCount: number;
  stackCount: number;
  capacity: number;
  dimensionsVerified: boolean;
}
